// Protocol/policy tests. All ClamD replies below are MOCKED, never genuine scan evidence.
import test from 'node:test';
import {createServer} from 'node:http';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm, readFile, readdir, stat, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { scannerConfig, routeScanner } from '../../../supabase/functions/_shared/scannerPolicy.ts';
import { validWorkerResult, scanBytes, cloudmersiveScanner, POLICY_VERSION } from '../../../supabase/functions/_shared/scannerProvider.ts';
import { parseVersion, parseVerdict, clamdCommand } from '../worker/clamd.mjs';
import { authorized, validJob, validateCapability, makeServer, executeJob, privateTempRoot } from '../worker/server.mjs';
const map={};globalThis.Deno={env:{get:n=>map[n]}};
const token='x'.repeat(32), attemptId='11111111-1111-4111-8111-111111111111', objectId='22222222-2222-4222-8222-222222222222';
const job={objectKind:'attachment',objectId,attemptId};
const config=()=>scannerConfig(n=>map[n]);
const input={attemptId,fileSize:3,fileSha256:createHash('sha256').update('abc').digest('hex'),mimeType:'text/plain',filename:'private.txt'};
const evidence=()=>({...input,provider:'clamav',verdict:'clean',engineVersion:'1.4.6',signatureVersion:'12345',signatureTimestamp:new Date().toISOString(),startedAt:new Date().toISOString(),completedAt:new Date().toISOString(),complete:true,withinLimits:true,policyVersion:POLICY_VERSION,workerId:'mock-worker',verificationVersion:'clamav-bounded-entries-v2',detail:null,errorCategory:null});
const listen=server=>new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));

test('default threshold routes to Cloudmersive; larger file unsupported',()=>{assert.equal(routeScanner(2_900_000,config()),'cloudmersive');assert.equal(routeScanner(2_900_001,config()),'unsupported');});
for(const value of ['NaN','0','-1','Infinity','2.5'])test(`invalid numeric configuration ${value} fails closed`,()=>assert.throws(()=>scannerConfig(n=>n==='PORTAL_CLOUDMERSIVE_MAX_BYTES'?value:undefined)));
test('fallback loops cannot be enabled',()=>assert.throws(()=>scannerConfig(n=>n==='PORTAL_SCANNER_FALLBACK_ENABLED'?'true':undefined)));
test('dual mode requires authenticated HTTPS worker',()=>{assert.throws(()=>scannerConfig(n=>({PORTAL_SCANNER_PROVIDER_MODE:'dual',PORTAL_CLAMAV_WORKER_URL:'http://localhost/',PORTAL_SCANNER_WORKER_TOKEN:token})[n]));});
test('dual routing is deterministic at exact byte boundaries',()=>{const c=scannerConfig(n=>({PORTAL_SCANNER_PROVIDER_MODE:'dual',PORTAL_CLAMAV_WORKER_URL:'https://private.example/',PORTAL_SCANNER_WORKER_TOKEN:token})[n]);assert.equal(routeScanner(2_900_001,c),'clamav');assert.equal(routeScanner(104857600,c),'clamav');assert.equal(routeScanner(104857601,c),'unsupported');});
test('provider checksum mismatch cannot be clean',async()=>assert.equal((await scanBytes({...input,fileSha256:'0'.repeat(64)},new TextEncoder().encode('abc'))).verdict,'error'));
test('valid worker evidence accepted as protocol data only',()=>assert.equal(validWorkerResult(evidence(),input),true));
for(const [field,value] of [['attemptId',objectId],['fileSha256','0'.repeat(64)],['fileSize',4],['complete',false],['withinLimits',false],['signatureTimestamp','2000-01-01'],['engineVersion','0.103'],['provider','none'],['policyVersion','old']])test(`worker ${field} mismatch rejected`,()=>assert.equal(validWorkerResult({...evidence(),[field]:value},input),false));
test('missing engine/signature data never fabricated',()=>assert.throws(()=>parseVersion('UNKNOWN')));
test('stale signature database rejected',()=>assert.throws(()=>parseVersion('ClamAV 1.4.6/12345/Mon Jan 1 00:00:00 2001')));
test('mock clean response requires exact clamd framing',()=>{assert.equal(parseVerdict('stream: OK\0').verdict,'clean');assert.notEqual(parseVerdict('unrecognized: OK').verdict,'clean');});
for(const reply of ['stream: Heuristics.Limits.Exceeded FOUND','stream: Heuristics.Encrypted.Zip FOUND','stream: timeout ERROR','stream: unsupported compression ERROR','stream: file skipped ERROR'])test(`partial/error result blocked: ${reply}`,()=>assert.notEqual(parseVerdict(reply).verdict,'clean'));
test('mock EICAR reply is infected, not a genuine-engine test',()=>assert.equal(parseVerdict('stream: Eicar-Signature FOUND').verdict,'infected'));
test('worker bearer authentication fails closed',()=>{assert(authorized(`Bearer ${token}`,token));assert(!authorized('Bearer wrong',token));assert(!authorized(undefined,token));});
test('worker rejects arbitrary paths, URLs and extra payload fields',()=>{assert(validJob(job));assert(!validJob({...job,objectId:'../private'}));assert(!validJob({...job,url:'https://attacker.invalid'}));});
test('object capabilities reject SSRF/foreign hosts/expired leases',()=>{const cap={url:'https://gcbonlvbgyhsgfayvlvz.supabase.co/storage/v1/object/sign/private?token=redacted',...input,leaseExpiresAt:new Date(Date.now()+120000).toISOString()};assert.equal(validateCapability(cap,job,'https://gcbonlvbgyhsgfayvlvz.supabase.co'),cap);assert.throws(()=>validateCapability({...cap,url:'http://127.0.0.1/'},job,'https://gcbonlvbgyhsgfayvlvz.supabase.co'));assert.throws(()=>validateCapability({...cap,leaseExpiresAt:new Date().toISOString()},job,'https://gcbonlvbgyhsgfayvlvz.supabase.co'));});
test('actual worker HTTP channel denies unauthenticated jobs',async()=>{const server=makeServer({token,projectUrl:'https://gcbonlvbgyhsgfayvlvz.supabase.co',workerId:'test'});await listen(server);try{const r=await fetch(`http://127.0.0.1:${server.address().port}/scan`,{method:'POST',body:JSON.stringify(job)});assert.equal(r.status,403);}finally{await new Promise(r=>server.close(r));}});
test('actual worker HTTP channel reports scanner unavailable, never clean',async()=>{const server=makeServer({token,projectUrl:'https://gcbonlvbgyhsgfayvlvz.supabase.co',workerId:'test'});await listen(server);try{const r=await fetch(`http://127.0.0.1:${server.address().port}/health`,{headers:{Authorization:`Bearer ${token}`}});assert.equal(r.status,503);assert.equal((await r.json()).healthy,false);}finally{await new Promise(r=>server.close(r));}});
test('bounded ZIP verifier detects genuine CRC/decompression errors',async()=>{const dir=await mkdtemp(join(tmpdir(),'sp-zip-'));try{const file=join(dir,'zip');execFileSync('python3',['-c',"import zipfile,sys; z=zipfile.ZipFile(sys.argv[1],'w');z.writestr('clean.txt','clean');z.close()",file]);assert.equal(execFileSync('python3',[new URL('../worker/verify_zip.py',import.meta.url).pathname,file],{encoding:'utf8'}).trim(),'COMPLETE');await writeFile(file,'PK malformed');assert.throws(()=>execFileSync('python3',[new URL('../worker/verify_zip.py',import.meta.url).pathname,file],{stdio:'pipe'}));}finally{await rm(dir,{recursive:true,force:true});}});

const policy=await readFile(new URL('../clamd.conf',import.meta.url),'utf8');
const {validateDaemonPolicy}=await import('../worker/daemon-policy.mjs');
test('daemon policy exact required limits accepted',()=>assert.equal(validateDaemonPolicy(policy),true));
test('daemon policy rejects disabled limit alerts',()=>assert.throws(()=>validateDaemonPolicy(policy.replace('AlertExceedsMax yes','AlertExceedsMax no'))));
test('daemon policy rejects ambiguous duplicate setting',()=>assert.throws(()=>validateDaemonPolicy(policy+'\nMaxThreads 9')));
test('daemon policy rejects lower maximum scan size',()=>assert.throws(()=>validateDaemonPolicy(policy.replace('MaxScanSize 160M','MaxScanSize 1M'))));

// The transport/provider in these cleanup tests is MOCKED. Filesystem cleanup is real.
for (const failure of [false,true]) test(`bounded temporary files cleaned after ${failure ? 'checksum failure' : 'mock success'}`,async()=>{
 const root=await mkdtemp(join(tmpdir(),'sp-worker-cleanup-'));await privateTempRoot(root);
 try{
  const cap={...input,url:'https://gcbonlvbgyhsgfayvlvz.supabase.co/storage/v1/object/sign/test',leaseExpiresAt:new Date(Date.now()+120000).toISOString()};
  const deps={command:async name=>name==='VERSION'?`ClamAV 1.4.6/12345/${new Date().toUTCString()}`:'stream: OK',fetcher:async url=>String(url).includes('/functions/')?Response.json(cap):new Response(failure?'bad':'abc')};
  const run=()=>executeJob(job,{token,projectUrl:'https://gcbonlvbgyhsgfayvlvz.supabase.co',workerId:'MOCK',tmpRoot:root},deps);
  if(failure)await assert.rejects(run(),/CHECKSUM_MISMATCH/);else assert.equal((await run()).verdict,'clean');
  assert.deepEqual(await readdir(root),[]);assert.equal((await stat(root)).mode&0o777,0o700);
 }finally{await rm(root,{recursive:true,force:true});}
});
test('restart cleanup removes interrupted private jobs only',async()=>{const root=await mkdtemp(join(tmpdir(),'sp-restart-'));try{await mkdir(join(root,'job-interrupted'));await writeFile(join(root,'job-interrupted','payload'),'synthetic');await writeFile(join(root,'keep.txt'),'unrelated');await privateTempRoot(root);assert.deepEqual(await readdir(root),['keep.txt']);}finally{await rm(root,{recursive:true,force:true});}});

test('concrete Cloudmersive adapter binds metadata without fabricating engine details (mock API)',async()=>{
 const server=createServer((req,res)=>{req.resume();req.on('end',()=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify({CleanResult:true}));});});
 await listen(server);
 try{
  const scanner=cloudmersiveScanner(new TextEncoder().encode('abc'),{apiKey:'MOCK-KEY',scanUrl:`http://127.0.0.1:${server.address().port}/scan`});
  const result=await scanner.scan(input);assert.equal(scanner.provider,'cloudmersive');assert.equal(result.verdict,'clean');assert.equal(result.complete,true);assert.equal(result.fileSha256,input.fileSha256);assert.equal(result.attemptId,attemptId);assert.equal(result.engineVersion,null);assert.equal(result.signatureVersion,null);
 }finally{await new Promise(r=>server.close(r));}
});

// Completeness proof and exact supported-version checks.
test('raw OK alone does not establish completeness',()=>{const r=parseVerdict('stream: OK');assert.equal(r.complete,false);assert.equal(r.withinLimits,false);});
test('supported native engine 1.5.4 accepted exactly',()=>assert.equal(validWorkerResult({...evidence(),engineVersion:'1.5.4'},input),true));
test('unsupported patch-prefix lookalike rejected',()=>assert.equal(validWorkerResult({...evidence(),engineVersion:'1.5.40'},input),false));
test('old worker completeness policy rejected',()=>assert.equal(validWorkerResult({...evidence(),verificationVersion:undefined},input),false));
test('ZIP completeness requires all verified entries scanned',()=>{const zipInput={...input,mimeType:'application/zip'};assert.equal(validWorkerResult({...evidence(),mimeType:'application/zip',archiveEntryCount:2,archiveEntriesScanned:1,archiveExpandedBytes:10},zipInput),false);assert.equal(validWorkerResult({...evidence(),mimeType:'application/zip',archiveEntryCount:2,archiveEntriesScanned:2,archiveExpandedBytes:10},zipInput),true);});
test('real socket early stream rejection closes cleanly',async()=>{
 const {createServer}=await import('node:net');const server=createServer(socket=>socket.once('data',()=>socket.end('INSTREAM size limit exceeded. ERROR\0')));await listen(server);
 const dir=await mkdtemp(join(tmpdir(),'sp-early-reject-'));try{const file=join(dir,'payload');await writeFile(file,Buffer.alloc(4*1024*1024));const r=await clamdCommand('INSTREAM',{file,port:server.address().port,timeoutMs:1000});assert.notEqual(parseVerdict(r).verdict,'clean');}finally{await rm(dir,{recursive:true,force:true});await new Promise(r=>server.close(r));}
});
test('whole-call deadline applies even while peer keeps sending bytes',async()=>{
 const {createServer}=await import('node:net');const server=createServer(socket=>{const interval=setInterval(()=>socket.write('progress'),5);socket.on('close',()=>clearInterval(interval));socket.on('error',()=>{});});await listen(server);
 try{await assert.rejects(clamdCommand('VERSION',{port:server.address().port,timeoutMs:40}),/SCAN_TIMEOUT/);}finally{await new Promise(r=>server.close(r));}
});

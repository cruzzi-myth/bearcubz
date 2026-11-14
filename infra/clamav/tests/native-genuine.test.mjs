// Genuine local ClamAV. Broker/object transport is synthetic in executeJob tests;
// the antivirus command itself is NEVER mocked in this file.
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm,readFile,readdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {clamdCommand,parseVersion,parseVerdict} from '../worker/clamd.mjs';
import {executeJob,privateTempRoot} from '../worker/server.mjs';
import {validWorkerResult} from '../../../supabase/functions/_shared/scannerProvider.ts';
import {daemonPolicy} from '../worker/daemon-policy.mjs';
import {EICAR,wav,mp3,pdf,png,zip} from './generated-fixtures.mjs';
await test('native generated-fixture verification', async t => {
if(process.env.RUN_GENUINE_CLAMAV!=='1')throw Error('Set RUN_GENUINE_CLAMAV=1; this suite must not silently substitute skips');
const engine=await clamdCommand('VERSION',{timeoutMs:3000});const version=parseVersion(engine);await daemonPolicy();
const root=await mkdtemp(join(tmpdir(),'sp-native-genuine-'));
const records=[];const checks=[];
const evidenceFile=new URL('../../../portal-app/docs/signal-portal/k16h2-generated-clamav-evidence.json',import.meta.url);
const digest=b=>createHash('sha256').update(b).digest('hex');
async function check(name,fn){
 await t.test(name,async()=>{const startedAt=new Date().toISOString();try{await fn();checks.push({name,status:'passed',startedAt,completedAt:new Date().toISOString()});}catch(error){checks.push({name,status:'failed',error:error.message,startedAt,completedAt:new Date().toISOString()});throw error;}});
}
t.after(async()=>{
 await writeFile(evidenceFile,JSON.stringify({verifiedAt:new Date().toISOString(),scope:'Generated fixtures only; no existing artist files or Cloudmersive requests',engineRaw:engine,...version,transportNote:'Direct ClamD protocol is real. Worker tests use synthetic broker/object responses, with the same genuine ClamD.',checks,scans:records},null,2)+'\n');
 await rm(root,{recursive:true,force:true});
});
async function scan(label,bytes,mimeType,expected){
 const path=join(root,randomUUID());await writeFile(path,bytes,{mode:0o600});
 const startedAt=new Date().toISOString();const start=performance.now();
 const raw=await clamdCommand('INSTREAM',{file:path});const result=parseVerdict(raw);
 const complete=new Date().toISOString();assert.deepEqual(parseVersion(await clamdCommand('VERSION')),version);
 records.push({label,mimeType,fileSize:bytes.length,fileSha256:digest(bytes),attemptId:randomUUID(),provider:'clamav',...version,startedAt,completedAt:complete,durationMs:Math.round((performance.now()-start)*100)/100,rawReply:raw,...result});
 if(expected==='blocked')assert.notEqual(result.verdict,'clean');else assert.equal(result.verdict,expected);
 await rm(path);
}
for(const[label,make,mime]of[
 ['MP3',mp3,'audio/mpeg'],['WAV small',()=>wav(),'audio/wav'],['WAV 25 MiB',()=>wav(25*1024*1024),'audio/wav'],['WAV 30 MiB',()=>wav(30*1024*1024),'audio/wav'],['WAV 100 MiB exact maximum',()=>wav(100*1024*1024),'audio/wav'],['PDF valid xref',pdf,'application/pdf'],['PNG valid CRC',()=>png(),'image/png'],['PNG larger than 2.9MB',()=>png(true),'image/png'],['ZIP clean',()=>zip(),'application/zip']]){
 await check(`GENUINE clean ${label}`,()=>scan(label,make(),mime,'clean'));
}
await check('GENUINE EICAR detected',()=>scan('EICAR',EICAR,'text/plain','infected'));
await check('GENUINE compressed EICAR ZIP detected',()=>scan('EICAR ZIP',zip('eicar'),'application/zip','infected'));
await check('RAW engine OK is not completeness proof for oversized expansion',async()=>{
 const bytes=zip('expanded-limit'),path=join(root,'expanded-probe.zip');await writeFile(path,bytes,{mode:0o600});
 const raw=await clamdCommand('INSTREAM',{file:path});const result=parseVerdict(raw);
 assert.equal(result.complete,false);records.push({label:'Upstream oversized-archive probe',scope:'Raw engine reply only; never accepted as application clearance',rawReply:raw,...result,fileSize:bytes.length,fileSha256:digest(bytes)});
});
await check('GENUINE oversized stream cannot be clean',()=>scan('WAV above 100MiB',wav(100*1024*1024+1),'audio/wav','blocked'));
const encryptedPath=join(root,'encrypted.zip'),plainPath=join(root,'benign.txt');await writeFile(plainPath,'Generated benign encrypted fixture',{mode:0o600});
execFileSync('/usr/bin/zip',['-q','-j','-P','fixture-only-password',encryptedPath,plainPath]);const encrypted=await readFile(encryptedPath);
await check('GENUINE encrypted ZIP is incomplete/blocked',()=>scan('Encrypted ZIP',encrypted,'application/zip','blocked'));
let workerScans=0;
async function worker(label,bytes,mimeType,{expectVerdict,expectError,wrongChecksum=false}={}){
 const attemptId=randomUUID();const job={objectKind:'attachment',objectId:randomUUID(),attemptId};
 const temp=join(root,'worker-'+randomUUID());await privateTempRoot(temp);
 const cap={url:'https://gcbonlvbgyhsgfayvlvz.supabase.co/storage/v1/object/sign/generated-fixture',attemptId,fileSize:bytes.length,fileSha256:wrongChecksum?'0'.repeat(64):digest(bytes),mimeType,leaseExpiresAt:new Date(Date.now()+150000).toISOString()};
 let sent=0;
 const fetcher=async url=>String(url).includes('/functions/')?Response.json(cap):new Response(new ReadableStream({pull(controller){if(sent>=bytes.length)return controller.close();controller.enqueue(bytes.subarray(sent,Math.min(sent+65536,bytes.length)));sent+=65536;}}));
 const command=async(...args)=>{if(args[0]==='INSTREAM')workerScans++;return clamdCommand(...args);};
 const start=new Date().toISOString();
 try{
  const run=()=>executeJob(job,{token:'synthetic-local-test-token-not-a-real-secret',projectUrl:'https://gcbonlvbgyhsgfayvlvz.supabase.co',workerId:'local-genuine-1.5.4',tmpRoot:temp},{fetcher,command});
  if(expectError){const before=workerScans;await assert.rejects(run(),expectError);assert.equal(workerScans,before);records.push({label,scope:'Worker pre-validation; synthetic transport; no engine verdict',fileSize:bytes.length,fileSha256:digest(bytes),attemptId,startedAt:start,completedAt:new Date().toISOString(),blocked:true,expectedError:String(expectError)});}
  else {const result=await run();assert.equal(result.verdict,expectVerdict);if(expectVerdict==='clean')assert.equal(result.complete,true);assert.equal(result.fileSha256,digest(bytes));assert.equal(result.attemptId,attemptId);assert.equal(validWorkerResult(result,{attemptId,fileSha256:digest(bytes),fileSize:bytes.length,mimeType,filename:'generated'}),true);records.push({label,scope:'Real worker filesystem/validation/genuine engine, synthetic broker transport',...result});}
  assert.deepEqual(await readdir(temp),[]);
 }finally{await rm(temp,{recursive:true,force:true});}
}
await check('WORKER genuine MP3 has complete evidence',()=>worker('Worker MP3',mp3(),'audio/mpeg',{expectVerdict:'clean'}));
await check('WORKER genuine PDF has complete evidence',()=>worker('Worker PDF',pdf(),'application/pdf',{expectVerdict:'clean'}));
await check('WORKER genuine 30MiB WAV binds exact bytes and cleans temporary file',()=>worker('Worker 30MiB WAV',wav(30*1024*1024),'audio/wav',{expectVerdict:'clean'}));
await check('WORKER genuine exact-maximum 100MiB WAV is complete',()=>worker('Worker 100MiB WAV',wav(100*1024*1024),'audio/wav',{expectVerdict:'clean'}));
await check('WORKER genuine large PNG binds exact bytes',()=>worker('Worker large PNG',png(true),'image/png',{expectVerdict:'clean'}));
await check('WORKER clean ZIP passes full entry CRC verification then genuine scan',()=>worker('Worker clean ZIP',zip(),'application/zip',{expectVerdict:'clean'}));
await check('WORKER near-boundary ZIP scans every decompressed entry and container',()=>worker('Worker 100MiB expansion plus 20MiB container',zip('near-boundary'),'application/zip',{expectVerdict:'clean'}));
await check('WORKER compressed EICAR ZIP reaches genuine engine and is infected',()=>worker('Worker EICAR ZIP',zip('eicar'),'application/zip',{expectVerdict:'infected'}));
await check('WORKER malformed ZIP is blocked before engine',()=>worker('Malformed ZIP',Buffer.from('PK\x03\x04malformed'),'application/zip',{expectError:/ZIP_/}));
await check('WORKER encrypted ZIP is blocked before engine',()=>worker('Encrypted ZIP policy',encrypted,'application/zip',{expectError:/ZIP_/}));
await check('WORKER nested ZIP is blocked before engine',()=>worker('Nested ZIP',zip('nested'),'application/zip',{expectError:/ZIP_/}));
await check('WORKER oversized expanded ZIP is blocked despite upstream raw OK',()=>worker('Expanded ZIP rejected',zip('expanded-limit'),'application/zip',{expectError:/ZIP_/}));
await check('WORKER high-ratio ZIP is blocked before engine',()=>worker('High expansion ZIP',zip('high-ratio'),'application/zip',{expectError:/ZIP_/}));
await check('WORKER corrupt ZIP fails CRC/decompression before engine',()=>worker('Corrupt CRC ZIP',zip('crc'),'application/zip',{expectError:/Command failed|ZIP_INCOMPLETE/}));
await check('WORKER understated expansion/CRC metadata is not trusted',()=>worker('Dishonest central sizes',zip('lying-size'),'application/zip',{expectError:/Command failed|ZIP_INCOMPLETE/}));
await check('WORKER MIME/signature mismatch is blocked before engine',()=>worker('Wrong PNG type',Buffer.from('Not a PNG'),'image/png',{expectError:/SIGNATURE_MISMATCH/}));
await check('WORKER checksum mismatch is blocked before engine',()=>worker('Wrong checksum',Buffer.from('benign'),'text/plain',{expectError:/CHECKSUM_MISMATCH/,wrongChecksum:true}));
await check('GENUINE client deadline interrupts a real large scan without clean evidence',async()=>{
 const file=join(root,'timeout.wav');await writeFile(file,wav(30*1024*1024),{mode:0o600});
 await assert.rejects(clamdCommand('INSTREAM',{file,timeoutMs:1}),/SCAN_TIMEOUT|socket|write|EPIPE|ECONNRESET|INTERRUPTED/i);
 records.push({label:'Forced 1ms client deadline',fileSize:30*1024*1024,scope:'Real interrupted ClamD transport; no clean result accepted',blocked:true});
});
await check('GENUINE unavailable endpoint cannot yield a verdict',async()=>{
 await assert.rejects(clamdCommand('VERSION',{port:33419,timeoutMs:300}),/ECONNREFUSED|SCAN_TIMEOUT/);
 records.push({label:'Unavailable test endpoint',scope:'Real connection failure; no scan or clean verdict',blocked:true});
});

});

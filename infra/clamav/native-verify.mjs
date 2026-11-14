// Generated fixtures only. No Supabase/Cloudmersive calls and no artist-file inputs.
import {spawn,execFileSync} from 'node:child_process';
import {mkdir,writeFile,readFile,open} from 'node:fs/promises';
import {userInfo} from 'node:os';
import {createServer} from 'node:net';
import {fileURLToPath} from 'node:url';
import {clamdCommand,parseVersion} from './worker/clamd.mjs';
const root='/tmp/signal-portal-clamav-generated';
const port=33410;
const binary=process.env.CLAMD_BINARY??'/opt/homebrew/opt/clamav/sbin/clamd';
const owner=userInfo().username;if(!/^[a-z0-9_-]+$/i.test(owner))throw Error('Unsupported local username');
await mkdir(root,{recursive:true,mode:0o700});await mkdir(root+'/db',{recursive:true,mode:0o700});
const conf=(await readFile(new URL('clamd.conf',import.meta.url),'utf8')).replace('User clamav',`User ${owner}`).replace('/var/lib/clamav',root+'/db').replace('/run/clamav/clamd.sock',root+'/clamd.sock').replace('TCPSocket 3310',`TCPSocket ${port}`).replace('TCPAddr 0.0.0.0','TCPAddr 127.0.0.1');
await writeFile(root+'/clamd.conf',conf,{mode:0o600});
await readFile(root+'/db/daily.cvd'); // Missing database is a real setup failure.
const probe=createServer();await new Promise((resolve,reject)=>{probe.once('error',reject);probe.listen(port,'127.0.0.1',resolve);});await new Promise(resolve=>probe.close(resolve));
const log=await open(root+'/clamd.log','w',0o600);
const env={...process.env,TZ:'UTC',CLAMD_PORT:String(port),CLAMD_CONFIG_PATH:root+'/clamd.conf',RUN_GENUINE_CLAMAV:'1'};
const daemon=spawn(binary,['--config-file='+root+'/clamd.conf','--foreground'],{env,stdio:['ignore',log.fd,log.fd]});
let exit=null;daemon.on('exit',(code,signal)=>{exit={code,signal};});
let phase='startup';const samples=[];const start=Date.now();
const sample=()=>{try{const rss=Number(execFileSync('ps',['-o','rss=','-p',String(daemon.pid)],{encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim());if(rss>0)samples.push({elapsedMs:Date.now()-start,phase,rssBytes:rss*1024});}catch{/* process exited */}};
const timer=setInterval(sample,200);timer.unref();
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
let version,testExit,reloadVerified=false;
try{
 const until=Date.now()+60000;
 while(!version){if(exit)throw Error('ClamD exited during startup');if(Date.now()>until)throw Error('ClamD startup deadline exceeded');try{version=parseVersion(await clamdCommand('VERSION',{port,timeoutMs:500}));}catch(error){if(error.message==='STALE_OR_UNSUPPORTED_ENGINE')throw error;await pause(200);}}
 sample();phase='scan-tests';
 const output=await open(root+'/native-tests.log','w',0o600);
 testExit=await new Promise((resolve,reject)=>{const child=spawn(process.execPath,['--test',fileURLToPath(new URL('tests/native-genuine.test.mjs',import.meta.url))],{env,stdio:['ignore',output.fd,output.fd]});child.once('error',reject);child.once('exit',code=>resolve(code));});await output.close();
 phase='signature-reload';const previous=(await readFile(root+'/clamd.log','utf8')).length;
 await clamdCommand('RELOAD',{port,timeoutMs:3000});
 const reloadDeadline=Date.now()+60000;
 while(Date.now()<reloadDeadline){const tail=(await readFile(root+'/clamd.log','utf8')).slice(previous);if(/Database correctly reloaded/.test(tail)){reloadVerified=true;break;}if(exit)throw Error('ClamD exited during reload');await pause(200);}
 if(!reloadVerified)throw Error('Signature reload was not confirmed');
 console.log(await readFile(root+'/native-tests.log','utf8'));
 if(testExit!==0)process.exitCode=1;
}finally{
 phase='shutdown';sample();daemon.kill('SIGTERM');
 const end=Date.now()+5000;while(!exit&&Date.now()<end)await pause(50);if(!exit)daemon.kill('SIGKILL');
 clearInterval(timer);await log.close();
 const peak=name=>Math.max(0,...samples.filter(x=>x.phase===name).map(x=>x.rssBytes));
 const evidence={verifiedAt:new Date().toISOString(),runtime:'Homebrew ClamAV; manually spawned on loopback only; no background service',engine:version??null,fixtureScope:'generated only',daemonTestPort:port,startupPeakRssBytes:peak('startup'),scanPeakRssBytes:peak('scan-tests'),signatureReloadPeakRssBytes:peak('signature-reload'),signatureDownloadPeakRssBytes:null,reloadVerified,testExit,daemonStopped:!!exit,samples};
 await writeFile(new URL('../../portal-app/docs/signal-portal/k16h2-clamav-native-resources.json',import.meta.url),JSON.stringify(evidence,null,2)+'\n');
 console.log('Native engine stopped; resource evidence recorded.');
}

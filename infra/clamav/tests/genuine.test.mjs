// Opt-in real ClamD tests. A missing daemon is SKIPPED, never represented as a pass.
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {execFileSync} from 'node:child_process';
import {clamdCommand,parseVersion,parseVerdict} from '../worker/clamd.mjs';
const enabled=process.env.RUN_GENUINE_CLAMAV==='1';
let ready=false;
if(enabled)try{parseVersion(await clamdCommand('VERSION',{timeoutMs:2000}));ready=true;}catch{/* unavailable */}
const skip=ready?false:'Supported ClamD 1.4.6 with fresh signatures is unavailable; no genuine scan performed';
function wav(size){const b=Buffer.alloc(size);b.write('RIFF');b.writeUInt32LE(size-8,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);b.writeUInt32LE(8000,24);b.writeUInt32LE(16000,28);b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(size-44,40);return b;}
const cases=[
 ['MP3',()=>execFileSync('ffmpeg',['-hide_banner','-loglevel','error','-f','lavfi','-i','anullsrc=r=44100:cl=stereo','-t','1','-b:a','128k','-f','mp3','pipe:1']),'clean'],
 ['WAV 30MB',()=>wav(30*1024*1024),'clean'],
 ['WAV 100MB',()=>wav(100*1024*1024),'clean'],
 ['PDF',()=>Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\n%%EOF'),'clean'],
 ['image',()=>Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j6Z8AAAAASUVORK5CYII=','base64'),'clean'],
 ['ZIP',()=>execFileSync('python3',['-c',"import zipfile,io,sys;b=io.BytesIO();z=zipfile.ZipFile(b,'w',zipfile.ZIP_DEFLATED);z.writestr('clean.txt','known benign fixture');z.close();sys.stdout.buffer.write(b.getvalue())"]),'clean'],
 ['EICAR',()=>Buffer.from('X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*'),'infected'],
 ['EICAR in ZIP',()=>execFileSync('python3',['-c',"import zipfile,io,sys;b=io.BytesIO();z=zipfile.ZipFile(b,'w',zipfile.ZIP_DEFLATED);z.writestr('eicar.txt','X5O!P%@AP[4\\\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*');z.close();sys.stdout.buffer.write(b.getvalue())"]),'infected'],
];
for(const[label,make,expected]of cases)test(`GENUINE ClamAV ${label}`,{skip},async()=>{const dir=await mkdtemp(join(tmpdir(),'sp-genuine-'));try{const path=join(dir,'fixture');await writeFile(path,make(),{mode:0o600});const before=parseVersion(await clamdCommand('VERSION'));const result=parseVerdict(await clamdCommand('INSTREAM',{file:path}));assert.equal(result.verdict,expected);assert.deepEqual(parseVersion(await clamdCommand('VERSION')),before);}finally{await rm(dir,{recursive:true,force:true});}});

// Local generated-fixture metadata only. No scanner and no private source access.
import {execFileSync} from 'node:child_process';
import {mkdtemp,writeFile,rm,readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const dir=await mkdtemp(join(tmpdir(),'h2-audio-'));
try{
 const mp3=execFileSync('ffmpeg',['-hide_banner','-loglevel','error','-f','lavfi','-i','anullsrc=r=44100:cl=stereo','-t','149.2','-c:a','libmp3lame','-b:a','128k','-f','mp3','pipe:1'],{maxBuffer:5*1024*1024});
 const path=join(dir,'generated.mp3');await writeFile(path,mp3,{mode:0o600});
 const probe=JSON.parse(execFileSync('ffprobe',['-v','error','-show_entries','format=duration,format_name:stream=codec_name,sample_rate,bit_rate','-of','json',path],{encoding:'utf8'}));
 const source=JSON.parse(await readFile(new URL('../../../portal-app/docs/signal-portal/k16h2-live-scan-evidence.json',import.meta.url),'utf8'));
 const sha=createHash('sha256').update(mp3).digest('hex');
 const record={fixture:'generated silence MP3',fileSize:mp3.length,sha256:sha,actualDetectedFormat:probe.format?.format_name,actualDurationSeconds:Number(probe.format?.duration),streams:probe.streams,matchesGenuineCloudmersiveFixture:source.evidence.find(e=>e.kind==='MP3')?.sha256===sha};
 if(!record.matchesGenuineCloudmersiveFixture)throw Error('Generated audio did not match the scanned fixture');
 await writeFile(new URL('../../../portal-app/docs/signal-portal/k16h2-audio-metadata.json',import.meta.url),JSON.stringify(record,null,2)+'\n');
 console.log('PASS generated MP3 independently decoded; exact scanned fixture hash matched.');
}finally{await rm(dir,{recursive:true,force:true});}

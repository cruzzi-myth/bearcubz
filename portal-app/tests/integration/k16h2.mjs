// Real isolated-development end-to-end tests. No mocked clean verdicts.
import {writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {createClient} from '@supabase/supabase-js';
import {assertSafeToRunIntegrationTests} from './_guard.mjs';
import {loadBrowserDataset} from './browser-dataset.mjs';
import {check as runCheck,summary} from './_harness.mjs';
let skipped=0;const filter=process.env.SIGNAL_PORTAL_INTEGRATION_FILTER?new RegExp(process.env.SIGNAL_PORTAL_INTEGRATION_FILTER):null;
const check=async(name,fn)=>{if(filter&&!filter.test(name)){skipped++;return;}return runCheck(name,fn);};
const safe=assertSafeToRunIntegrationTests();if(safe.projectRef!=='gcbonlvbgyhsgfayvlvz')throw Error('Wrong development target');
const client=createClient(safe.supabaseUrl,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});
const dataset=loadBrowserDataset();
const identity=createClient(safe.supabaseUrl,process.env.SUPABASE_ANON_KEY,{auth:{persistSession:false}});
const signed=await identity.auth.signInWithPassword({email:dataset.identities.admin.email,password:dataset.password});if(signed.error)throw signed.error;
const token=signed.data.session.access_token;const adminUid=signed.data.user.id;
const artist=createClient(safe.supabaseUrl,process.env.SUPABASE_ANON_KEY,{auth:{persistSession:false}});
const artistLogin=await artist.auth.signInWithPassword({email:dataset.identities.artistA.email,password:dataset.password});if(artistLogin.error)throw artistLogin.error;
const artistUid=artistLogin.data.user.id;const artistToken=artistLogin.data.session.access_token;
const collab=crypto.randomUUID(),objects=[],assets=[],feedbacks=[],attachments=[],evidence=[];
async function call(fn,body,auth=token){const response=await fetch(`${safe.supabaseUrl}/functions/v1/${fn}`,{method:'POST',headers:{apikey:process.env.SUPABASE_ANON_KEY,Authorization:`Bearer ${auth}`,'Content-Type':'application/json'},body:JSON.stringify(body)});return {status:response.status,body:await response.json()};}
const record=await client.from('collaborations').insert({id:collab,title:'K1.6H.2 isolated scan validation',artist_display_name:'Synthetic test identity',created_by:adminUid});if(record.error)throw record.error;
await client.from('collaboration_members').insert({collaboration_id:collab,user_id:artistUid,added_by:adminUid});
// Generated fixtures only. No private development asset is read or transmitted.
const mp3=execFileSync('ffmpeg',['-hide_banner','-loglevel','error','-f','lavfi','-i','anullsrc=r=44100:cl=stereo','-t','149.2','-c:a','libmp3lame','-b:a','128k','-f','mp3','pipe:1'],{maxBuffer:5*1024*1024});
const pdf=new TextEncoder().encode('%PDF-1.4\n1 0 obj <</Type /Catalog /Pages 2 0 R>> endobj\n2 0 obj <</Type /Pages /Kids [3 0 R] /Count 1>> endobj\n3 0 obj <</Type /Page /Parent 2 0 R /MediaBox [0 0 200 200]>> endobj\ntrailer <</Root 1 0 R>>\n%%EOF');
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j6Z8AAAAASUVORK5CYII=','base64');
const largePng=execFileSync('python3',['-c',"import struct,zlib,sys\ndef c(t,b):return struct.pack('>I',len(b))+t+b+struct.pack('>I',zlib.crc32(t+b))\nw=h=1024;raw=(b'\\0'+b'\\x80'*(w*3))*h\nsys.stdout.buffer.write(b'\\x89PNG\\r\\n\\x1a\\n'+c(b'IHDR',struct.pack('>IIBBBBB',w,h,8,2,0,0,0))+c(b'IDAT',zlib.compress(raw,0))+c(b'IEND',b''))"],{maxBuffer:5*1024*1024});
async function uploadAsset(label,type,mime,bytes){const requested=await call('portal-admin-request-upload-url',{collaborationId:collab,assetType:type,mimeType:mime,fileSizeBytes:bytes.length,displayLabel:`H2 ${label}`,includeThumbnail:false});if(!requested.body.assetId)throw Error(`request ${requested.status}`);const id=requested.body.assetId;assets.push(id);const row=await client.from('collaboration_assets').select('storage_bucket,storage_path').eq('id',id).single();objects.push([row.data.storage_bucket,row.data.storage_path]);const put=await fetch(requested.body.uploadUrl,{method:'PUT',headers:{'Content-Type':mime},body:bytes});if(!put.ok)throw Error('PUT failed');return id;}
function wav(size=4096){const b=Buffer.alloc(size);b.write('RIFF');b.writeUInt32LE(size-8,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);b.writeUInt32LE(8000,24);b.writeUInt32LE(16000,28);b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(size-44,40);return b;}
function zip(eicar=false){return execFileSync('python3',['-c',`import io,zipfile,sys\nb=io.BytesIO()\nwith zipfile.ZipFile(b,'w',zipfile.ZIP_DEFLATED) as z:z.writestr('test.txt',${eicar?"'X5O!P%@AP[4\\\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*'":"'Known benign collaboration test'"})\nsys.stdout.buffer.write(b.getvalue())`]);}
let firstId;
try{
 const inputs=[['MP3','audio_full','audio/mpeg',mp3],['WAV','audio_full','audio/wav',wav()],['PDF','proposal_pdf','application/pdf',pdf],['image','visual_image','image/png',png]];
 for(const [label,type,mime,bytes]of inputs){await check(`[H2 genuine Cloudmersive] ${label} exact-byte scan stays private until explicit release review`,async()=>{
  const id=await uploadAsset(label,type,mime,bytes);firstId??=id;
  const denied=await call('portal-signed-url',{assetId:id});if(denied.status!==403)return false;
  const before=await call('portal-admin-review-asset',{assetId:id,decision:'approve'});if(before.status!==409)return false;
  const confirmed=await call('portal-admin-confirm-upload',{assetId:id});
  const row=await client.from('collaboration_assets').select('*').eq('id',id).single();const r=row.data;
  evidence.push({kind:label,sha256:createHash('sha256').update(bytes).digest('hex'),bytes:bytes.length,scan:r.scan_evidence,approval:r.approval_status,confirmStatus:confirmed.status});
  const bypass=await client.from('collaboration_assets').update({upload_status:'ready'}).eq('id',id);
  if(!bypass.error||r.security_status!=='clean'||r.scan_evidence?.provider!=='cloudmersive'||r.scan_evidence.fileSha256!==createHash('sha256').update(bytes).digest('hex')||r.upload_status==='ready')return false;
  const approved=await call('portal-admin-review-asset',{assetId:id,decision:'approve'});if(approved.status!==200)return false;
  const download=await call('portal-signed-url',{assetId:id},artistToken);if(download.status!==200)return false;
  const actual=new Uint8Array(await(await fetch(download.body.url)).arrayBuffer());return createHash('sha256').update(actual).digest('hex')===r.file_sha256;
 });}
 await check('[H2] larger artwork stays private/error; artistic approval remains pending',async()=>{const bytes=largePng;const id=await uploadAsset('oversized artwork','track_cover','image/png',bytes);await call('portal-admin-confirm-upload',{assetId:id});const {data:r}=await client.from('collaboration_assets').select('*').eq('id',id).single();evidence.push({kind:'large-artwork',bytes:bytes.length,scan:r.scan_evidence,approval:r.approval_status});return r.security_status==='error'&&r.approval_status==='pending'&&(await call('portal-signed-url',{assetId:id})).status===403&&(await call('portal-admin-review-asset',{assetId:id,decision:'approve'})).status===409;});
 await check('[H2] 30MB WAV fails closed without verified ClamAV capacity',async()=>{const size=30*1024*1024;const id=await uploadAsset('30MB WAV','audio_full','audio/wav',wav(size));await call('portal-admin-confirm-upload',{assetId:id});const {data:r}=await client.from('collaboration_assets').select('*').eq('id',id).single();evidence.push({kind:'30MB WAV',bytes:size,scan:r.scan_evidence});return r.security_status==='error'&&r.upload_status!=='ready';});
 await check('[H2] 100MB request is rejected before transfer by actual storage policy',async()=>{const r=await call('portal-admin-request-upload-url',{collaborationId:collab,assetType:'audio_full',mimeType:'audio/wav',fileSizeBytes:100*1024*1024,displayLabel:'Oversized synthetic request'});return r.status===400&&r.body.error==='EXCEEDS_ADMIN_TRANSFER_LIMIT'&&!r.body.uploadUrl;});
 for(const infected of [false,true])await check(`[H2 genuine Cloudmersive] ${infected?'compressed EICAR ZIP rejected':'clean ZIP scan evidence complete'}`,async()=>{
  const bytes=zip(infected);const fb=crypto.randomUUID();feedbacks.push(fb);await client.from('collaboration_feedback').insert({id:fb,collaboration_id:collab,author_id:artistUid,kind:'general',body:'Isolated H2 ZIP validation'});
  const req=await call('portal-request-attachment-upload-url',{feedbackId:fb,mimeType:'application/zip',fileSizeBytes:bytes.length,originalFilename:'fixture.zip'},artistToken);if(!req.body.attachmentId)return false;attachments.push(req.body.attachmentId);const row=await client.from('collaboration_feedback_attachments').select('*').eq('id',req.body.attachmentId).single();objects.push([row.data.storage_bucket,row.data.storage_path]);await fetch(req.body.uploadUrl,{method:'PUT',headers:{'Content-Type':'application/zip'},body:bytes});await call('portal-confirm-attachment-upload',{attachmentId:req.body.attachmentId},artistToken);const {data:r}=await client.from('collaboration_feedback_attachments').select('*').eq('id',req.body.attachmentId).single();evidence.push({kind:infected?'EICAR-ZIP':'ZIP',bytes:bytes.length,scan:r.scan_evidence});return infected?r.security_status==='infected'&&r.scan_evidence?.provider==='cloudmersive-advanced':r.security_status==='clean'&&r.scan_evidence?.complete===true;
 });
 await check('[H2] artist cannot approve asset security',async()=>(await call('portal-admin-review-asset',{assetId:firstId,decision:'approve'},artistToken)).status===403);
 await check('[H2] unauthenticated worker capability denied',async()=>(await call('portal-scanner-worker-access',{objectKind:'asset',objectId:firstId,attemptId:crypto.randomUUID()},'invalid')).status===403);
 await check('[H2] scanner status labels local observations; actual provider usage unknown',async()=>{const r=await call('portal-admin-scanner-status',{});evidence.push({kind:'scanner-status',status:r.status,result:r.body});return r.body.ok&&r.body.actualProviderUsage===null&&r.body.workerHealthy===false;});
}finally{
 writeFileSync(new URL(filter?'../../docs/signal-portal/k16h2-focused-scan-evidence.json':'../../docs/signal-portal/k16h2-live-scan-evidence.json',import.meta.url),JSON.stringify({project:safe.projectRef,fixturePrivacy:'Generated, non-private fixtures only; no existing artist bytes transmitted',verifiedAt:new Date().toISOString(),evidence},null,2)+'\n');
 for(const[bucket,path]of objects)await client.storage.from(bucket).remove([path]);
 if(attachments.length)await client.from('collaboration_feedback_attachments').delete().in('id',attachments);
 if(feedbacks.length)await client.from('collaboration_feedback').delete().in('id',feedbacks);
 if(assets.length)await client.from('collaboration_assets').delete().in('id',assets);
 await client.from('collaboration_members').delete().eq('collaboration_id',collab);await client.from('collaborations').delete().eq('id',collab);
}
summary('K1.6H.2 real-development integration');

console.log(`Intentionally skipped: ${skipped}`);

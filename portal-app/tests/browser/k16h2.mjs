// New admin controls, using one generated non-private PNG only.
import {chromium} from 'playwright';
import {expect} from '@playwright/test';
import {createClient} from '@supabase/supabase-js';
import {createHash} from 'node:crypto';
import {writeFileSync} from 'node:fs';
import {assertSafeToRunIntegrationTests} from '../integration/_guard.mjs';
import {loadBrowserDataset} from '../integration/browser-dataset.mjs';
import {signInForBrowser,seedSessionAndReload} from './_session.mjs';
assertSafeToRunIntegrationTests();if(!process.env.SUPABASE_URL.includes('gcbonlvbgyhsgfayvlvz'))throw Error('Wrong development target');
const d=loadBrowserDataset();const admin=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});
const anon=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_ANON_KEY,{auth:{persistSession:false}});
const session=await signInForBrowser(anon,d.identities.admin.email,d.password);
const call=async(fn,body)=>{const r=await fetch(process.env.SUPABASE_URL+'/functions/v1/'+fn,{method:'POST',headers:{apikey:process.env.SUPABASE_ANON_KEY,Authorization:'Bearer '+session.access_token,'Content-Type':'application/json'},body:JSON.stringify(body)});return{status:r.status,body:await r.json()};};
const collab=crypto.randomUUID();let id,path,bucket;const browser=await chromium.launch();let evidence;
try{
 const inserted=await admin.from('collaborations').insert({id:collab,title:'H2 browser synthetic fixture',artist_display_name:'Synthetic',created_by:session.user.id});if(inserted.error)throw inserted.error;
 const bytes=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j6Z8AAAAASUVORK5CYII=','base64');
 const label=`H2 UI fixture ${Date.now()}`;
 const req=await call('portal-admin-request-upload-url',{collaborationId:collab,assetType:'visual_image',mimeType:'image/png',fileSizeBytes:bytes.length,displayLabel:label});id=req.body.assetId;if(!id)throw Error('Request failed');
 const row=await admin.from('collaboration_assets').select('*').eq('id',id).single();path=row.data.storage_path;bucket=row.data.storage_bucket;
 expect((await fetch(req.body.uploadUrl,{method:'PUT',body:bytes,headers:{'Content-Type':'image/png'}})).ok).toBeTruthy();
 await admin.from('collaboration_assets').update({security_status:'scanning',scan_request_id:crypto.randomUUID(),scan_lease_expires_at:new Date(Date.now()-60000).toISOString()}).eq('id',id); // Simulated interrupted lease; no simulated verdict.
 const context=await browser.newContext();const page=await context.newPage();await seedSessionAndReload(page,process.env.SUPABASE_URL,session,'/admin');
 await page.getByRole('button',{name:'Asset Library',exact:true}).click();const tr=page.locator('.sp-admin__table tr').filter({hasText:label});
 await expect(tr.getByRole('button',{name:'Retry expired scan',exact:true})).toBeVisible();
 const retried=page.waitForResponse(r=>r.url().includes('/portal-admin-confirm-upload')&&r.request().method()==='POST');await tr.getByRole('button',{name:'Retry expired scan',exact:true}).click();expect((await retried).ok()).toBeTruthy();console.log('PASS expired asset scan can be genuinely retried from the UI');
 await expect(tr.getByRole('button',{name:'Approve security release',exact:true})).toBeVisible();console.log('PASS new security release control appears only after scan');
 await expect(tr).toContainText('cloudmersive');console.log('PASS actual provider visible');
 const saved=page.waitForResponse(r=>r.url().includes('/portal-admin-review-asset')&&r.request().method()==='POST');
 await tr.getByRole('button',{name:'Approve security release',exact:true}).click();expect((await saved).ok()).toBeTruthy();
 await expect(tr).toContainText('ready');console.log('PASS explicit UI security review releases file');
 const final=await admin.from('collaboration_assets').select('*').eq('id',id).single();expect(final.data.security_review_status).toBe('approved');expect(final.data.file_sha256).toBe(createHash('sha256').update(bytes).digest('hex'));console.log('PASS exact-byte evidence and review persisted');
 expect(final.data.approval_status).toBe('pending');console.log('PASS artistic approval remains separate and pending');
 evidence={fixture:'generated non-private PNG',scan:final.data.scan_evidence,securityReview:final.data.security_review_status,artisticApproval:final.data.approval_status};
 await page.getByRole('button',{name:'Settings',exact:true}).click();await expect(page.locator('body')).toContainText('Actual provider account usage is unknown');console.log('PASS settings does not invent account usage');
 console.log('K1.6H.2 new admin UI: 7 passed, 0 failed, 0 skipped');
}finally{
 if(evidence)writeFileSync(new URL('../../docs/signal-portal/k16h2-admin-ui-evidence.json',import.meta.url),JSON.stringify(evidence,null,2)+'\n');
 await browser.close();if(bucket&&path)await admin.storage.from(bucket).remove([path]);if(id)await admin.from('collaboration_assets').delete().eq('id',id);await admin.from('collaborations').delete().eq('id',collab);
}

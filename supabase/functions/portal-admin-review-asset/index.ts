import { corsHeaders,json } from '../_shared/cors.ts';
import { requiredEnv,createAdminClient } from '../_shared/clients.ts';
import { requireAdmin } from '../_shared/requireAdmin.ts';
Deno.serve(async request=>{
 if(request.method==='OPTIONS')return new Response('ok',{headers:corsHeaders});
 if(request.method!=='POST')return json({error:'METHOD_NOT_ALLOWED'},405);
 const env=requiredEnv();if(!env)return json({error:'SERVER_CONFIG'},500);
 const admin=await requireAdmin(env.supabaseUrl,request.headers.get('Authorization'));if(!admin)return json({error:'NOT_AUTHORIZED'},403);
 let body;try{body=await request.json();}catch{return json({error:'INVALID_INPUT'},400);}
 if(!body.assetId||body.decision!=='approve')return json({error:'INVALID_INPUT'},400);
 const client=createAdminClient(env.supabaseUrl,env.serviceKey);
 const {data:row}=await client.from('collaboration_assets').select('*').eq('id',body.assetId).maybeSingle();
 if(!row||row.security_status!=='clean'||!row.scan_request_id)return json({error:'SCAN_NOT_CLEARED'},409);
 // The database trigger validates primary AND thumbnail evidence against current identity/bytes.
 const saved=await client.from('collaboration_assets').update({security_required:true,security_review_status:'approved',security_reviewed_by:admin.uid,security_reviewed_at:new Date().toISOString(),upload_status:'ready',verified_at:new Date().toISOString()}).eq('id',row.id).eq('scan_request_id',row.scan_request_id).eq('security_status','clean').select('id').maybeSingle();
 if(saved.error||!saved.data)return json({error:'SCAN_NOT_CLEARED'},409);
 await client.from('portal_admin_audit_log').insert({admin_id:admin.uid,action:'approve_asset_security_release',target_table:'collaboration_assets',target_id:row.id,details:{attemptId:row.scan_request_id,sha256:row.file_sha256}});
 return json({ok:true,uploadStatus:'ready'});
});

import { corsHeaders,json } from '../_shared/cors.ts';
import { requiredEnv,createAdminClient } from '../_shared/clients.ts';
import { requireAdmin } from '../_shared/requireAdmin.ts';
import { scannerConfig } from '../_shared/scannerPolicy.ts';
Deno.serve(async request=>{
 if(request.method==='OPTIONS')return new Response('ok',{headers:corsHeaders});
 if(request.method!=='POST')return json({error:'METHOD_NOT_ALLOWED'},405);
 const env=requiredEnv();if(!env)return json({error:'SERVER_CONFIG'},500);
 const admin=await requireAdmin(env.supabaseUrl,request.headers.get('Authorization'));if(!admin)return json({error:'NOT_AUTHORIZED'},403);
 let config;try{config=scannerConfig();}catch{return json({ok:true,configuration:'invalid',workerHealthy:false});}
 const client=createAdminClient(env.supabaseUrl,env.serviceKey);
 const month=new Date();month.setUTCDate(1);month.setUTCHours(0,0,0,0);
 const usage=await client.from('portal_scanner_usage').select('provider,verdict,file_size').gte('completed_at',month.toISOString()).limit(10000);
 const counts:Record<string,number>={};for(const row of usage.data??[])counts[row.provider]=(counts[row.provider]??0)+1;
 let workerHealthy=false;
 if(config.mode==='dual')try{
  const response=await fetch(new URL('health',config.workerUrl!),{headers:{Authorization:`Bearer ${config.workerToken}`},signal:AbortSignal.timeout(3000),redirect:'error'});
  const status=await response.json();workerHealthy=response.ok&&status.healthy===true&&status.policyVersion==='signal-portal-k16h2-v1';
 }catch{/* accurately unavailable */}
 return json({ok:true,configuration:'valid',mode:config.mode,cloudmersiveConfigured:!!Deno.env.get('CLOUDMERSIVE_API_KEY'),workerHealthy,artistMaxBytes:config.artistMaxBytes,observedMonthlyOutcomes:counts,usageScope:'application-observed scan outcomes only; not provider account usage',truncated:(usage.data?.length??0)>=10000,actualProviderUsage:null});
});

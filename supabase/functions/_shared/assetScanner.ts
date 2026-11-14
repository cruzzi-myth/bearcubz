import { scanStoredObject } from './objectScanner.ts';
import { failedEvidence } from './scannerProvider.ts';
export async function scanAsset(client: any, assetId: string, adminUid: string) {
  const attemptId = crypto.randomUUID();
  const claim = await client.rpc('claim_asset_for_scan',{p_asset_id:assetId,p_request_id:attemptId,p_manual:true});
  const row=claim.data?.[0]; if(!row) return {ok:false,error:'SCAN_NOT_CLAIMABLE'};
  await client.from('portal_admin_audit_log').insert({admin_id:adminUid,action:'request_asset_scan',target_table:'collaboration_assets',target_id:assetId,details:{attemptId,manual:true}});
  let evidence=await scanStoredObject(client,'asset',row,attemptId);
  let thumbEvidence=null;
  // Each thumbnail is a separate set of bytes. It cannot inherit the primary verdict.
  if(evidence.verdict==='clean'&&evidence.complete&&row.thumbnail_storage_path){
    const slash=row.thumbnail_storage_path.lastIndexOf('/');
    const listed=await client.storage.from(row.storage_bucket).list(row.thumbnail_storage_path.slice(0,slash),{search:row.thumbnail_storage_path.slice(slash+1),limit:1});
    const thumb=listed.data?.find((x:any)=>x.name===row.thumbnail_storage_path.slice(slash+1));
    if(!thumb?.metadata?.size) evidence=failedEvidence(evidence,'THUMBNAIL_MISSING');
    else {
      // Thumbnail worker access is deliberately unsupported until a distinct lease/capability
      // exists. Small thumbnails use Cloudmersive directly; larger ones fail closed.
      thumbEvidence=await scanStoredObject(client,'asset',{...row,storage_path:row.thumbnail_storage_path,byte_size:thumb.metadata.size,object_variant:'thumbnail'},attemptId);
      if(thumbEvidence.verdict!=='clean'||!thumbEvidence.complete) evidence=failedEvidence(evidence,'THUMBNAIL_NOT_CLEARED');
    }
  }
  const clean=evidence.verdict==='clean'&&evidence.complete&&evidence.withinLimits;
  const saved=await client.from('collaboration_assets').update({security_status:clean?'clean':evidence.verdict==='infected'?'infected':'error',file_sha256:evidence.fileSha256||null,scan_evidence:evidence,thumbnail_scan_evidence:thumbEvidence,scan_lease_expires_at:null}).eq('id',assetId).eq('scan_request_id',attemptId).select('id').maybeSingle();
  await client.from('portal_scanner_usage').upsert({attempt_id:attemptId,provider:evidence.provider,verdict:evidence.verdict,file_size:evidence.fileSize},{onConflict:'attempt_id,provider'});
  await client.from('portal_admin_audit_log').insert({admin_id:adminUid,action:'asset_scan_result',target_table:'collaboration_assets',target_id:assetId,details:{attemptId,verdict:evidence.verdict,sha256:evidence.fileSha256,complete:evidence.complete,recorded:!!saved.data}});
  return {ok:!!saved.data,securityStatus:clean?'clean':evidence.verdict,scanComplete:evidence.complete,reviewRequired:true};
}

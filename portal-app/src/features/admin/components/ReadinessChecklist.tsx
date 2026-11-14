import { buildReadinessChecklist } from '../lib/collaborationReadiness';
import type { AdminAsset } from '../types/adminTypes';

const AUDIO_TYPES = new Set(['audio_short', 'audio_full']);

type Props = { assets: AdminAsset[]; activeMemberCount: number; bpm: number | null; musicalKey: string | null };

/**
 * Stage K1.6L — admin-only readiness summary. Deliberately omits any
 * "ready to invite" row: whether to actually invite an artist is a
 * decision only the project owner makes (CollaborationsTab never
 * sends one automatically), so it is never represented here as a
 * computed checkbox.
 */
export function ReadinessChecklist({ assets, activeMemberCount, bpm, musicalKey }: Props) {
  const active = assets.filter((a) => a.isActive);
  const securityRequired = active.filter((a) => a.securityRequired);
  const primaryCover = active.find((a) => a.isPrimaryCover);

  const checks = buildReadinessChecklist({
    bpm,
    musicalKey,
    hasAudio: active.some((a) => AUDIO_TYPES.has(a.assetType) && a.uploadStatus === 'ready'),
    hasProposal: active.some((a) => a.assetType === 'proposal_pdf' && a.uploadStatus === 'ready'),
    hasPrimaryCover: Boolean(primaryCover),
    primaryCoverApproved: primaryCover?.approvalStatus === 'approved',
    anySecurityRequiredAsset: securityRequired.length > 0,
    allSecurityRequiredAssetsClean: securityRequired.every((a) => a.securityStatus === 'clean'),
    allSecurityRequiredAssetsApproved: securityRequired.every((a) => a.securityReviewStatus === 'approved'),
    activeMemberCount,
  });

  return (
    <ul className="sp-admin__readiness-list">
      {checks.map((c) => (
        <li key={c.key} className={c.complete ? 'sp-admin__readiness-item sp-admin__readiness-item--done' : 'sp-admin__readiness-item'}>
          <span aria-hidden="true">{c.complete ? '✓' : '○'}</span> {c.label}
        </li>
      ))}
    </ul>
  );
}

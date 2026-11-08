/**
 * Stage K1.6A — pure decision logic for the persistent chamber
 * navigation bar, structurally mirroring (not duplicating)
 * portalHostActions.ts's "0 -> message / 1 -> auto-navigate / many ->
 * ask" branching. Deliberately does NOT also gate on asset-type
 * availability the way resolveQuickAction does for Nyx's conversational
 * replies — a persistent nav bar should always let an authorized
 * artist freely visit a chamber (each chamber page already has its
 * own honest "no assets yet" empty state), rather than silently
 * suppressing navigation because this one asset type happens to be
 * absent today.
 */
export type ChamberSegment = 'listen' | 'proposal' | 'visuals' | 'respond';

export type NavCollaboration = { id: string; title: string };

type NavDecision =
  | { kind: 'navigate'; path: string }
  | { kind: 'select-project'; choices: NavCollaboration[] }
  | { kind: 'none' };

export function resolveNavDestination(segment: ChamberSegment, collaborations: NavCollaboration[]): NavDecision {
  if (collaborations.length === 0) return { kind: 'none' };
  if (collaborations.length === 1) return { kind: 'navigate', path: `/collaboration/${collaborations[0].id}/${segment}` };
  return { kind: 'select-project', choices: collaborations.map((c) => ({ id: c.id, title: c.title })) };
}

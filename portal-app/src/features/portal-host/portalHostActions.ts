import type { HostCollaboration, ProjectChoice, QuickActionId } from './portalHostTypes';
import { NO_PROJECTS_MESSAGE, NAVIGATION_CONFIRMATIONS, ABOUT_THE_COLLECTIVE, projectSelectionPrompt, unavailableAssetMessage } from './portalHostDialogue';

type Decision =
  | { kind: 'message'; text: string }
  | { kind: 'select-project'; text: string; choices: ProjectChoice[] }
  | { kind: 'navigate'; text: string; path: string };

const ACTION_LABELS: Record<QuickActionId, string> = {
  listen: 'listen to',
  proposal: 'view the proposal for',
  visuals: 'explore the visuals for',
  respond: 'send feedback on',
  about: '',
};

const ASSET_REQUIREMENT: Partial<Record<QuickActionId, { types: string[]; what: string }>> = {
  listen: { types: ['audio_short', 'audio_full'], what: 'recording' },
  proposal: { types: ['proposal_pdf'], what: 'proposal' },
  visuals: { types: ['track_cover', 'alternate_cover', 'visual_image', 'visual_concept'], what: 'artwork' },
  // 'respond' has no asset requirement — sending feedback never needs
  // a pre-existing asset. 'about' never navigates at all.
};

const ROUTE_SEGMENT: Record<'listen' | 'proposal' | 'visuals' | 'respond', string> = {
  listen: 'listen',
  proposal: 'proposal',
  visuals: 'visuals',
  respond: 'respond',
};

/**
 * Pure decision logic — never calls navigate() itself, never fetches
 * anything. Given exactly the authorized collaborations the caller
 * already loaded (the same RLS-scoped list the Dashboard uses) and
 * which action was chosen, decides one of: a plain message, "ask the
 * artist which project," or "navigate to this specific collaboration's
 * chamber." Never picks a collaboration on its own when more than one
 * exists — that's the one hard rule this function exists to enforce.
 */
export function resolveQuickAction(action: QuickActionId, collaborations: HostCollaboration[]): Decision {
  if (action === 'about') {
    return { kind: 'message', text: ABOUT_THE_COLLECTIVE };
  }

  if (collaborations.length === 0) {
    return { kind: 'message', text: NO_PROJECTS_MESSAGE };
  }

  if (collaborations.length > 1) {
    return {
      kind: 'select-project',
      text: projectSelectionPrompt(ACTION_LABELS[action]),
      choices: collaborations.map((c) => ({ collaborationId: c.id, title: c.title })),
    };
  }

  return resolveForCollaboration(action, collaborations[0]);
}

export function resolveForCollaboration(
  action: Exclude<QuickActionId, 'about'>,
  collaboration: HostCollaboration,
): Decision {
  const requirement = ASSET_REQUIREMENT[action];
  if (requirement && !requirement.types.some((t) => collaboration.availableAssetTypes.has(t))) {
    return { kind: 'message', text: unavailableAssetMessage(requirement.what) };
  }

  return {
    kind: 'navigate',
    text: NAVIGATION_CONFIRMATIONS[action],
    path: `/collaboration/${collaboration.id}/${ROUTE_SEGMENT[action]}`,
  };
}

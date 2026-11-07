export type QuickActionId = 'listen' | 'proposal' | 'visuals' | 'respond' | 'about';

export const QUICK_ACTIONS: { id: QuickActionId; label: string }[] = [
  { id: 'listen', label: 'Listen to Demo' },
  { id: 'proposal', label: 'View Proposal' },
  { id: 'visuals', label: 'Explore Visuals' },
  { id: 'respond', label: 'Send Feedback' },
  { id: 'about', label: 'About The Collective' },
];

/** A minimal, real view of what the artist is actually authorized
 * for — built from the same RLS-scoped data the Dashboard already
 * fetched. Nyx never queries anything of her own; she's handed
 * exactly this and nothing more. */
export type HostCollaboration = {
  id: string;
  title: string;
  availableAssetTypes: Set<string>;
};

export type ProjectChoice = { collaborationId: string; title: string };

export type ChatMessage = {
  id: string;
  speaker: 'nyx' | 'artist';
  text: string;
  /** Only present on a Nyx message that's asking the artist to pick
   * which authorized project an action applies to. */
  projectChoices?: ProjectChoice[];
};

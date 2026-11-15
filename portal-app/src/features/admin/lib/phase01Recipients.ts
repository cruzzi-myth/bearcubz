// Invitation Phase 01 — the only two recipients the Send Invitation
// action offers. Mirrors supabase/functions/_shared/invitationPolicy.ts,
// which is the enforcing authority (the server rejects anything else);
// this list only drives what the Command Center presents.
export interface Phase01Recipient {
  key: string;
  artistName: string;
  email: string;
  collaborationId: string;
  collaborationTitle: string;
  note?: string;
}

export const PHASE01_RECIPIENTS: readonly Phase01Recipient[] = [
  {
    key: 'bearcub',
    artistName: 'BEλR CUBZ',
    email: 'bearcubzmusic@gmail.com',
    collaborationId: 'fb260abd-2c12-479b-a7db-047e3da810fc',
    collaborationTitle: 'CLIMBING TREES',
  },
  {
    key: 'setia',
    artistName: 'Setia Saint Haven',
    email: 'setiahaven@gmail.com',
    collaborationId: 'c297d5be-14d9-4f2b-93e2-a184e1ed2b83',
    collaborationTitle: 'WONKY LIQUID DREAMS',
    note: 'Blocked until the revised proposal replaces the original and is scanned and security-approved.',
  },
];

import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AdminLayout, type AdminTab, ADMIN_TABS } from '../features/admin/components/AdminLayout';
import { OverviewTab } from '../features/admin/components/OverviewTab';
import { ArtistsTab } from '../features/admin/components/ArtistsTab';
import { CollaborationsTab } from '../features/admin/components/CollaborationsTab';
import { AssetsTab } from '../features/admin/components/AssetsTab';
import { InvitationsTab } from '../features/admin/components/InvitationsTab';
import { FeedbackTab } from '../features/admin/components/FeedbackTab';
import { AttachmentsTab } from '../features/admin/components/AttachmentsTab';
import { AuditTab } from '../features/admin/components/AuditTab';
import { SettingsTab } from '../features/admin/components/SettingsTab';

// Reaching this component at all already required RequirePortalAdmin
// to confirm is_portal_admin() server-side — nothing in here, or in
// any tab, re-derives or trusts a client-side admin flag. Every
// write action each tab performs still goes through its own
// Edge Function, which re-verifies admin status independently.
/**
 * Stage K1.6P: ?tab= and ?collab=/?edit= let the Admin Controls
 * overlay deep-link here from a chamber or the Artist Portal —
 * e.g. /admin?tab=assets&collab=<id>. The tab value is validated
 * against the real registered tab list, never trusted as-is; an
 * unrecognized or missing value falls back to 'overview' exactly as
 * before this stage. The collaboration id is passed down to the
 * relevant tab only as an initial-selection hint, read once — each
 * tab's own data fetch and every write it performs still goes
 * through its existing RLS/Edge-Function authorization unchanged.
 */
export function AdminPage() {
  const [searchParams] = useSearchParams();
  const requestedTab = searchParams.get('tab');
  const initialTab: AdminTab = requestedTab && (ADMIN_TABS as string[]).includes(requestedTab) ? (requestedTab as AdminTab) : 'overview';
  const [tab, setTab] = useState<AdminTab>(initialTab);
  const collabParam = searchParams.get('collab') ?? undefined;
  const editParam = searchParams.get('edit') ?? undefined;

  return (
    <AdminLayout activeTab={tab} onTabChange={setTab}>
      {tab === 'overview' && <OverviewTab />}
      {tab === 'artists' && <ArtistsTab />}
      {tab === 'collaborations' && <CollaborationsTab initialEditCollaborationId={editParam} />}
      {tab === 'assets' && <AssetsTab initialCollaborationId={collabParam} />}
      {tab === 'invitations' && <InvitationsTab />}
      {tab === 'feedback' && <FeedbackTab scrollToCollaborationId={collabParam} />}
      {tab === 'attachments' && <AttachmentsTab />}
      {tab === 'audit' && <AuditTab />}
      {tab === 'settings' && <SettingsTab />}
    </AdminLayout>
  );
}

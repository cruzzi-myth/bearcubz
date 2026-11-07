import { useState } from 'react';
import { AdminLayout, type AdminTab } from '../features/admin/components/AdminLayout';
import { OverviewTab } from '../features/admin/components/OverviewTab';
import { ArtistsTab } from '../features/admin/components/ArtistsTab';
import { CollaborationsTab } from '../features/admin/components/CollaborationsTab';
import { AssetsTab } from '../features/admin/components/AssetsTab';
import { InvitationsTab } from '../features/admin/components/InvitationsTab';
import { FeedbackTab } from '../features/admin/components/FeedbackTab';
import { AuditTab } from '../features/admin/components/AuditTab';
import { SettingsTab } from '../features/admin/components/SettingsTab';

// Reaching this component at all already required RequirePortalAdmin
// to confirm is_portal_admin() server-side — nothing in here, or in
// any tab, re-derives or trusts a client-side admin flag. Every
// write action each tab performs still goes through its own
// Edge Function, which re-verifies admin status independently.
export function AdminPage() {
  const [tab, setTab] = useState<AdminTab>('overview');

  return (
    <AdminLayout activeTab={tab} onTabChange={setTab}>
      {tab === 'overview' && <OverviewTab />}
      {tab === 'artists' && <ArtistsTab />}
      {tab === 'collaborations' && <CollaborationsTab />}
      {tab === 'assets' && <AssetsTab />}
      {tab === 'invitations' && <InvitationsTab />}
      {tab === 'feedback' && <FeedbackTab />}
      {tab === 'audit' && <AuditTab />}
      {tab === 'settings' && <SettingsTab />}
    </AdminLayout>
  );
}

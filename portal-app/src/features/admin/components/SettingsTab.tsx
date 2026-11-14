import { useEffect, useState } from 'react';
import { supabase } from '../../../services/supabaseClient';
import { isBackendUnavailableError } from '../../../lib/supabaseErrors';

type Status = 'CONFIGURED' | 'NOT CONFIGURED' | 'AVAILABLE' | 'UNAVAILABLE' | 'UNKNOWN';

const ASSET_CATEGORIES = ['audio_short', 'audio_full', 'proposal_pdf', 'track_cover', 'alternate_cover', 'visual_image', 'visual_concept'];

function Row({ label, value }: { label: string; value: Status | string }) {
  const tone = value === 'AVAILABLE' || value === 'CONFIGURED' ? '' : value === 'UNKNOWN' ? 'sp-admin__pill--muted' : 'sp-admin__pill--warn';
  return (
    <tr>
      <td>{label}</td>
      <td>
        <span className={`sp-admin__pill ${tone}`}>{value}</span>
      </td>
    </tr>
  );
}

/**
 * Read-only, and deliberately conservative: presence of an env var
 * only ever reports CONFIGURED/NOT CONFIGURED, never "working" — and
 * a successful round-trip only ever reports AVAILABLE/UNAVAILABLE,
 * never inferred from configuration alone. No secret value is ever
 * rendered, no SQL editor, nothing here can change Supabase
 * infrastructure.
 */
export function SettingsTab() {
  const [scannerStatus, setScannerStatus] = useState('Checking scanner status…');
  const [backendStatus, setBackendStatus] = useState<Status>('UNKNOWN');
  const [authStatus, setAuthStatus] = useState<Status>('UNKNOWN');
  const [storageStatus, setStorageStatus] = useState<Status>('UNKNOWN');

  const urlConfigured = Boolean(import.meta.env.VITE_SUPABASE_URL);
  const keyConfigured = Boolean(import.meta.env.VITE_SUPABASE_ANON_KEY);

  useEffect(() => {
    supabase.functions.invoke('portal-admin-scanner-status', {body:{}}).then(({data,error}) => {
      if(error||!data?.ok) {setScannerStatus('Scanner status unavailable');return;}
      setScannerStatus(`Configuration: ${data.configuration}; Cloudmersive key: ${data.cloudmersiveConfigured ? 'configured (operation not checked)' : 'absent'}; ClamAV worker: ${data.workerHealthy ? 'healthy' : 'unavailable'}. Monthly app-observed outcomes: ${JSON.stringify(data.observedMonthlyOutcomes ?? {})}. Actual provider account usage is unknown.`);
    });
    supabase
      .from('portal_admins')
      .select('user_id', { head: true, count: 'exact' })
      .then(({ error }) => {
        if (!error) setBackendStatus('AVAILABLE');
        else setBackendStatus(isBackendUnavailableError(error) ? 'NOT CONFIGURED' : 'UNAVAILABLE');
      });

    supabase.auth
      .getSession()
      .then(() => setAuthStatus('AVAILABLE'))
      .catch(() => setAuthStatus('UNAVAILABLE'));

    supabase.storage
      .listBuckets()
      .then(({ error }) => setStorageStatus(error ? 'UNKNOWN' : 'AVAILABLE'));
  }, []);

  return (
    <>
      <h2>Settings &amp; System Status</h2>
      <p className="sp-admin__status-msg">{scannerStatus}</p>
      <div className="sp-admin__table-wrap" style={{ maxWidth: 560 }}>
        <table className="sp-admin__table">
          <tbody>
            <tr>
              <td>Portal Application</td>
              <td>portal-app — Stage H</td>
            </tr>
            <Row label="VITE_SUPABASE_URL" value={urlConfigured ? 'CONFIGURED' : 'NOT CONFIGURED'} />
            <Row label="VITE_SUPABASE_ANON_KEY" value={keyConfigured ? 'CONFIGURED' : 'NOT CONFIGURED'} />
            <Row label="Database Connection" value={backendStatus} />
            <Row label="Authentication Service" value={authStatus} />
            <Row label="Storage Service (reachability only)" value={storageStatus} />
          </tbody>
        </table>
      </div>

      <div className="sp-admin__section" style={{ marginTop: 24 }}>
        <h2 style={{ fontSize: 14 }}>Supported Asset Categories</h2>
        <div className="sp-admin__row-actions">
          {ASSET_CATEGORIES.map((cat) => (
            <span key={cat} className="sp-admin__pill">
              {cat}
            </span>
          ))}
        </div>
      </div>

      <p className="sp-admin__empty" style={{ marginTop: 24, maxWidth: 560 }}>
        No service-role key, SQL editor, or infrastructure controls exist in this interface. "Database Connection" reflects
        whether a simple read against portal_admins succeeded just now — it is not a general health check, and a CONFIGURED
        environment variable above is not proof that its value is correct.
      </p>
    </>
  );
}

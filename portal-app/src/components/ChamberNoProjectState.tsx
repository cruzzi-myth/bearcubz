import { Link } from 'react-router-dom';
import { usePortalAuth } from '../features/auth/PortalAuthContext';
import './chamber-no-project-state.css';

/**
 * Stage K1.6A.3 — shown ONLY on the project-independent chamber routes
 * (/chambers/listening etc., no :id at all), never on a real
 * /collaboration/:id/... route. useAuthorizedCollaboration(undefined)
 * makes zero network requests to reach this state, so nothing here is
 * ever deciding what to show based on fetched data — the message is
 * static, generic, and identical for every visitor.
 */
export function ChamberNoProjectState({ message }: { message: string }) {
  const { isAdmin } = usePortalAuth();
  return (
    <div className="sp-chamber-empty">
      <p className="sp-chamber-empty__message">{message}</p>
      <div className="sp-chamber-empty__actions">
        <Link to="/dashboard" className="sp-chamber-empty__link">
          Return to Dashboard
        </Link>
        {isAdmin && (
          <Link to="/admin" className="sp-chamber-empty__link sp-chamber-empty__link--admin">
            Return to Command Center
          </Link>
        )}
      </div>
    </div>
  );
}

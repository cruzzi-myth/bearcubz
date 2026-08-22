import './shared-state.css';

interface ErrorStateProps {
  title: string;
  body: string;
  action?: { label: string; onClick: () => void };
  tone?: 'error' | 'info';
}

/** Shared, never-a-blank-screen error/notice panel. Used both for
 * genuine failures (network offline, Supabase unavailable) and for
 * the backend condition panels (NO_PASSPORT_FOUND, ALREADY_LINKED,
 * PASSPORT REQUIRED) via services/errors.ts's translated copy. */
export function ErrorState({ title, body, action, tone = 'error' }: ErrorStateProps) {
  return (
    <div className={`mr-panel${tone === 'info' ? ' mr-panel--info' : ''}`} role="alert">
      <p className="mr-panel__title">{title}</p>
      <p className="mr-panel__body">{body}</p>
      {action && (
        <button type="button" className="network-btn" onClick={action.onClick}>
          {action.label}
        </button>
      )}
    </div>
  );
}

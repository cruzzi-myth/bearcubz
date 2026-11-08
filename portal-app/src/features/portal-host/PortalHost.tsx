import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePortalHost } from './PortalHostProvider';
import { useDashboardData } from '../../hooks/useDashboardData';
import { portalAsset } from '../../lib/assetPath';
import { PORTAL_HOST_CONFIG } from './portalHostConfig';
import { NyxCompanion } from './NyxCompanion';
import { QUICK_ACTIONS, type HostCollaboration } from './portalHostTypes';
import { WELCOME_MESSAGE, matchFaq } from './portalHostDialogue';
import { resolveQuickAction, resolveForCollaboration } from './portalHostActions';
import './PortalHost.css';

/**
 * Everything Nyx can "know" comes from useDashboardData — the exact
 * same RLS-scoped read the Dashboard itself uses. There is no second,
 * wider query anywhere in this file; she operates with precisely the
 * authenticated artist's own permissions, never more. Navigation
 * decisions come from the pure functions in portalHostActions — this
 * component is the only place that actually calls navigate(), and
 * only ever with a path that function returned, never one it
 * constructed from scratch.
 */
export function PortalHost() {
  const host = usePortalHost();
  const dashboard = useDashboardData();
  const navigate = useNavigate();
  const [input, setInput] = useState('');
  const panelRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  const collaborations: HostCollaboration[] =
    dashboard.kind === 'ready'
      ? dashboard.collaborations.map((c) => ({ id: c.id, title: c.title, availableAssetTypes: c.availableAssetTypes }))
      : [];

  useEffect(() => {
    if (host.isOpen && host.messages.length === 0) {
      host.addMessage({ speaker: 'nyx', text: WELCOME_MESSAGE });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [host.isOpen]);

  useEffect(() => {
    if (host.isOpen) {
      previouslyFocused.current = document.activeElement as HTMLElement | null;
      panelRef.current?.focus();
    } else {
      previouslyFocused.current?.focus();
    }
  }, [host.isOpen]);

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === 'Escape') host.close();
  }

  function handleQuickAction(actionId: (typeof QUICK_ACTIONS)[number]['id']) {
    const label = QUICK_ACTIONS.find((a) => a.id === actionId)!.label;
    host.addMessage({ speaker: 'artist', text: label });
    host.setPendingSelection(null);

    const decision = resolveQuickAction(actionId, collaborations);
    if (decision.kind === 'select-project') {
      host.addMessage({ speaker: 'nyx', text: decision.text, projectChoices: decision.choices });
      host.setPendingSelection({ action: actionId as 'listen' | 'proposal' | 'visuals' | 'respond', choices: decision.choices });
      return;
    }
    host.addMessage({ speaker: 'nyx', text: decision.text });
    if (decision.kind === 'navigate') navigate(decision.path);
  }

  function handleProjectChoice(collaborationId: string, title: string) {
    if (!host.pendingSelection) return;
    host.addMessage({ speaker: 'artist', text: title });
    const chosen = collaborations.find((c) => c.id === collaborationId);
    host.setPendingSelection(null);
    if (!chosen) return;

    const decision = resolveForCollaboration(host.pendingSelection.action, chosen);
    host.addMessage({ speaker: 'nyx', text: decision.text });
    if (decision.kind === 'navigate') navigate(decision.path);
  }

  function handleAsk(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text) return;
    host.addMessage({ speaker: 'artist', text });
    host.addMessage({ speaker: 'nyx', text: matchFaq(text) });
    setInput('');
  }

  if (!host.isOpen) {
    return <NyxCompanion onOpen={host.open} />;
  }

  return (
    <div
      className="sp-host__panel"
      role="dialog"
      aria-label={`${PORTAL_HOST_CONFIG.displayName} — ${PORTAL_HOST_CONFIG.role}`}
      ref={panelRef}
      tabIndex={-1}
      onKeyDown={handleKeyDown}
    >
      <header className="sp-host__head">
        <img className="sp-host__portrait" src={portalAsset(PORTAL_HOST_CONFIG.artworkSrc)} alt={PORTAL_HOST_CONFIG.artworkAlt} />
        <div className="sp-host__head-text">
          <span className="sp-host__name">{PORTAL_HOST_CONFIG.displayName}</span>
          <span className="sp-host__role">{PORTAL_HOST_CONFIG.role}</span>
        </div>
        <button type="button" className="sp-host__close" onClick={host.close} aria-label="Close">
          ×
        </button>
      </header>

      <div className="sp-host__messages" role="log" aria-live="polite" aria-atomic="false">
        {host.messages.map((m) => (
          <div key={m.id} className={`sp-host__msg sp-host__msg--${m.speaker}`}>
            <p>{m.text}</p>
            {m.projectChoices && (
              <div className="sp-host__choices">
                {m.projectChoices.map((choice) => (
                  <button key={choice.collaborationId} type="button" onClick={() => handleProjectChoice(choice.collaborationId, choice.title)}>
                    {choice.title}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="sp-host__actions">
        {QUICK_ACTIONS.map((action) => (
          <button key={action.id} type="button" onClick={() => handleQuickAction(action.id)}>
            {action.label}
          </button>
        ))}
      </div>

      <form className="sp-host__ask" onSubmit={handleAsk}>
        <label htmlFor="sp-host-input" className="sp-host__ask-label">
          Ask Nyx
        </label>
        <input
          id="sp-host-input"
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask a question…"
        />
        <button type="submit" aria-label="Send">
          →
        </button>
      </form>
    </div>
  );
}

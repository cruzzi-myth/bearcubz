import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useDashboardData } from '../hooks/useDashboardData';
import { resolveNavDestination, PROJECT_INDEPENDENT_PATH, type ChamberSegment } from '../lib/navDestination';
import './chamber-nav.css';

const DESTINATIONS: { segment: ChamberSegment; label: string }[] = [
  { segment: 'listen', label: 'Listening Chamber' },
  { segment: 'respond', label: 'Transmission Chamber' },
  { segment: 'visuals', label: 'Visual Concept Chamber' },
  { segment: 'proposal', label: 'Proposal Chamber' },
];

/**
 * Stage K1.6A — the one shared navigation bar rendered on the
 * Dashboard and (via PortalChamberLayout) all four chambers, so there
 * is exactly one place this logic lives, not five. "Current project"
 * comes from the URL's own :id param when already on a chamber page
 * (the route is the source of truth, nothing is persisted as an
 * auth mechanism) — when on the Dashboard, a locally-picked project
 * (never defaulted beyond the single-project case) scopes the other
 * four destinations until the artist/admin picks one. Every chamber
 * route this links to independently re-verifies authorization exactly
 * as it already did before this stage — this component only ever
 * constructs a path from an id already present in the caller's own
 * already-authorized `collaborations` list.
 */
export function ChamberNav({ currentCollaborationId }: { currentCollaborationId?: string }) {
  const dashboard = useDashboardData();
  const navigate = useNavigate();
  const location = useLocation();
  const [pickedProjectId, setPickedProjectId] = useState<string | null>(null);
  const [pendingSegment, setPendingSegment] = useState<ChamberSegment | null>(null);

  const collaborations = dashboard.kind === 'ready' ? dashboard.collaborations : [];
  const activeProjectId =
    currentCollaborationId ?? pickedProjectId ?? (collaborations.length === 1 ? collaborations[0].id : null);

  const hasAnyProject = collaborations.length > 0;
  const needsProjectPicker = collaborations.length > 1;

  // Stage K1.6A.3: recognizes BOTH the project-scoped route shape
  // (.../segment, when currentCollaborationId is set) and the new
  // project-independent one (/chambers/<name>, when it isn't) as "the
  // chamber currently open" -- used both for aria-current and for
  // preserving which chamber the user is looking at across a project
  // switch, regardless of which route shape they started from.
  function currentSegmentFromPath(): ChamberSegment | null {
    if (currentCollaborationId) {
      return DESTINATIONS.find((d) => location.pathname.endsWith(`/${d.segment}`))?.segment ?? null;
    }
    const entry = (Object.entries(PROJECT_INDEPENDENT_PATH) as [ChamberSegment, string][]).find(
      ([, path]) => path === location.pathname,
    );
    return entry ? entry[0] : null;
  }

  function handleChamberClick(segment: ChamberSegment) {
    if (activeProjectId) {
      navigate(`/collaboration/${activeProjectId}/${segment}`);
      return;
    }
    if (!hasAnyProject) {
      // Stage K1.6A.3: no disabled destinations anymore -- every
      // chamber is reachable without a project, via its own honest
      // no-project empty state (ChamberNoProjectState).
      navigate(PROJECT_INDEPENDENT_PATH[segment]);
      return;
    }
    const decision = resolveNavDestination(segment, collaborations);
    if (decision.kind === 'select-project') {
      setPendingSegment(segment);
    }
  }

  function handleProjectPick(id: string) {
    setPickedProjectId(id);
    setPendingSegment(null);
    if (pendingSegment) navigate(`/collaboration/${id}/${pendingSegment}`);
  }

  function handleSwitchProject(id: string) {
    setPickedProjectId(id);
    // Preserve the CURRENT chamber across a project switch, same
    // requirement as preserving it across a chamber-to-chamber move —
    // works from a project-independent chamber route too, not just a
    // project-scoped one.
    const currentSegment = currentSegmentFromPath();
    if (currentSegment) navigate(`/collaboration/${id}/${currentSegment}`);
  }

  return (
    <nav className="sp-chamber-nav" aria-label="Signal Portal navigation">
      <Link to="/dashboard" className="sp-chamber-nav__link" aria-current={location.pathname === '/dashboard' ? 'page' : undefined}>
        Dashboard
      </Link>

      {DESTINATIONS.map((d) => {
        const isCurrent = currentSegmentFromPath() === d.segment;
        return (
          <button
            key={d.segment}
            type="button"
            className="sp-chamber-nav__link"
            aria-current={isCurrent ? 'page' : undefined}
            onClick={() => handleChamberClick(d.segment)}
          >
            {d.label}
          </button>
        );
      })}

      {needsProjectPicker && (
        <label className="sp-chamber-nav__project-picker">
          <span className="sp-sr-only">Active project</span>
          <select
            value={activeProjectId ?? ''}
            onChange={(e) => (currentSegmentFromPath() ? handleSwitchProject(e.target.value) : handleProjectPick(e.target.value))}
          >
            <option value="" disabled>
              Select a project…
            </option>
            {collaborations.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title}
              </option>
            ))}
          </select>
        </label>
      )}

      {pendingSegment && (
        <div className="sp-chamber-nav__prompt" role="dialog" aria-label={`Choose a project to open its ${DESTINATIONS.find((d) => d.segment === pendingSegment)?.label}`}>
          <p>Which project?</p>
          <div className="sp-chamber-nav__prompt-choices">
            {collaborations.map((c) => (
              <button key={c.id} type="button" onClick={() => handleProjectPick(c.id)}>
                {c.title}
              </button>
            ))}
          </div>
          <button type="button" className="sp-chamber-nav__prompt-cancel" onClick={() => setPendingSegment(null)} aria-label="Cancel project selection">
            ×
          </button>
        </div>
      )}
    </nav>
  );
}

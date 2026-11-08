import { useId } from 'react';
import { Link } from 'react-router-dom';
import { Modal } from './Modal';
import { ClassificationBadge } from './ClassificationBadge';
import { classifyCollaboration } from '../lib/collaborationClassification';
import { buildDeliverables, buildMaterials } from '../lib/collaborationMaterials';
import { useSignedAssetUrl } from '../hooks/useSignedAssetUrl';
import './collaboration-briefing-modal.css';

export type BriefingCollaboration = {
  id: string;
  title: string;
  artistDisplayName: string;
  status: string;
  bpm: number | null;
  musicalKey: string | null;
  genreTags: string[] | null;
  notes: string | null;
  updatedAt: string;
  primaryCoverAssetId: string | null;
};

type Props = {
  collaboration: BriefingCollaboration;
  availableAssetTypes: Set<string>;
  onClose: () => void;
};

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  } catch {
    return iso;
  }
}

function CoverArt({ assetId }: { assetId: string | null }) {
  const signed = useSignedAssetUrl(assetId, 'thumbnail');
  if (!assetId || signed.status === 'unavailable') {
    return (
      <div className="sp-briefing__cover sp-briefing__cover--placeholder" aria-hidden="true">
        <span>◈</span>
      </div>
    );
  }
  if (signed.status !== 'ready') return <div className="sp-briefing__cover sp-briefing__cover--loading" aria-hidden="true" />;
  return (
    <div className="sp-briefing__cover">
      <img src={signed.url} alt="" />
    </div>
  );
}

/**
 * Stage K1.4 — the "official project dossier" overlay. Every section
 * is built from the real collaboration record and the real,
 * already-authorized `availableAssetTypes` set (RLS-scoped before this
 * component ever sees it — this never fetches anything itself keyed
 * off an id, so there is no path by which an unauthorized project id
 * could reach it: it only ever renders a collaboration object the
 * caller already had authorized access to). A section with no
 * authoritative data is either omitted (Artistic Direction with no
 * genre tags and no notes) or explicitly labeled unavailable
 * (individual Production Details fields) — never fabricated.
 */
export function CollaborationBriefingModal({ collaboration: c, availableAssetTypes, onClose }: Props) {
  const titleId = useId();
  const classification = classifyCollaboration({ bpm: c.bpm, musicalKey: c.musicalKey });
  const deliverables = buildDeliverables(availableAssetTypes);
  const materials = buildMaterials(availableAssetTypes);
  const hasProductionDetails = c.bpm !== null || (c.musicalKey !== null && c.musicalKey.trim() !== '');
  const hasArtisticDirection = (c.genreTags && c.genreTags.length > 0) || Boolean(c.notes);

  return (
    <Modal titleId={titleId} onClose={onClose} className="sp-briefing">
      <button type="button" className="sp-briefing__close" onClick={onClose} aria-label="Close briefing">
        ×
      </button>

      {/* A plain div, not <header> -- this isn't nested inside any
          sectioning content (article/aside/main/nav/section), so a
          semantic <header> here would carry an IMPLICIT role="banner"
          just like the real page header behind the modal, and axe
          correctly flagged the resulting duplicate/non-unique banner
          landmark. This is a dialog's own internal header section,
          not a second page banner. */}
      <div className="sp-briefing__header">
        <CoverArt assetId={c.primaryCoverAssetId} />
        <div className="sp-briefing__header-text">
          <p className="sp-briefing__eyebrow">Collaboration Briefing</p>
          <h2 id={titleId}>{c.title}</h2>
          <p className="sp-briefing__artist">{c.artistDisplayName}</p>
          <div className="sp-briefing__header-badges">
            <ClassificationBadge classification={classification} />
            <span className={`sp-briefing__status sp-briefing__status--${c.status}`}>{c.status}</span>
          </div>
        </div>
      </div>

      <div className="sp-briefing__body">
        <section className="sp-briefing__section" aria-labelledby={`${titleId}-overview`}>
          <h3 id={`${titleId}-overview`}>01 — Project Overview</h3>
          <p>{c.notes ? c.notes : 'Not yet documented in the authoritative project record.'}</p>
        </section>

        {hasArtisticDirection && (
          <section className="sp-briefing__section" aria-labelledby={`${titleId}-direction`}>
            <h3 id={`${titleId}-direction`}>02 — Artistic Direction</h3>
            {c.genreTags && c.genreTags.length > 0 ? (
              <p>{c.genreTags.join(', ')}</p>
            ) : (
              <p className="sp-briefing__unavailable">Genre/atmosphere not yet tagged.</p>
            )}
          </section>
        )}

        {hasProductionDetails && (
          <section className="sp-briefing__section" aria-labelledby={`${titleId}-production`}>
            <h3 id={`${titleId}-production`}>03 — Production Details</h3>
            <dl className="sp-briefing__dl">
              <div>
                <dt>BPM</dt>
                <dd>{c.bpm ?? <span className="sp-briefing__unavailable">Not recorded</span>}</dd>
              </div>
              <div>
                <dt>Key</dt>
                <dd>{c.musicalKey || <span className="sp-briefing__unavailable">Not recorded</span>}</dd>
              </div>
              <div>
                <dt>Arrangement / Sound Design / Vocal Direction</dt>
                <dd>
                  <span className="sp-briefing__unavailable">Not yet captured in the authoritative project record.</span>
                </dd>
              </div>
            </dl>
          </section>
        )}

        <section className="sp-briefing__section" aria-labelledby={`${titleId}-deliverables`}>
          <h3 id={`${titleId}-deliverables`}>04 — Deliverables</h3>
          <ul className="sp-briefing__list">
            {deliverables.map((d) => (
              <li key={d.key}>
                <span className={`sp-briefing__dot sp-briefing__dot--${d.status}`} aria-hidden="true" />
                {d.label}
                <span className="sp-briefing__list-status">{d.status === 'completed' ? 'Complete' : 'Pending'}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="sp-briefing__section" aria-labelledby={`${titleId}-materials`}>
          <h3 id={`${titleId}-materials`}>05 — Collaboration Materials</h3>
          <ul className="sp-briefing__list">
            {materials.map((m) =>
              m.available ? (
                <li key={m.key}>
                  <Link to={`/collaboration/${c.id}/${m.routePath}`} className="sp-briefing__material-link">
                    {m.label} →
                  </Link>
                </li>
              ) : (
                <li key={m.key}>
                  <span className="sp-briefing__unavailable">{m.label} — not yet available</span>
                </li>
              ),
            )}
          </ul>
        </section>

        <section className="sp-briefing__section" aria-labelledby={`${titleId}-status`}>
          <h3 id={`${titleId}-status`}>06 — Project Status</h3>
          <p>
            <span className={`sp-briefing__status sp-briefing__status--${c.status}`}>{c.status}</span>
            {' — last updated '}
            {formatDate(c.updatedAt)}
          </p>
        </section>

        <section className="sp-briefing__section" aria-labelledby={`${titleId}-feedback`}>
          <h3 id={`${titleId}-feedback`}>07 — Feedback</h3>
          <Link to={`/collaboration/${c.id}/respond`} className="sp-briefing__material-link">
            Open Transmission Chamber →
          </Link>
        </section>
      </div>
    </Modal>
  );
}

import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { DashboardCollaboration } from '../hooks/useDashboardData';
import { useSignedAssetUrl } from '../hooks/useSignedAssetUrl';
import { resolveCollaborationActions } from './collaborationCardActions';
import './collaboration-card.css';

type Props = { collaboration: DashboardCollaboration };

/**
 * Thumbnail only — never the full-resolution cover, per F8. Renders
 * a designed placeholder (not another artist's artwork, not
 * anything invented) whenever there's no primary cover yet, the
 * signed URL couldn't be authorized, or the image itself fails to
 * load (a broken/expired URL is not the same failure as "none
 * exists," but both land on the same honest placeholder).
 */
function CoverThumbnail({ assetId }: { assetId: string | null }) {
  const signed = useSignedAssetUrl(assetId, 'thumbnail');
  const [loadFailed, setLoadFailed] = useState(false);

  if (!assetId || signed.status === 'unavailable' || loadFailed) {
    return (
      <div className="sp-collab-card__cover sp-collab-card__cover--placeholder" aria-hidden="true">
        <span>◈</span>
      </div>
    );
  }

  if (signed.status !== 'ready') {
    return <div className="sp-collab-card__cover sp-collab-card__cover--loading" aria-hidden="true" />;
  }

  return (
    <div className="sp-collab-card__cover">
      <img src={signed.url} alt="" loading="lazy" onError={() => setLoadFailed(true)} />
    </div>
  );
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  } catch {
    return iso;
  }
}

/**
 * Every action below resolves to THIS card's own collaboration id —
 * never a hardcoded or guessed one. Availability is read from
 * availableAssetTypes, which comes from a real collaboration_assets
 * query (see useDashboardData) — an action is only ever presented as
 * available because the database said so, never assumed.
 */
export function CollaborationCard({ collaboration: c }: Props) {
  const actions = resolveCollaborationActions(c.availableAssetTypes);

  return (
    <article className="sp-collab-card">
      <CoverThumbnail assetId={c.primaryCoverAssetId} />
      <div className="sp-collab-card__head">
        <h3 className="sp-collab-card__title">{c.title}</h3>
        <span className={`sp-collab-card__status sp-collab-card__status--${c.status}`}>{c.status}</span>
      </div>
      <p className="sp-collab-card__artist">{c.artistDisplayName}</p>

      <dl className="sp-collab-card__meta">
        {c.bpm !== null && (
          <div>
            <dt>BPM</dt>
            <dd>{c.bpm}</dd>
          </div>
        )}
        {c.musicalKey && (
          <div>
            <dt>Key</dt>
            <dd>{c.musicalKey}</dd>
          </div>
        )}
        {c.genreTags && c.genreTags.length > 0 && (
          <div>
            <dt>Genre</dt>
            <dd>{c.genreTags.join(', ')}</dd>
          </div>
        )}
        <div>
          <dt>Updated</dt>
          <dd>{formatDate(c.updatedAt)}</dd>
        </div>
      </dl>

      <div className="sp-collab-card__actions">
        {actions.map((action) =>
          action.available ? (
            <Link key={action.path} to={`/collaboration/${c.id}/${action.path}`} className="sp-collab-card__action">
              {action.label.toUpperCase()}
            </Link>
          ) : (
            <span
              key={action.path}
              className="sp-collab-card__action sp-collab-card__action--unavailable"
              aria-disabled="true"
              title={`${action.label} not available yet for this collaboration`}
            >
              {action.label.toUpperCase()}
            </span>
          ),
        )}
      </div>
    </article>
  );
}

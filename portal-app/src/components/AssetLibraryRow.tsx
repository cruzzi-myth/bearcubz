import { useState } from 'react';
import { useSignedAssetUrl } from '../hooks/useSignedAssetUrl';
import { classifyCollaboration } from '../lib/collaborationClassification';
import { ClassificationBadge } from './ClassificationBadge';
import './asset-library-row.css';

export type AssetLibraryRowData = {
  id: string;
  title: string;
  artistDisplayName: string;
  status: string;
  bpm: number | null;
  musicalKey: string | null;
  primaryCoverAssetId: string | null;
};

function RowCover({ assetId }: { assetId: string | null }) {
  const signed = useSignedAssetUrl(assetId, 'thumbnail');
  const [loadFailed, setLoadFailed] = useState(false);

  if (!assetId || signed.status === 'unavailable' || loadFailed) {
    return (
      <div className="sp-asset-row__cover sp-asset-row__cover--placeholder" aria-hidden="true">
        <span>◈</span>
      </div>
    );
  }
  if (signed.status !== 'ready') return <div className="sp-asset-row__cover sp-asset-row__cover--loading" aria-hidden="true" />;
  return (
    <div className="sp-asset-row__cover">
      <img src={signed.url} alt="" loading="lazy" onError={() => setLoadFailed(true)} />
    </div>
  );
}

/**
 * Stage K1.4.1 — the compact music-library-style row, shared verbatim
 * between the artist and administrator Asset Library (Part V: "avoid
 * maintaining two unrelated implementations of the same visual
 * design"). Classification is never re-derived from which asset types
 * happen to be present on this row — a project with artwork is not
 * thereby reclassified as ARTWORK (Part III) — it comes from the same
 * single classifyCollaboration() every other surface uses.
 */
export function AssetLibraryRow<T extends AssetLibraryRowData>({ row, selected, onSelect }: { row: T; selected?: boolean; onSelect: (row: T) => void }) {
  const classification = classifyCollaboration({ bpm: row.bpm, musicalKey: row.musicalKey });
  const isTrack = classification === 'track';

  return (
    // Stage K1.4.1: the interactive role lives on the inner div, not
    // the <li> itself -- axe's "list" check correctly flagged an
    // earlier draft where role="button" on the <li> overrode its
    // implicit listitem role, leaving the parent <ul> with no valid
    // list-item children. The <li> stays a plain, real list item;
    // this div fills it completely, so nothing visual changes.
    <li className="sp-asset-row-li">
      <div
        role="button"
        tabIndex={0}
        aria-pressed={Boolean(selected)}
        className={`sp-asset-row${selected ? ' sp-asset-row--selected' : ''}`}
        onClick={() => onSelect(row)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onSelect(row);
          }
        }}
      >
        <RowCover assetId={row.primaryCoverAssetId} />

        <div className="sp-asset-row__info">
          <p className="sp-asset-row__title">
            {/* Visually-hidden lead-in, not an aria-label override --
                keeps the row's full visible text part of its own
                accessible name (the same label-content-name-mismatch
                fix already applied to CollaborationsReport). */}
            <span className="sp-sr-only">Open briefing for </span>
            {row.title}
          </p>
          <p className="sp-asset-row__artist">{row.artistDisplayName}</p>
        </div>

        <ClassificationBadge classification={classification} />

        <div className="sp-asset-row__meta">
          {/* Part III: project classification never gates on which file
              types exist, but the metadata SHOWN here does -- a
              non-TRACK project has no bpm/key to show in the first
              place (today's heuristic means they're always null
              together), and this stays correct once a real
              classification column can decouple the two. */}
          {isTrack && row.bpm !== null && <span className="sp-asset-row__meta-item">{row.bpm} BPM</span>}
          {isTrack && row.musicalKey && <span className="sp-asset-row__meta-item">{row.musicalKey}</span>}
          <span className={`sp-asset-row__status sp-asset-row__status--${row.status}`}>{row.status}</span>
        </div>
      </div>
    </li>
  );
}

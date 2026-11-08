import { useState } from 'react';
import { classifyCollaboration, type StorableClassification } from '../lib/collaborationClassification';
import { filterCollaborationRows } from '../lib/collaborationReportFilter';
import { ClassificationBadge } from './ClassificationBadge';
import './collaborations-report.css';

export type ReportRow = {
  id: string;
  title: string;
  artistDisplayName: string;
  status: string;
  // Stage K1.5B: optional — see AssetLibraryRow.tsx's identical note.
  classification?: StorableClassification | null;
  bpm: number | null;
  musicalKey: string | null;
  updatedAt: string;
};

type Props<T extends ReportRow> = {
  rows: T[];
  onSelect: (row: T) => void;
  selectedId?: string | null;
};

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  } catch {
    return iso;
  }
}

/**
 * Stage K1.4 — the compact report-style collaboration list, shared by
 * the artist Dashboard and the admin Command Center. Deliberately
 * data-agnostic: the caller already fetched `rows` through its own
 * RLS-scoped (artist) or admin-authorized query — this component never
 * fetches anything itself, so there is no path for an unauthorized
 * project id to reach it. Each row is a real `<tr>` made keyboard-
 * operable (role="button"/tabIndex, Enter/Space opens the same
 * briefing the mouse click does) — the same established pattern as
 * the Visual Gallery tile (Stage I2H), not a new one-off.
 */
export function CollaborationsReport<T extends ReportRow>({ rows, onSelect, selectedId }: Props<T>) {
  const [query, setQuery] = useState('');
  const filtered = filterCollaborationRows(rows, query);

  return (
    <div className="sp-collab-report">
      <div className="sp-collab-report__search">
        <label htmlFor="collab-report-search" className="sp-sr-only">
          Search collaborations by title or artist
        </label>
        <input
          id="collab-report-search"
          type="search"
          placeholder="Search by title or artist…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {filtered.length === 0 ? (
        <p className="sp-collab-report__empty">{rows.length === 0 ? 'No collaborations yet.' : 'No collaborations match your search.'}</p>
      ) : (
        <div className="sp-collab-report__table-wrap">
          <table className="sp-collab-report__table">
            <thead>
              <tr>
                <th>Project</th>
                <th>Artist</th>
                <th>Classification</th>
                <th>Status</th>
                <th>Updated</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => {
                const classification = classifyCollaboration({ classification: row.classification, bpm: row.bpm, musicalKey: row.musicalKey });
                const selected = selectedId === row.id;
                return (
                  <tr
                    key={row.id}
                    role="button"
                    tabIndex={0}
                    aria-pressed={selected}
                    className={`sp-collab-report__row${selected ? ' sp-collab-report__row--selected' : ''}`}
                    onClick={() => onSelect(row)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onSelect(row);
                      }
                    }}
                  >
                    {/* Stage K1.4: no aria-label override here -- axe's
                        label-content-name-mismatch correctly flagged an
                        earlier draft (the override hid every cell's own
                        visible text from the accessible name). This
                        visually-hidden lead-in is prepended to, not a
                        replacement for, the row's real content, so the
                        full visible text is still part of the name. */}
                    <td data-label="Project">
                      <span className="sp-sr-only">Open briefing for </span>
                      {row.title}
                    </td>
                    <td data-label="Artist">{row.artistDisplayName}</td>
                    <td data-label="Classification">
                      <ClassificationBadge classification={classification} />
                    </td>
                    <td data-label="Status">
                      <span className={`sp-collab-report__status sp-collab-report__status--${row.status}`}>{row.status}</span>
                    </td>
                    <td data-label="Updated">{formatDate(row.updatedAt)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

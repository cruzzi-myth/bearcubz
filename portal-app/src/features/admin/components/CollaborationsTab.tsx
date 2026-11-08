import { useState, type FormEvent } from 'react';
import { useAdminCollaborations } from '../hooks/useAdminCollaborations';
import { createCollaboration, updateCollaboration } from '../services/adminApi';
import { CollaborationsReport } from '../../../components/CollaborationsReport';
import { AdminCollaborationBriefing } from './AdminCollaborationBriefing';
import { CLASSIFICATION_META, isStorableClassification } from '../../../lib/collaborationClassification';
import type { AdminCollaboration, CollaborationStatus, ProjectClassification } from '../types/adminTypes';

const STATUSES: CollaborationStatus[] = ['draft', 'invited', 'active', 'completed', 'archived'];
// '' stands in for NULL/UNCLASSIFIED in the <select>'s own value space
// (a native <select> cannot hold a real null) -- translated back to a
// real null right before it's sent to updateCollaboration.
const CLASSIFICATION_OPTIONS: { value: ProjectClassification | ''; label: string }[] = [
  { value: '', label: CLASSIFICATION_META.unclassified.label.toUpperCase() },
  { value: 'track', label: CLASSIFICATION_META.track.label.toUpperCase() },
  { value: 'music_video', label: CLASSIFICATION_META.music_video.label.toUpperCase() },
  { value: 'artwork', label: CLASSIFICATION_META.artwork.label.toUpperCase() },
];

function formatAt(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  } catch {
    return iso;
  }
}

export function CollaborationsTab() {
  const { state, reload } = useAdminCollaborations();
  const [briefingTarget, setBriefingTarget] = useState<AdminCollaboration | null>(null);
  const [title, setTitle] = useState('');
  const [artistDisplayName, setArtistDisplayName] = useState('');
  const [bpm, setBpm] = useState('');
  const [musicalKey, setMusicalKey] = useState('');
  const [genre, setGenre] = useState('');
  const [classification, setClassification] = useState<ProjectClassification | ''>('');
  const [creating, setCreating] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  // Per-row transient feedback for classification saves specifically —
  // 'saved' auto-clears; 'error' persists until the next attempt. Status
  // changes keep their existing silent reload()-only behavior (unchanged),
  // since only classification was asked for explicit success/error feedback.
  const [classificationFeedback, setClassificationFeedback] = useState<Record<string, 'saving' | 'saved' | 'error'>>({});

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    if (!title.trim() || !artistDisplayName.trim()) return;
    setCreating(true);
    setFormError(null);
    const result = await createCollaboration({
      title: title.trim(),
      artistDisplayName: artistDisplayName.trim(),
      bpm: bpm ? Number(bpm) : undefined,
      musicalKey: musicalKey.trim() || undefined,
      genreTags: genre ? genre.split(',').map((g) => g.trim()).filter(Boolean) : undefined,
      classification: isStorableClassification(classification) ? classification : undefined,
    });
    setCreating(false);
    if (!result.ok) {
      setFormError(result.error);
      return;
    }
    setTitle('');
    setArtistDisplayName('');
    setBpm('');
    setMusicalKey('');
    setGenre('');
    setClassification('');
    reload();
  }

  async function handleStatusChange(collaborationId: string, status: CollaborationStatus) {
    await updateCollaboration(collaborationId, { status });
    reload();
  }

  async function handleClassificationChange(collaborationId: string, value: ProjectClassification | '') {
    setClassificationFeedback((prev) => ({ ...prev, [collaborationId]: 'saving' }));
    const result = await updateCollaboration(collaborationId, { classification: value === '' ? null : value });
    if (!result.ok) {
      setClassificationFeedback((prev) => ({ ...prev, [collaborationId]: 'error' }));
      return;
    }
    setClassificationFeedback((prev) => ({ ...prev, [collaborationId]: 'saved' }));
    reload();
    setTimeout(() => {
      setClassificationFeedback((prev) => {
        if (prev[collaborationId] !== 'saved') return prev;
        const next = { ...prev };
        delete next[collaborationId];
        return next;
      });
    }, 2500);
  }

  return (
    <>
      <h2>Create Collaboration</h2>
      <p className="sp-admin__empty" style={{ marginBottom: 14 }}>
        Internal creative development only. Creating a draft here does not invite the artist, grant portal access, or imply
        acceptance of anything — those are each a separate, later step.
      </p>
      <form className="sp-admin__form" onSubmit={handleCreate}>
        <div className="sp-admin__field">
          <label htmlFor="collab-title">Title</label>
          <input id="collab-title" value={title} onChange={(e) => setTitle(e.target.value)} required />
        </div>
        <div className="sp-admin__field">
          <label htmlFor="collab-artist">Artist Display Name (internal label)</label>
          <input id="collab-artist" value={artistDisplayName} onChange={(e) => setArtistDisplayName(e.target.value)} required />
        </div>
        <div className="sp-admin__field">
          <label htmlFor="collab-bpm">BPM</label>
          <input id="collab-bpm" type="number" value={bpm} onChange={(e) => setBpm(e.target.value)} />
        </div>
        <div className="sp-admin__field">
          <label htmlFor="collab-key">Musical Key</label>
          <input id="collab-key" value={musicalKey} onChange={(e) => setMusicalKey(e.target.value)} />
        </div>
        <div className="sp-admin__field">
          <label htmlFor="collab-genre">Genre Tags (comma-separated)</label>
          <input id="collab-genre" value={genre} onChange={(e) => setGenre(e.target.value)} />
        </div>
        <div className="sp-admin__field">
          <label htmlFor="collab-classification">Classification</label>
          <select id="collab-classification" value={classification} onChange={(e) => setClassification(e.target.value as ProjectClassification | '')}>
            {CLASSIFICATION_OPTIONS.map((opt) => (
              <option key={opt.value || 'unclassified'} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
        {formError && <p className="sp-admin__status-msg sp-admin__status-msg--error">{formError}</p>}
        <button type="submit" className="sp-admin__btn" disabled={creating}>
          {creating ? 'Creating…' : 'Create Draft Collaboration'}
        </button>
      </form>

      {/* Stage K1.4: report-style browse + briefing experience, built
          on the exact same already-fetched `state.collaborations` —
          the management table below is untouched, so every existing
          create/status-edit capability keeps working exactly as
          before. */}
      <div className="sp-admin__section" style={{ marginTop: 32 }}>
        <h2>Collaboration Briefings</h2>
        {state.kind === 'loading' && <p className="sp-admin__empty">Loading…</p>}
        {state.kind === 'backend-unavailable' && <p className="sp-admin__status-msg sp-admin__status-msg--error">Backend not configured in this environment yet.</p>}
        {state.kind === 'error' && <p className="sp-admin__status-msg sp-admin__status-msg--error">{state.message}</p>}
        {state.kind === 'ready' && (
          <CollaborationsReport rows={state.collaborations} selectedId={briefingTarget?.id ?? null} onSelect={(row) => setBriefingTarget(row)} />
        )}
      </div>

      <div className="sp-admin__section" style={{ marginTop: 32 }}>
        <h2>Manage Collaborations</h2>
        {state.kind === 'loading' && <p className="sp-admin__empty">Loading…</p>}
        {state.kind === 'backend-unavailable' && <p className="sp-admin__status-msg sp-admin__status-msg--error">Backend not configured in this environment yet.</p>}
        {state.kind === 'error' && <p className="sp-admin__status-msg sp-admin__status-msg--error">{state.message}</p>}
        {state.kind === 'ready' && state.collaborations.length === 0 && <p className="sp-admin__empty">No collaborations yet.</p>}
        {state.kind === 'ready' && state.collaborations.length > 0 && (
          <div className="sp-admin__table-wrap">
            <table className="sp-admin__table">
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Artist</th>
                  <th>Status</th>
                  <th>Classification</th>
                  <th>BPM</th>
                  <th>Key</th>
                  <th>Genre</th>
                  <th>Created</th>
                  <th>Updated</th>
                  <th>Assets</th>
                </tr>
              </thead>
              <tbody>
                {state.collaborations.map((c) => (
                  <tr key={c.id}>
                    <td>{c.title}</td>
                    <td>{c.artistDisplayName}</td>
                    <td>
                      <select
                        aria-label={`Change status for ${c.title}`}
                        value={c.status}
                        onChange={(e) => handleStatusChange(c.id, e.target.value as CollaborationStatus)}
                      >
                        {STATUSES.map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <select
                        aria-label={`Change classification for ${c.title}`}
                        value={c.classification ?? ''}
                        onChange={(e) => handleClassificationChange(c.id, e.target.value as ProjectClassification | '')}
                      >
                        {CLASSIFICATION_OPTIONS.map((opt) => (
                          <option key={opt.value || 'unclassified'} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                      {classificationFeedback[c.id] === 'saving' && <span className="sp-admin__status-msg"> Saving…</span>}
                      {classificationFeedback[c.id] === 'saved' && <span className="sp-admin__status-msg sp-admin__status-msg--success"> Saved</span>}
                      {classificationFeedback[c.id] === 'error' && <span className="sp-admin__status-msg sp-admin__status-msg--error"> Failed — try again</span>}
                    </td>
                    <td>{c.bpm ?? '—'}</td>
                    <td>{c.musicalKey ?? '—'}</td>
                    <td>{c.genreTags?.join(', ') ?? '—'}</td>
                    <td>{formatAt(c.createdAt)}</td>
                    <td>{formatAt(c.updatedAt)}</td>
                    <td>{c.assetCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {briefingTarget && <AdminCollaborationBriefing collaboration={briefingTarget} onClose={() => setBriefingTarget(null)} />}
    </>
  );
}

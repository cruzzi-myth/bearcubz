import { useParams } from 'react-router-dom';
import { PortalChamberLayout } from '../layouts/PortalChamberLayout';
import { PortalEmptyState } from '../components/PortalEmptyState';
import { ChamberNoProjectState } from '../components/ChamberNoProjectState';
import { PrivateAudioPlayer } from '../components/PrivateAudioPlayer';
import { PortalHost } from '../features/portal-host/PortalHost';
import { useAuthorizedCollaboration } from '../hooks/useAuthorizedCollaboration';
import { useSignedAssetUrl } from '../hooks/useSignedAssetUrl';
import { VISUAL_ASSET_TYPES } from '../lib/visualAssetTypes';
import './chamber-content.css';

const AUDIO_TYPES = new Set(['audio_short', 'audio_full']);

export function ListeningChamberPage() {
  const { id } = useParams();
  const authz = useAuthorizedCollaboration(id);

  // Stage J: the chamber's backdrop becomes THIS collaboration's own
  // primary cover art, not the shared generic environment image, once
  // one exists and is signed -- preserves each artist's visual
  // identity without changing anything for a collaboration that
  // doesn't have cover art yet (falls back to the existing shared
  // background below).
  const primaryCover = authz.status === 'authorized' ? authz.assets.find((a) => a.isPrimaryCover && VISUAL_ASSET_TYPES.has(a.assetType)) : undefined;
  const coverSigned = useSignedAssetUrl(primaryCover?.id ?? null, 'full');
  const backgroundUrl = coverSigned.status === 'ready' ? coverSigned.url : undefined;

  return (
    <>
    <PortalChamberLayout
      background="listening-chamber.webp"
      backgroundUrl={backgroundUrl}
      backgroundAlt={
        primaryCover
          ? `${authz.status === 'authorized' ? authz.collaboration.title : ''} cover art, filling the Private Listening Chamber`
          : 'An immersive listening lounge overlooking deep space — the Private Listening Chamber environment'
      }
      eyebrow="Listen"
      title="Private Listening Chamber"
    >
      {authz.status === 'loading' && <PortalEmptyState message="Checking authorization for this collaboration…" showReturnLink={false} />}
      {authz.status === 'backend-unavailable' && (
        <PortalEmptyState message="The Signal Portal backend isn't configured in this environment yet." showReturnLink={false} />
      )}
      {authz.status === 'error' && <PortalEmptyState message="Couldn't load this collaboration right now. Please try again." />}
      {/* Stage K1.6A.3: id === undefined means this is the
          project-independent /chambers/listening route, not a real
          collaboration that was denied -- useAuthorizedCollaboration
          makes zero requests in that case (see its own guard), so this
          branch never reflects fetched data, only the route shape. */}
      {authz.status === 'not-authorized' && !id && (
        <ChamberNoProjectState message="No listening sessions are available yet. Your authorized demos will appear here." />
      )}
      {authz.status === 'not-authorized' && id && <PortalEmptyState message="This collaboration isn't available to your account." />}

      {authz.status === 'authorized' && (
        <div className="sp-listen">
          <p className="sp-listen__meta">
            {authz.collaboration.artistDisplayName}
            {authz.collaboration.bpm !== null && ` · ${authz.collaboration.bpm} BPM`}
            {authz.collaboration.musicalKey && ` · ${authz.collaboration.musicalKey}`}
            {authz.collaboration.genreTags && authz.collaboration.genreTags.length > 0 && ` · ${authz.collaboration.genreTags.join(', ')}`}
          </p>
          {/* Stage I2H: was h3, skipping a level under the chamber's
              own h1 (PortalChamberLayout) — same class, same visible
              style, just the correct semantic level. */}
          <h2 className="sp-listen__title">{authz.collaboration.title}</h2>

          {(() => {
            const tracks = authz.assets.filter((a) => AUDIO_TYPES.has(a.assetType));
            if (tracks.length === 0) {
              return <p className="sp-listen__empty">No demo has been uploaded for this collaboration yet.</p>;
            }
            return (
              <div className="sp-listen__tracks">
                {tracks.map((track) => (
                  <div key={track.id} className="sp-listen__track">
                    <p className="sp-listen__track-label">
                      {track.displayLabel}
                      <span className="sp-listen__track-kind">{track.assetType === 'audio_full' ? 'Full length' : 'Short demo'}</span>
                    </p>
                    <PrivateAudioPlayer asset={track} />
                  </div>
                ))}
              </div>
            );
          })()}
        </div>
      )}
    </PortalChamberLayout>
    <PortalHost />
    </>
  );
}

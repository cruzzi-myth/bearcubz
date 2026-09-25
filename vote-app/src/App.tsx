import { useEffect, useState } from 'react';
import { tracks, getTrackById } from './data/tracks';
import { getVoteStatus, castVote, type VoteResult } from './lib/voteApi';
import { getTodaysVote, saveTodaysVote } from './lib/device';
import { AlbumCarousel } from './components/AlbumCarousel';
import { AudioPlayer } from './components/AudioPlayer';
import { TransmissionDecoding } from './components/TransmissionDecoding';
import { BlackSignal, type BlackSignalReason } from './components/BlackSignal';
import { MoonRacerBackground } from './components/MoonRacerBackground';

const HOME = '/';
const UNIVERSE = '/universe/';
const EVENTS = '/events/';
const PACKAGE = '/package-resume/';

type TodaysVote = { trackId: number; results: VoteResult[]; resetAt: string };

type UiState =
  | { type: 'loading' }
  | { type: 'eligible' }
  | { type: 'submitting'; trackId: number }
  | { type: 'decoding'; trackId: number; results: VoteResult[]; resetAt: string }
  | { type: 'results'; trackId: number; results: VoteResult[]; resetAt: string; skipIntro: boolean }
  | { type: 'blocked'; trackId: number; results: VoteResult[]; resetAt: string }
  | { type: 'error'; reason: BlackSignalReason };

function initialSelectedIndex(): number {
  const params = new URLSearchParams(window.location.search);
  const slug = params.get('track');
  if (slug) {
    const index = tracks.findIndex((track) => track.slug === slug);
    if (index >= 0) return index;
  }
  return 0;
}

function App() {
  const [selectedIndex, setSelectedIndex] = useState(initialSelectedIndex);
  const [ui, setUi] = useState<UiState>({ type: 'loading' });
  const [todaysVote, setTodaysVote] = useState<TodaysVote | null>(null);
  const [voteUnavailable, setVoteUnavailable] = useState(false);

  const track = tracks[selectedIndex];

  useEffect(() => {
    let cancelled = false;
    getVoteStatus()
      .then((status) => {
        if (cancelled) return;
        if (status.votedToday && status.trackId && status.results) {
          setTodaysVote({ trackId: status.trackId, results: status.results, resetAt: status.resetAt });
        }
        setUi({ type: 'eligible' });
      })
      .catch((error) => {
        if (cancelled) return;
        if (error instanceof Error && error.message === 'VOTE_NOT_CONFIGURED') {
          // Local dev / not-yet-deployed function: browse and listen freely,
          // just disable the vote action rather than showing a false outage.
          setVoteUnavailable(true);
          setUi({ type: 'eligible' });
          return;
        }
        setUi({ type: 'eligible' });
        setVoteUnavailable(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleVote = async (trackId: number) => {
    if (ui.type === 'submitting') return;

    // Client-side pre-check for instant feedback — the Edge Function's
    // unique (device_hash, vote_day) constraint is the real enforcement.
    if (todaysVote) {
      setUi({ type: 'blocked', ...todaysVote });
      return;
    }

    setUi({ type: 'submitting', trackId });
    try {
      const response = await castVote(trackId);
      if (response.ok && response.results) {
        saveTodaysVote(trackId);
        setTodaysVote({ trackId, results: response.results, resetAt: response.resetAt });
        setUi({ type: 'decoding', trackId, results: response.results, resetAt: response.resetAt });
        return;
      }
      if (response.error === 'ALREADY_VOTED' && response.trackId && response.results) {
        setTodaysVote({ trackId: response.trackId, results: response.results, resetAt: response.resetAt });
        setUi({ type: 'blocked', trackId: response.trackId, results: response.results, resetAt: response.resetAt });
        return;
      }
      throw new Error(response.error ?? 'VOTE_REQUEST_FAILED');
    } catch {
      setUi({ type: 'error', reason: navigator.onLine ? 'error' : 'offline' });
    }
  };

  const returnToTracks = () => setUi({ type: 'eligible' });
  const viewResults = () => {
    if (!todaysVote) return;
    setUi({ type: 'results', ...todaysVote, skipIntro: true });
  };

  const clampIndex = (index: number) => Math.max(0, Math.min(tracks.length - 1, index));

  // Non-essential background motion (orbits, particles, sweep, idle
  // pulse, parallax) steps aside while a modal/overlay owns attention —
  // Transmission Decoding, results, or Black Signal stay the strongest
  // motion on the page either way.
  const suspendBackground = ui.type === 'decoding' || ui.type === 'results' || ui.type === 'blocked' || ui.type === 'error';

  return (
    <main>
      <MoonRacerBackground
        selectedTrackId={track.id}
        selectedArtworkSrc={track.artworkSrc ?? ''}
        suspend={suspendBackground}
      />
      <a className="skip-link" href="#main-content">Skip to content</a>
      <header className="site-nav">
        <a className="wordmark" href={HOME} aria-label="BEλR CUBZ homepage">MOON RACER</a>
        <nav aria-label="Main navigation">
          <a href={HOME}>Home</a>
          <a href={UNIVERSE}>Universe</a>
          <a href={EVENTS}>Events</a>
          <a href={PACKAGE}>Industry</a>
        </nav>
      </header>

      <div id="main-content" className="vote-shell">
        <div className="vote-shell__intro">
          <p className="vote-shell__eyebrow">Moon Racer · Album Vote</p>
          <h1>PICK THE NEXT SIGNAL</h1>
          <p className="vote-shell__lead">
            Listen to all 22 tracks and cast one vote per device, per Pacific day. Come back after
            midnight Pacific to vote again.
          </p>
        </div>

        <AlbumCarousel
          tracks={tracks}
          selectedIndex={selectedIndex}
          onSelect={(i) => setSelectedIndex(clampIndex(i))}
          suspend={suspendBackground}
        />

        <AudioPlayer
          track={track}
          trackNumber={selectedIndex + 1}
          totalTracks={tracks.length}
          onPrev={() => setSelectedIndex(clampIndex(selectedIndex - 1))}
          onNext={() => setSelectedIndex(clampIndex(selectedIndex + 1))}
          voteState={
            ui.type === 'submitting' && ui.trackId === track.id
              ? 'submitting'
              : todaysVote
                ? 'voted-today'
                : 'idle'
          }
          votedTrackTitle={todaysVote ? getTrackById(todaysVote.trackId)?.title : undefined}
          onVote={() => handleVote(track.id)}
          onViewResults={viewResults}
          suspend={suspendBackground}
        />

        {voteUnavailable && ui.type === 'eligible' && (
          <p className="vote-shell__notice">Voting isn&rsquo;t connected yet in this environment — listening still works.</p>
        )}
      </div>

      {(ui.type === 'decoding' || ui.type === 'results') && (
        <TransmissionDecoding
          trackId={ui.trackId}
          results={ui.results}
          resetAt={ui.resetAt}
          skipIntro={ui.type === 'results' ? ui.skipIntro : false}
          onDone={ui.type === 'decoding' ? () => setUi({ type: 'results', trackId: ui.trackId, results: ui.results, resetAt: ui.resetAt, skipIntro: true }) : undefined}
          onReturn={returnToTracks}
        />
      )}

      {ui.type === 'blocked' && (
        <BlackSignal
          reason="already-voted"
          mode="overlay"
          resetAt={ui.resetAt}
          votedTrackTitle={getTrackById(ui.trackId)?.title}
          onClose={returnToTracks}
          onViewResults={viewResults}
        />
      )}

      {ui.type === 'error' && (
        <BlackSignal reason={ui.reason} mode="overlay" onClose={returnToTracks} />
      )}
    </main>
  );
}

export default App;

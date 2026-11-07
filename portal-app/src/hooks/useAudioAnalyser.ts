import { useEffect, useRef, useState } from 'react';

/**
 * Wires a playing <audio> element into the Web Audio API exactly
 * once, for the bass-reactive visualization in the Listening
 * Chamber. Two non-obvious things this gets right:
 *
 * 1. `createMediaElementSource(audioEl)` can only ever be called ONCE
 *    per element — calling it again (e.g. on a re-render) throws. The
 *    ref guard below ensures the graph is built a single time for a
 *    given element, even across StrictMode's double-invoke in dev.
 * 2. Routing the element through Web Audio REPLACES its native audio
 *    output — the analyser node must be connected through to
 *    ctx.destination or the user hears nothing at all. And a fresh
 *    AudioContext starts `suspended` under browsers' autoplay
 *    policies; it's resumed here on the audio element's own native
 *    'play' event (not a specific button's click handler), so this
 *    works regardless of what actually triggered playback.
 *
 * Returns null whenever there's nothing to visualize (no element yet,
 * Web Audio unsupported, or graph construction failed) — callers
 * treat that as "skip the visualization," never as an error to surface
 * to the artist, since audio playback itself is unaffected either way.
 */
export function useAudioAnalyser(audioEl: HTMLAudioElement | null): AnalyserNode | null {
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);
  const wiredElementRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (!audioEl || wiredElementRef.current === audioEl) return;

    const AudioContextCtor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextCtor) return;

    try {
      const ctx = new AudioContextCtor();
      const source = ctx.createMediaElementSource(audioEl);
      const node = ctx.createAnalyser();
      node.fftSize = 256;
      source.connect(node);
      node.connect(ctx.destination);

      const resume = () => {
        if (ctx.state === 'suspended') ctx.resume().catch(() => {});
      };
      audioEl.addEventListener('play', resume);

      wiredElementRef.current = audioEl;
      setAnalyser(node);

      return () => {
        audioEl.removeEventListener('play', resume);
      };
    } catch {
      // Cross-origin signed URL without the expected CORS headers, or
      // any other construction failure -- visualization is skipped,
      // audio playback itself is untouched (this hook never touches
      // the element's own src/playback state).
      setAnalyser(null);
    }
  }, [audioEl]);

  return analyser;
}

import { useEffect, useRef } from 'react';
import { usePrefersReducedMotion } from '../hooks/usePrefersReducedMotion';
import './audio-reactive-visualizer.css';

type Props = { analyser: AnalyserNode | null; playing: boolean };

/**
 * Purely decorative (aria-hidden) — responds to the bass end of the
 * current track's frequency spectrum, never to anything a screen
 * reader or keyboard user needs. Reduced-motion preference always
 * wins: renders a non-animated marker instead of running the canvas
 * loop at all, rather than a slowed-down version of the same effect.
 */
export function AudioReactiveVisualizer({ analyser, playing }: Props) {
  const reducedMotion = usePrefersReducedMotion();
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (reducedMotion || !analyser || !playing) return;
    const canvas = canvasRef.current;
    const ctx2d = canvas?.getContext('2d');
    if (!canvas || !ctx2d) return;

    const bufferLength = analyser.frequencyBinCount;
    const data = new Uint8Array(bufferLength);
    // The lowest ~6% of FFT bins correspond to roughly the sub-200Hz
    // bass range at the sample rates browsers actually use for
    // playback — not a precise crossover, but consistently "the low
    // end" across tracks, which is what a bass-reactive pulse needs.
    const bassBinCount = Math.max(1, Math.floor(bufferLength * 0.06));

    let rafId = 0;
    function draw() {
      rafId = requestAnimationFrame(draw);
      analyser!.getByteFrequencyData(data);

      let bassSum = 0;
      for (let i = 0; i < bassBinCount; i++) bassSum += data[i];
      const bass = bassSum / bassBinCount / 255; // 0..1

      const { width, height } = canvas!;
      ctx2d!.clearRect(0, 0, width, height);
      const cx = width / 2;
      const cy = height / 2;
      const baseRadius = Math.min(width, height) * 0.24;
      const radius = baseRadius * (1 + bass * 0.5);

      const glow = ctx2d!.createRadialGradient(cx, cy, radius * 0.25, cx, cy, radius);
      glow.addColorStop(0, `rgba(0, 229, 255, ${0.3 + bass * 0.45})`);
      glow.addColorStop(1, 'rgba(0, 229, 255, 0)');
      ctx2d!.fillStyle = glow;
      ctx2d!.beginPath();
      ctx2d!.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx2d!.fill();

      ctx2d!.strokeStyle = `rgba(255, 45, 120, ${0.25 + bass * 0.55})`;
      ctx2d!.lineWidth = 2 + bass * 5;
      ctx2d!.beginPath();
      ctx2d!.arc(cx, cy, radius * 0.62, 0, Math.PI * 2);
      ctx2d!.stroke();
    }

    draw();
    return () => cancelAnimationFrame(rafId);
  }, [analyser, playing, reducedMotion]);

  if (reducedMotion) {
    return (
      <div className="sp-visualizer sp-visualizer--static" aria-hidden="true">
        <div className={`sp-visualizer__dot${playing ? ' sp-visualizer__dot--playing' : ''}`} />
      </div>
    );
  }

  if (!analyser) return null;

  return <canvas ref={canvasRef} className="sp-visualizer" width={320} height={320} aria-hidden="true" />;
}

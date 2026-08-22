import { usePrefersReducedMotion } from '../hooks/useReducedMotion';
import './shared-state.css';

/** One of the brief's Moon Racer-themed loading messages, e.g.
 * "ESTABLISHING SIGNAL…", "VERIFYING PASSPORT…", "SYNCHRONIZING AVATAR…".
 * Respects prefers-reduced-motion by disabling the pulse animation. */
export function LoadingState({ message }: { message: string }) {
  const reducedMotion = usePrefersReducedMotion();
  return (
    <div className={`mr-state mr-state--loading${reducedMotion ? ' mr-motion-off' : ''}`} role="status" aria-live="polite">
      <span className="mr-state__dot" aria-hidden="true" />
      {message}
    </div>
  );
}

import { RouteShell } from '../components/RouteShell';

/** Catch-all for any unmatched /universe/* route. Distinct from the
 * root-level 404.html, which only exists to redirect GitHub Pages
 * deep-links into this app — once the SPA is running, this handles
 * genuinely unknown routes. */
export function NotFoundPage() {
  return (
    <RouteShell
      eyebrow="Signal Lost"
      title="404"
      description="Nothing is registered at this coordinate."
    />
  );
}

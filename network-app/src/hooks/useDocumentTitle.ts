import { useEffect } from 'react';

/** Sets document.title for the current route. A tiny stand-in for
 * react-helmet — Phase 1 has no per-route meta needs beyond this. */
export function useDocumentTitle(title: string) {
  useEffect(() => {
    const prev = document.title;
    document.title = `${title} · Moon Racer Universe`;
    return () => {
      document.title = prev;
    };
  }, [title]);
}

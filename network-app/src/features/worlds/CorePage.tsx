import { WorldTemplate } from './WorldTemplate';

/** /network/core — a named, permanent shortcut to the "the-core" world. */
export function CorePage() {
  return <WorldTemplate worldId="the-core" />;
}

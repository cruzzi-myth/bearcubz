import { useParams } from 'react-router-dom';
import { WorldTemplate } from './WorldTemplate';

/** Generic destination route: /network/world/:worldId */
export function WorldPage() {
  const { worldId } = useParams<{ worldId: string }>();
  return <WorldTemplate worldId={worldId ?? ''} />;
}

import { Link } from 'react-router-dom';
import './portal-empty-state.css';

type Props = {
  message: string;
  showReturnLink?: boolean;
};

/**
 * Honest "not live yet" state for every authenticated-area page.
 * None of these routes have a real backend behind them yet — this
 * says so plainly instead of faking a signed-in view or sample data.
 */
export function PortalEmptyState({ message, showReturnLink = true }: Props) {
  return (
    <div className="sp-empty">
      <p className="sp-empty__message">{message}</p>
      {showReturnLink && (
        <Link to="/" className="sp-empty__link">
          ← Return to Signal Portal
        </Link>
      )}
    </div>
  );
}

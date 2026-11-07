import { Link } from 'react-router-dom';
import './not-found-page.css';

export function NotFoundPage() {
  return (
    <div className="sp-404">
      <p className="sp-404__code">MR-COORD-404</p>
      <h1>Coordinates void</h1>
      <p>Nothing remains at this location inside the Signal Portal.</p>
      <Link to="/">← Return to Signal Portal</Link>
    </div>
  );
}

import { Link } from 'react-router-dom';
import { EmptyState } from '../components/EmptyState';

export function NotFound() {
  return (
    <EmptyState title="Out of bounds.">
      <p>That page doesn't exist.</p>
      <Link to="/" className="btn-primary mt-4">
        Back home
      </Link>
    </EmptyState>
  );
}

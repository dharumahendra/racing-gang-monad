import { Link } from 'react-router-dom';
export function NotFound() { return <div className="narrow"><h1>Route not found.</h1><p>Head back to the garage to pick a destination.</p><Link className="button" to="/">To the garage</Link></div>; }


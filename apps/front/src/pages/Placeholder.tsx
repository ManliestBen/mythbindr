import { Link } from 'react-router-dom';

/** Catch-all 404 inside the authed app. */
export default function Placeholder() {
  return (
    <div className="mx-auto grid max-w-4xl place-items-center py-24 text-center">
      <div>
        <p className="font-heading text-5xl font-bold text-brand">404</p>
        <h1 className="mt-3 font-heading text-xl font-bold">This page wandered off the map</h1>
        <p className="mt-2 text-sm text-fg-muted">
          The link may be old, or the element it pointed to was moved to trash.
        </p>
        <Link
          to="/campaigns"
          className="mt-5 inline-block rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-app-bg hover:bg-brand-bright"
        >
          Back to campaigns
        </Link>
      </div>
    </div>
  );
}

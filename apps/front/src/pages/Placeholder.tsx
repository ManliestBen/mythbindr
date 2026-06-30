import { useLocation } from 'react-router-dom';

export default function Placeholder() {
  const { pathname } = useLocation();
  const name =
    pathname.replace('/', '').replace(/^\w/, (c) => c.toUpperCase()) || 'Page';

  return (
    <div className="mx-auto grid max-w-4xl place-items-center py-24 text-center">
      <div>
        <h1 className="font-heading text-2xl font-bold">{name}</h1>
        <p className="mt-2 text-sm text-fg-muted">
          Coming in a later phase — see PLAN.md for the roadmap.
        </p>
      </div>
    </div>
  );
}

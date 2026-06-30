const STATS: [string, number][] = [
  ['Locations', 12],
  ['NPCs', 25],
  ['Encounters', 8],
  ['Items', 42],
];

export default function Dashboard() {
  return (
    <div className="mx-auto max-w-4xl">
      <p className="text-[11px] uppercase tracking-[0.15em] text-fg-muted">
        Active Campaign
      </p>
      <h1 className="mt-1 text-3xl font-bold">The Shattered Crown</h1>
      <p className="mt-2 max-w-prose text-sm text-fg-muted">
        A sample dashboard so you can see each theme applied to real UI. This
        becomes your live campaign overview once Phase 1 lands.
      </p>

      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {STATS.map(([label, n]) => (
          <div
            key={label}
            className="rounded-xl border border-app-border bg-app-surface p-4 text-center"
          >
            <div className="font-heading text-2xl font-bold text-brand">{n}</div>
            <div className="mt-1 text-[10px] uppercase tracking-wide text-fg-muted">
              {label}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-5 flex flex-wrap gap-3">
        <button className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-app-bg">
          + New Element
        </button>
        <button className="rounded-lg border border-app-border px-4 py-2 text-sm font-semibold text-fg">
          Generate with AI
        </button>
      </div>

      <div className="mt-8 rounded-xl border border-app-border bg-app-surface p-5">
        <h3 className="text-sm font-bold">Story so far</h3>
        <p className="mt-2 text-sm text-fg-muted">
          The crown was shattered into five shards and scattered across the
          realm. The party has recovered one — and made an enemy of the Ember
          Court in the process.
        </p>
      </div>
    </div>
  );
}

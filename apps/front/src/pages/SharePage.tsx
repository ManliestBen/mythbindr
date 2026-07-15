import { useParams } from 'react-router-dom';
import { useShareCampaign, useShareElements, type ShareElement } from '../data/share';
import ProseMirrorView from '../components/ProseMirrorView';

const TYPE_ORDER = ['quest', 'npc', 'location', 'encounter', 'item', 'faction', 'pc', 'note'];

const TYPE_LABELS: Record<string, string> = {
  npc: 'People',
  location: 'Places',
  encounter: 'Encounters',
  item: 'Items',
  note: 'Lore & Notes',
  quest: 'Quests',
  faction: 'Factions',
  pc: 'The Party',
};

/** Small facts worth showing to players, per type. */
const CHIP_KEYS: Record<string, string[]> = {
  npc: ['race', 'role', 'location'],
  location: ['locType'],
  item: ['itemType', 'rarity', 'attunement'],
  quest: ['status', 'giver'],
  faction: ['influence', 'leader'],
  pc: ['race', 'klass', 'level', 'playerName'],
};

function chips(e: ShareElement): string[] {
  const d = (e.data ?? {}) as Record<string, unknown>;
  return (CHIP_KEYS[e.type] ?? [])
    .map((k) => d[k])
    .filter((v): v is string | number => v !== undefined && v !== null && v !== '')
    .map(String);
}

export default function SharePage() {
  const { token } = useParams();
  const camp = useShareCampaign(token ?? '');
  const els = useShareElements(token ?? '');

  if (camp.isLoading) {
    return (
      <div className="grid min-h-screen place-items-center bg-app-bg text-fg-muted">
        Loading…
      </div>
    );
  }
  if (camp.error || !camp.data) {
    return (
      <div className="grid min-h-screen place-items-center bg-app-bg px-6 text-center text-fg-muted">
        This share link is invalid or has expired.
      </div>
    );
  }

  const grouped = (els.data ?? []).reduce<Record<string, ShareElement[]>>((acc, e) => {
    (acc[e.type] ??= []).push(e);
    return acc;
  }, {});
  const sections = TYPE_ORDER.filter((t) => grouped[t]?.length);

  return (
    <div className="min-h-screen bg-app-bg text-fg">
      <header className="border-b border-app-border bg-app-surface px-6 py-5">
        <div className="mx-auto max-w-5xl">
          <p className="text-[11px] uppercase tracking-[0.15em] text-fg-muted">
            Player&rsquo;s guide to
          </p>
          <h1 className="font-heading text-3xl font-bold">{camp.data.campaign.name}</h1>
        </div>
      </header>

      <div className="mx-auto flex max-w-5xl gap-8 px-6 py-8">
        {/* Table of contents — sticks on desktop, hidden on phones. */}
        {sections.length > 1 && (
          <nav className="sticky top-8 hidden h-fit w-40 shrink-0 lg:block" aria-label="Contents">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-fg-muted">
              Contents
            </p>
            <ul className="mt-2 space-y-1">
              {sections.map((t) => (
                <li key={t}>
                  <a
                    href={`#section-${t}`}
                    className="text-sm text-fg-muted hover:text-brand"
                  >
                    {TYPE_LABELS[t] ?? t}{' '}
                    <span className="text-[10px]">({grouped[t].length})</span>
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        )}

        <main className="min-w-0 flex-1">
          {(els.data ?? []).length === 0 && (
            <p className="text-sm text-fg-muted">
              Nothing has been shared yet — check back after your next session.
            </p>
          )}
          {sections.map((t) => (
            <section key={t} id={`section-${t}`} className="mb-10 scroll-mt-8">
              <h2 className="border-b border-app-border pb-2 font-heading text-xl font-bold">
                {TYPE_LABELS[t] ?? t}
              </h2>
              <div className="mt-4 space-y-4">
                {grouped[t].map((e) => {
                  const readAloud =
                    e.type === 'location'
                      ? ((e.data ?? {}) as Record<string, unknown>).readAloud
                      : undefined;
                  return (
                    <article
                      key={e.id}
                      className="rounded-xl border border-app-border bg-app-surface p-5"
                    >
                      <div className="flex flex-wrap items-baseline gap-2">
                        <h3 className="font-heading text-lg font-bold">{e.name}</h3>
                        {chips(e).map((c, i) => (
                          <span
                            key={i}
                            className="rounded-full border border-app-border px-2 py-0.5 text-[10px] uppercase tracking-wide text-fg-muted"
                          >
                            {c}
                          </span>
                        ))}
                      </div>
                      {typeof readAloud === 'string' && readAloud.trim() && (
                        <blockquote className="mt-3 border-l-2 border-brand pl-3 text-sm italic text-fg-muted">
                          {readAloud}
                        </blockquote>
                      )}
                      <div className="mt-3">
                        <ProseMirrorView body={e.body} />
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          ))}
        </main>
      </div>

      <footer className="border-t border-app-border px-6 py-4 text-center text-xs text-fg-muted">
        Bound by Myth — this page updates as your GM reveals more of the world.
      </footer>
    </div>
  );
}

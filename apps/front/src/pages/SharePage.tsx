import { useParams } from 'react-router-dom';
import { useShareCampaign, useShareElements, type ShareElement } from '../data/share';
import ProseMirrorView from '../components/ProseMirrorView';

const TYPE_LABELS: Record<string, string> = {
  npc: 'NPCs',
  location: 'Locations',
  encounter: 'Encounters',
  item: 'Items',
  note: 'Notes',
};

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

  return (
    <div className="min-h-screen bg-app-bg text-fg">
      <header className="border-b border-app-border bg-app-surface px-6 py-4">
        <div className="mx-auto max-w-3xl">
          <p className="text-[11px] uppercase tracking-[0.15em] text-fg-muted">Player view</p>
          <h1 className="font-heading text-2xl font-bold">{camp.data.campaign.name}</h1>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-8">
        {(els.data ?? []).length === 0 && (
          <p className="text-sm text-fg-muted">Nothing has been shared yet.</p>
        )}
        {Object.keys(TYPE_LABELS)
          .filter((t) => grouped[t]?.length)
          .map((t) => (
            <section key={t} className="mb-8">
              <h2 className="font-heading text-lg font-bold">{TYPE_LABELS[t]}</h2>
              <div className="mt-3 space-y-4">
                {grouped[t].map((e) => (
                  <article
                    key={e.id}
                    className="rounded-xl border border-app-border bg-app-surface p-4"
                  >
                    <h3 className="font-heading text-base font-bold">{e.name}</h3>
                    <div className="mt-2">
                      <ProseMirrorView body={e.body} />
                    </div>
                  </article>
                ))}
              </div>
            </section>
          ))}
      </main>
    </div>
  );
}

import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useCampaigns, useCreateCampaign, type CampaignFormValues } from '../data/campaigns';
import { useGenerateCampaign } from '../data/ai';
import { useAuth } from '../auth/AuthProvider';
import CampaignForm from '../components/CampaignForm';

export default function Campaigns() {
  const { user } = useAuth();
  const { data: campaigns, isLoading, error } = useCampaigns();
  const create = useCreateCampaign();
  const genCampaign = useGenerateCampaign();
  const [creating, setCreating] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const navigate = useNavigate();

  const onCreate = (values: CampaignFormValues) =>
    create.mutate(values, {
      onSuccess: (campaign) => {
        setCreating(false);
        navigate(`/campaigns/${campaign.id}`);
      },
    });

  return (
    <div className="mx-auto max-w-4xl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Campaigns</h1>
        <div className="flex items-center gap-2">
          {user?.isAdmin && !creating && (
            <button
              onClick={() => setAiOpen((v) => !v)}
              className="rounded-lg border border-app-border px-4 py-2 text-sm text-fg hover:border-fg-muted"
            >
              {aiOpen ? 'Cancel' : '✨ Generate with AI'}
            </button>
          )}
          {!creating && (
            <button
              onClick={() => setCreating(true)}
              className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-app-bg hover:bg-brand-bright"
            >
              + New campaign
            </button>
          )}
        </div>
      </div>

      {aiOpen && (
        <section className="mt-6 rounded-xl border border-app-border bg-app-surface p-5">
          <h2 className="font-heading text-lg font-bold">Generate a campaign with AI</h2>
          <p className="mt-1 text-sm text-fg-muted">
            Describe the premise — the AI drafts a campaign with starter NPCs, locations,
            encounters, and notes you can edit.
          </p>
          <textarea
            value={aiPrompt}
            onChange={(e) => setAiPrompt(e.target.value)}
            rows={3}
            placeholder="A heist in a floating city of clockwork mages…"
            className="mt-3 w-full rounded-lg border border-app-border bg-app-bg px-3 py-2 text-sm outline-none focus:border-brand"
          />
          {genCampaign.error && (
            <p className="mt-2 text-sm text-red-400">
              {genCampaign.error instanceof Error ? genCampaign.error.message : 'Generation failed'}
            </p>
          )}
          <button
            onClick={() =>
              aiPrompt.trim() &&
              genCampaign.mutate(aiPrompt.trim(), {
                onSuccess: (r) => navigate(`/campaigns/${r.campaign.id}`),
              })
            }
            disabled={genCampaign.isPending}
            className="mt-3 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-app-bg hover:bg-brand-bright disabled:opacity-50"
          >
            {genCampaign.isPending ? 'Generating…' : 'Generate campaign'}
          </button>
        </section>
      )}

      {creating && (
        <section className="mt-6 rounded-xl border border-app-border bg-app-surface p-5">
          <h2 className="font-heading text-lg font-bold">New campaign</h2>
          <div className="mt-4">
            <CampaignForm
              submitLabel="Create campaign"
              busy={create.isPending}
              error={create.error instanceof Error ? create.error.message : null}
              onSubmit={onCreate}
              onCancel={() => setCreating(false)}
            />
          </div>
        </section>
      )}

      <div className="mt-6">
        {isLoading && <p className="text-sm text-fg-muted">Loading campaigns…</p>}
        {error && (
          <p className="text-sm text-red-400">
            {error instanceof Error ? error.message : 'Failed to load campaigns'}
          </p>
        )}

        {campaigns && campaigns.length === 0 && !creating && (
          <div className="rounded-xl border border-dashed border-app-border p-10 text-center">
            <p className="text-sm text-fg-muted">
              No campaigns yet. Create your first one to start building.
            </p>
          </div>
        )}

        {campaigns && campaigns.length > 0 && (
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {campaigns.map((c) => (
              <li key={c.id}>
                <Link
                  to={`/campaigns/${c.id}`}
                  className="block rounded-xl border border-app-border bg-app-surface p-4 transition hover:border-fg-muted"
                >
                  <div className="font-heading text-base font-bold">{c.name}</div>
                  {c.hook && <p className="mt-1 text-sm text-fg-muted">{c.hook}</p>}
                  <p className="mt-2 text-[11px] uppercase tracking-wide text-fg-muted">
                    {c.settingName ? `${c.settingName} · ` : ''}Levels {c.startLevel}–
                    {c.endLevel}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

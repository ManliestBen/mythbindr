import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import ThemeQuickSwitch from './ThemeQuickSwitch';
import { useActiveCampaign } from '../campaign/ActiveCampaignProvider';

export default function TopBar() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { campaigns, activeCampaignId } = useActiveCampaign();
  const [q, setQ] = useState('');

  // Section label from the element-type path segment, e.g. /campaigns/:cid/npcs → "Npcs".
  const seg = pathname.split('/')[3];
  const section = seg ? seg.charAt(0).toUpperCase() + seg.slice(1) : null;

  const onSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (activeCampaignId && q.trim()) {
      navigate(`/campaigns/${activeCampaignId}/search?q=${encodeURIComponent(q.trim())}`);
    }
  };

  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-app-border bg-app-surface px-6">
      <div className="flex min-w-0 items-center gap-2">
        {campaigns.length > 0 ? (
          <select
            value={activeCampaignId ?? ''}
            onChange={(e) => e.target.value && navigate(`/campaigns/${e.target.value}`)}
            className="max-w-[220px] truncate rounded-lg border border-app-border bg-app-bg px-2 py-1 text-sm outline-none focus:border-brand"
            aria-label="Switch campaign"
          >
            <option value="" disabled>
              Select a campaign…
            </option>
            {campaigns.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        ) : (
          <h2 className="font-heading text-base font-bold">MythBindr</h2>
        )}
        {section && <span className="truncate text-sm text-fg-muted">› {section}</span>}
      </div>

      <div className="flex items-center gap-3">
        {activeCampaignId && (
          <form onSubmit={onSearch}>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search…"
              className="w-40 rounded-lg border border-app-border bg-app-bg px-2 py-1 text-sm outline-none focus:border-brand"
              aria-label="Search campaign"
            />
          </form>
        )}
        <ThemeQuickSwitch />
      </div>
    </header>
  );
}

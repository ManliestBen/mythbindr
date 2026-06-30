import { NavLink } from 'react-router-dom';
import { useTheme } from '../theme/ThemeProvider';
import { useAuth } from '../auth/AuthProvider';
import { useActiveCampaign } from '../campaign/ActiveCampaignProvider';
import SystemStatus from './SystemStatus';

const ELEMENT_NAV = [
  { type: 'npcs', label: 'NPCs' },
  { type: 'locations', label: 'Locations' },
  { type: 'encounters', label: 'Encounters' },
  { type: 'items', label: 'Items' },
  { type: 'notes', label: 'Notes' },
];

const linkCls = ({ isActive }: { isActive: boolean }) =>
  [
    'flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm',
    isActive ? 'bg-app-surface2 text-fg' : 'text-fg-muted hover:text-fg',
  ].join(' ');

function Dot() {
  return <span className="h-1.5 w-1.5 rounded-full bg-brand" />;
}

export default function Sidebar() {
  const { theme } = useTheme();
  const { user, logout, busy } = useAuth();
  const { activeCampaign } = useActiveCampaign();

  return (
    <aside className="flex h-full w-56 shrink-0 flex-col border-r border-app-border bg-app-surface">
      <div className="flex items-center gap-3 px-5 py-5">
        <div className="grid h-10 w-10 place-items-center rounded-xl border border-app-border bg-app-surface2 font-heading text-xl font-bold text-brand">
          M
        </div>
        <div>
          <div className="font-heading text-lg font-bold leading-none">
            Myth<span className="text-brand">Bindr</span>
          </div>
          <div className="mt-1 text-[11px] italic text-fg-muted">{theme.tagline}</div>
        </div>
      </div>

      <nav className="flex flex-1 flex-col gap-1 overflow-y-auto px-3 py-2">
        <NavLink to="/campaigns" end className={linkCls}>
          <Dot />
          Campaigns
        </NavLink>
        <NavLink to="/reference" className={linkCls}>
          <Dot />
          Reference
        </NavLink>

        {activeCampaign && (
          <div className="mt-3">
            <div className="truncate px-3 pb-1 text-[10px] uppercase tracking-wide text-fg-muted">
              {activeCampaign.name}
            </div>
            <NavLink to={`/campaigns/${activeCampaign.id}`} end className={linkCls}>
              <Dot />
              Overview
            </NavLink>
            {ELEMENT_NAV.map((item) => (
              <NavLink
                key={item.type}
                to={`/campaigns/${activeCampaign.id}/${item.type}`}
                className={linkCls}
              >
                <Dot />
                {item.label}
              </NavLink>
            ))}
            <NavLink to={`/campaigns/${activeCampaign.id}/session`} className={linkCls}>
              <Dot />
              Run Session
            </NavLink>
            <NavLink to={`/campaigns/${activeCampaign.id}/members`} className={linkCls}>
              <Dot />
              Members
            </NavLink>
          </div>
        )}

        <div className="mt-3 border-t border-app-border pt-2">
          <NavLink to="/settings" className={linkCls}>
            <Dot />
            Settings
          </NavLink>
        </div>
      </nav>

      {user && (
        <div className="border-t border-app-border px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="truncate text-sm font-medium">{user.displayName}</span>
                {user.isAdmin && (
                  <span className="rounded-full bg-brand/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-brand">
                    Admin
                  </span>
                )}
              </div>
            </div>
            <button
              onClick={() => logout()}
              disabled={busy}
              className="rounded-md border border-app-border px-2 py-1 text-[11px] text-fg-muted hover:text-fg disabled:opacity-50"
            >
              Sign out
            </button>
          </div>
        </div>
      )}

      <div className="border-t border-app-border px-5 py-3">
        <SystemStatus />
      </div>
    </aside>
  );
}

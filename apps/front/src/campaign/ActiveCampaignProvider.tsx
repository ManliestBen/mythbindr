import { createContext, useContext, useEffect, type ReactNode } from 'react';
import { matchPath, useLocation } from 'react-router-dom';
import { useCampaigns, type Campaign } from '../data/campaigns';

interface ActiveCampaignValue {
  campaigns: Campaign[];
  loading: boolean;
  activeCampaignId: string | null;
  activeCampaign: Campaign | null;
}

const Ctx = createContext<ActiveCampaignValue | null>(null);
const LS_KEY = 'mythbindr.lastCampaignId';

/** Last campaign the user was in — used to land them somewhere sensible. */
export function getLastCampaignId(): string | null {
  try {
    return localStorage.getItem(LS_KEY);
  } catch {
    return null;
  }
}

/**
 * Derives the active campaign from the URL (`/campaigns/:cid/...`), exposes the
 * campaign list, and remembers the last campaign in localStorage.
 */
export function ActiveCampaignProvider({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const match = matchPath('/campaigns/:cid/*', pathname);
  const activeCampaignId = match?.params?.cid ?? null;

  const { data: campaigns = [], isLoading } = useCampaigns();
  const activeCampaign = activeCampaignId
    ? campaigns.find((c) => c.id === activeCampaignId) ?? null
    : null;

  useEffect(() => {
    if (!activeCampaignId) return;
    try {
      localStorage.setItem(LS_KEY, activeCampaignId);
    } catch {
      /* ignore */
    }
  }, [activeCampaignId]);

  return (
    <Ctx.Provider
      value={{ campaigns, loading: isLoading, activeCampaignId, activeCampaign }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useActiveCampaign(): ActiveCampaignValue {
  const v = useContext(Ctx);
  if (!v) {
    throw new Error('useActiveCampaign must be used within ActiveCampaignProvider');
  }
  return v;
}

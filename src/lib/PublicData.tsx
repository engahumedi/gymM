import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { fetchPublicSiteData, readCachedSiteData, type PublicSitePayload } from './api';
import type { Branch, Gym, Plan, Trainer } from './database.types';

interface PublicData {
  gym: Gym | null;
  plans: Plan[];
  branches: Branch[];
  trainers: Trainer[];
  content: Record<string, Record<string, unknown>>;
  loading: boolean;
}

const Ctx = createContext<PublicData | null>(null);

// Everything the marketing site renders comes from the DB (public-readable), so
// any gym rebrands by editing data, not code. It arrives in ONE request
// (public_site_data), and a cached copy from the previous visit is shown
// immediately while the fresh one is on its way — the database is a long way
// from the visitor, and a stale price for a moment beats a spinner for a second.
export function PublicDataProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<PublicSitePayload | null>(() => readCachedSiteData());
  const [loading, setLoading] = useState(() => readCachedSiteData() === null);

  useEffect(() => {
    let active = true;
    fetchPublicSiteData()
      .then((fresh) => {
        if (active) setData(fresh);
      })
      .catch(() => {
        /* keep whatever the cache gave us; pages render their empty states */
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const value: PublicData = {
    gym: data?.gym ?? null,
    plans: data?.plans ?? [],
    branches: data?.branches ?? [],
    trainers: data?.trainers ?? [],
    content: data?.content ?? {},
    loading,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function usePublicData(): PublicData {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('usePublicData must be used within PublicDataProvider');
  return ctx;
}

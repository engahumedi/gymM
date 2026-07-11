import { createContext, useContext, type ReactNode } from 'react';
import { fetchBranches, fetchGym, fetchPlans, fetchSiteContent, fetchTrainers } from './api';
import { useAsync } from './useAsync';
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

// Everything the marketing site renders comes from the DB (public-readable),
// loaded once here so any gym rebrands by editing data, not code.
export function PublicDataProvider({ children }: { children: ReactNode }) {
  const { data, loading } = useAsync(async () => {
    const [gym, plans, branches, trainers, content] = await Promise.all([
      fetchGym(),
      fetchPlans(true),
      fetchBranches(),
      fetchTrainers(),
      fetchSiteContent(),
    ]);
    return { gym, plans, branches, trainers, content };
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

import { createContext, useContext, type ReactNode } from 'react';
import { fetchBranches, fetchGym, fetchPlans } from './api';
import { useAsync } from './useAsync';
import type { Branch, Gym, Plan } from './database.types';

interface RefData {
  gym: Gym | null;
  branches: Branch[];
  plans: Plan[];
  loading: boolean;
  error: string | null;
  reload: () => void;
}

const Ctx = createContext<RefData | null>(null);

// Loads branches + plans once for the dashboard; screens read them via useRef().
export function ReferenceDataProvider({ children }: { children: ReactNode }) {
  const { data, loading, error, reload } = useAsync(
    async () => {
      const [gym, branches, plans] = await Promise.all([fetchGym(), fetchBranches(), fetchPlans()]);
      return { gym, branches, plans };
    },
    [],
  );
  const value: RefData = {
    gym: data?.gym ?? null,
    branches: data?.branches ?? [],
    plans: data?.plans ?? [],
    loading,
    error,
    reload,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useReferenceData(): RefData {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useReferenceData must be used within ReferenceDataProvider');
  return ctx;
}

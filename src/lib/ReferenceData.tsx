import { createContext, useContext, type ReactNode } from 'react';
import { fetchBranches, fetchPlans } from './api';
import { useAsync } from './useAsync';
import type { Branch, Plan } from './database.types';

interface RefData {
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
      const [branches, plans] = await Promise.all([fetchBranches(), fetchPlans()]);
      return { branches, plans };
    },
    [],
  );
  const value: RefData = {
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

import React, { createContext, useContext, useState, useEffect } from 'react';
import { Branch } from '@/types';
import { branchesApi } from '@/api/branches';
import { useAuth } from './AuthContext';

interface BranchContextType {
  branches: Branch[];
  selectedBranch: Branch | null;
  setSelectedBranch: (branch: Branch | null) => void;
  loading: boolean;
}

const BranchContext = createContext<BranchContextType | null>(null);

export function BranchProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [selectedBranch, setSelectedBranch] = useState<Branch | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!user) {
      setBranches([]);
      setSelectedBranch(null);
      return;
    }
    setLoading(true);
    branchesApi.getAll()
      .then((data) => {
        setBranches(data);
        if (user.role === 'receptionist') {
          const myBranch = data.find(b => b.id === user.branch_id) || null;
          setSelectedBranch(myBranch);
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [user]);

  const handleSetSelectedBranch = (branch: Branch | null) => {
    if (user?.role === 'receptionist') return; // locked
    setSelectedBranch(branch);
  };

  return (
    <BranchContext.Provider value={{ branches, selectedBranch, setSelectedBranch: handleSetSelectedBranch, loading }}>
      {children}
    </BranchContext.Provider>
  );
}

export function useBranch() {
  const ctx = useContext(BranchContext);
  if (!ctx) throw new Error('useBranch must be used within BranchProvider');
  return ctx;
}

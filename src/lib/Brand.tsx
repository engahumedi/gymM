import { createContext, useContext, useEffect, type ReactNode } from 'react';
import { fetchGym } from './api';
import { useAsync } from './useAsync';
import type { Gym } from './database.types';

interface BrandData {
  gym: Gym | null;
  reload: () => void;
}

const Ctx = createContext<BrandData | null>(null);

function normHex(v: string | null | undefined): string | null {
  const s = (v ?? '').trim();
  if (!/^#?[0-9a-f]{6}$/i.test(s)) return null;
  return s.startsWith('#') ? s : `#${s}`;
}

// Apply the gym's primary brand color to the --accent design token so a rebrand
// (Settings → Identity) actually re-skins the whole app, not just the DB row.
// --accent drives the crimson accent everywhere via tailwind.config.js.
export function applyBrandColors(gym: Gym | null): void {
  const accent = normHex(gym?.primary_color);
  if (accent) document.documentElement.style.setProperty('--accent', accent);
}

// Fetches the (anon-readable) gym row once at app root, applies its brand colors,
// and exposes it so layouts can render the logo. Kept separate from the heavier
// PublicData/ReferenceData providers so it also covers login / reset screens.
export function BrandProvider({ children }: { children: ReactNode }) {
  const { data, reload } = useAsync(fetchGym, []);
  const gym = data ?? null;

  useEffect(() => {
    applyBrandColors(gym);
  }, [gym]);

  return <Ctx.Provider value={{ gym, reload }}>{children}</Ctx.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useBrand(): BrandData {
  return useContext(Ctx) ?? { gym: null, reload: () => {} };
}

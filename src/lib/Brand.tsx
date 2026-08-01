import { createContext, useContext, useEffect, type ReactNode } from 'react';
import { fetchGym } from './api';
import { useAsync } from './useAsync';
import { localizedName } from './display';
import { useI18n } from '@/i18n/I18nProvider';
import type { Locale } from '@/i18n/dictionary';
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

// index.html is deliberately brand-free (white label), so the document title and
// favicon are branded here instead — from the gym row, in the active language.
// Without a gym row (or a logo) the neutral defaults from index.html stand.
// The neutral favicon shipped in index.html, remembered on first run so that
// clearing the logo in Settings puts it back.
let defaultIcon: { href: string; type: string } | null = null;

export function applyBrandDocument(gym: Gym | null, locale: Locale): void {
  if (!gym) return;

  const name = localizedName(gym, locale).trim();
  if (name && name !== '—') document.title = name;

  let link = document.querySelector<HTMLLinkElement>('link[rel~="icon"]');
  if (!link) {
    link = document.createElement('link');
    link.rel = 'icon';
    document.head.appendChild(link);
  }
  if (!defaultIcon) {
    defaultIcon = { href: link.getAttribute('href') ?? '', type: link.getAttribute('type') ?? '' };
  }

  // An uploaded logo is an arbitrary png/jpg/svg — drop the type and let the
  // browser sniff it; without one, restore the shipped default.
  const logo = (gym.logo_url ?? '').trim();
  const href = logo || defaultIcon.href;
  if (href) link.href = href;
  if (logo) link.removeAttribute('type');
  else if (defaultIcon.type) link.type = defaultIcon.type;
}

// Fetches the (anon-readable) gym row once at app root, applies its brand colors,
// and exposes it so layouts can render the logo. Kept separate from the heavier
// PublicData/ReferenceData providers so it also covers login / reset screens.
export function BrandProvider({ children }: { children: ReactNode }) {
  const { locale } = useI18n();
  const { data, reload } = useAsync(fetchGym, []);
  const gym = data ?? null;

  useEffect(() => {
    applyBrandColors(gym);
  }, [gym]);

  useEffect(() => {
    applyBrandDocument(gym, locale);
  }, [gym, locale]);

  return <Ctx.Provider value={{ gym, reload }}>{children}</Ctx.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useBrand(): BrandData {
  return useContext(Ctx) ?? { gym: null, reload: () => {} };
}

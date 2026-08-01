import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { fetchPublicSiteData, readCachedSiteData } from './api';
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

// Applies the gym's brand at app root — colors, document title, favicon, logo —
// and exposes it so every layout can render the logo. Lives above the router so
// it also covers login / password screens, which have no PublicData provider.
export function BrandProvider({ children }: { children: ReactNode }) {
  const { locale } = useI18n();
  // Shares the single public_site_data request (and its cache) with the public
  // pages, so the brand no longer costs the visitor a second round trip.
  const [gym, setGym] = useState<Gym | null>(() => readCachedSiteData()?.gym ?? null);
  const [nonce, setNonce] = useState(0);
  const reload = () => setNonce((n) => n + 1);

  useEffect(() => {
    let active = true;
    fetchPublicSiteData(nonce > 0)
      .then((site) => {
        if (active) setGym(site.gym);
      })
      .catch(() => {
        /* the neutral defaults in index.html stand */
      });
    return () => {
      active = false;
    };
  }, [nonce]);

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

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { fetchPublicSiteData, readCachedSiteData } from './api';
import { localizedName } from './display';
import { setGymCalendar } from './format';
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

// Relative luminance (WCAG). Used to decide what colour can sit ON the accent.
function luminance(hex: string): number {
  const ch = [1, 3, 5].map((i) => {
    const v = parseInt(hex.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}

// Apply the gym's primary brand color to the --accent design token so a rebrand
// (Settings → Identity) actually re-skins the whole app, not just the DB row.
// --accent drives the accent everywhere via tailwind.config.js.
//
// --accent-on is the text/icon colour that may sit on top of a filled accent
// surface. It is computed, not fixed: the marketing site fills whole bands with
// the accent, and a gym is free to save any colour — hardcoding white text would
// make a pale brand unreadable. Rather than guess a luminance cut-off, take
// whichever of black/white actually scores the higher WCAG contrast; a fixed
// threshold left mid-tone blues just under 4.5:1.
export function applyBrandColors(gym: Gym | null): void {
  const accent = normHex(gym?.primary_color);
  if (!accent) return;
  const l = luminance(accent);
  const onWhite = 1.05 / (l + 0.05); // contrast of white text on the accent
  const onBlack = (l + 0.05) / 0.05; // contrast of black text on the accent
  const root = document.documentElement;
  root.style.setProperty('--accent', accent);
  root.style.setProperty('--accent-on', onBlack > onWhite ? '#0b0c0e' : '#ffffff');
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
    // Dates read Hijri-first or Gregorian-first depending on the gym's own
    // setting, so this has to land before anything formats a date.
    setGymCalendar(gym?.calendar);
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

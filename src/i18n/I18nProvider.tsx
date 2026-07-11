import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  DIRECTION,
  dictionary,
  type Locale,
  type MessageKey,
} from './dictionary';

interface I18nContextValue {
  locale: Locale;
  dir: 'rtl' | 'ltr';
  t: (key: MessageKey) => string;
  setLocale: (locale: Locale) => void;
  toggleLocale: () => void;
}

const I18nContext = createContext<I18nContextValue | null>(null);

const STORAGE_KEY = 'pg.locale';

function initialLocale(): Locale {
  const stored = localStorage.getItem(STORAGE_KEY);
  return stored === 'en' ? 'en' : 'ar'; // Arabic is the default.
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(initialLocale);

  // Reflect language + direction on <html> so layout, tables and charts mirror.
  useEffect(() => {
    const html = document.documentElement;
    html.lang = locale;
    html.dir = DIRECTION[locale];
    localStorage.setItem(STORAGE_KEY, locale);
  }, [locale]);

  const setLocale = useCallback((next: Locale) => setLocaleState(next), []);
  const toggleLocale = useCallback(
    () => setLocaleState((prev) => (prev === 'ar' ? 'en' : 'ar')),
    [],
  );

  const t = useCallback(
    (key: MessageKey) => dictionary[key]?.[locale] ?? key,
    [locale],
  );

  const value = useMemo<I18nContextValue>(
    () => ({ locale, dir: DIRECTION[locale], t, setLocale, toggleLocale }),
    [locale, t, setLocale, toggleLocale],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used within I18nProvider');
  return ctx;
}

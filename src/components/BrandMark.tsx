import { useI18n } from '@/i18n/I18nProvider';
import { useBrand } from '@/lib/Brand';
import { localizedName } from '@/lib/display';

// Renders the gym's uploaded logo when present, falling back to the display
// name. Used in every header so a rebrand's logo shows app-wide.
export function BrandMark({ className = 'text-xl', logoClass = 'h-8' }: { className?: string; logoClass?: string }) {
  const { t, locale } = useI18n();
  const { gym } = useBrand();
  const name = gym ? localizedName(gym, locale) : t('app.name');

  if (gym?.logo_url) {
    return <img src={gym.logo_url} alt={name} className={`${logoClass} w-auto object-contain`} />;
  }
  return <span className={`font-display ${className}`}>{name}</span>;
}

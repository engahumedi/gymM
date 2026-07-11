import { Link } from 'react-router-dom';
import { useI18n } from '@/i18n/I18nProvider';

export function NotFound() {
  const { t } = useI18n();
  return (
    <div className="flex min-h-screen items-center bg-bg px-6">
      <div className="mx-auto w-full max-w-content">
        <p className="font-display text-[8rem] leading-none text-surface-2">404</p>
        <p className="mt-4 text-lg text-muted">{t('notfound.title')}</p>
        <Link to="/" className="mt-6 inline-block text-sm font-semibold text-accent hover:brightness-110">
          {t('common.back_home')}
        </Link>
      </div>
    </div>
  );
}

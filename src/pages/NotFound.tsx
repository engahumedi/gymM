import { Link } from 'react-router-dom';
import { useI18n } from '@/i18n/I18nProvider';

export function NotFound() {
  const { t } = useI18n();
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-slate-950 text-slate-100">
      <p className="text-6xl font-extrabold text-brand">404</p>
      <p className="text-lg">{t('notfound.title')}</p>
      <Link to="/" className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white">
        {t('common.back_home')}
      </Link>
    </div>
  );
}

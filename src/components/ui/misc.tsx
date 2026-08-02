import type { ReactNode } from 'react';
import { useI18n } from '@/i18n/I18nProvider';
import type { MessageKey } from '@/i18n/dictionary';
import { AlertCircle, ICON } from './icons';
import { daysUntil } from '@/lib/format';

// Compact "N days left" / "expired N days ago" counter, coloured by urgency.
export function DaysLeft({ end }: { end: string | null | undefined }) {
  const { t } = useI18n();
  const d = daysUntil(end);
  if (d === null) return <span className="text-faint">—</span>;
  if (d < 0) return <span className="text-accent">{t('days.expired_ago').replace('{n}', String(-d))}</span>;
  const tone = d <= 7 ? 'text-warn' : 'text-good';
  return <span className={tone}>{t('days.left').replace('{n}', String(d))}</span>;
}

// A quiet surface panel — hairline border, small radius, no shadow. Used
// sparingly; most separation is done with hairlines + whitespace instead.
export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`rounded border border-border bg-surface p-5 ${className}`}>{children}</div>;
}

export function Spinner({ className = '' }: { className?: string }) {
  return <span className={`inline-block h-4 w-4 animate-spin rounded-full border border-border-strong border-t-text ${className}`} />;
}

export function InlineLoading() {
  const { t } = useI18n();
  return (
    <div className="flex items-center gap-2 py-10 text-sm text-muted sm:py-16">
      <Spinner /> {t('common.loading')}
    </div>
  );
}

// Skeleton block for loading states (no shimmer glow, just a calm pulse).
export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-surface-2 ${className}`} />;
}

// Empty state: start-aligned, quiet, specific — never dead-centre.
export function EmptyState({ messageKey }: { messageKey: MessageKey }) {
  const { t } = useI18n();
  return (
    <div className="flex items-center gap-3 border-t border-border py-10 text-sm text-muted">
      <AlertCircle {...ICON} className="text-faint" />
      {t(messageKey)}
    </div>
  );
}

export function ErrorText({ error }: { error: string | null }) {
  if (!error) return null;
  return (
    <p className="flex items-center gap-2 border-s-2 border-accent bg-surface-2 px-3 py-2 text-sm text-text">
      <AlertCircle size={15} strokeWidth={1.5} className="shrink-0 text-accent" />
      {error}
    </p>
  );
}

// Editorial page header: small eyebrow + large display title, action pushed to
// the side (asymmetric, not centred).
export function PageHeader({ title, eyebrow, action }: { title: string; eyebrow?: string; action?: ReactNode }) {
  return (
    // Below sm the title and its actions stack: side by side, a two-button
    // action group squeezes an Arabic title into three cramped lines. From sm
    // upwards the row is exactly as it was.
    <div className="mb-6 flex flex-col items-start gap-4 border-b border-border pb-4 sm:mb-8 sm:flex-row sm:items-end sm:justify-between sm:pb-5">
      <div className="min-w-0">
        {eyebrow && <p className="eyebrow mb-1.5">{eyebrow}</p>}
        <h1 className="font-display text-2xl text-text sm:text-3xl md:text-4xl">{title}</h1>
      </div>
      {action && <div className="w-full shrink-0 sm:w-auto sm:pb-1">{action}</div>}
    </div>
  );
}

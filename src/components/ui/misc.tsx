import type { ReactNode } from 'react';
import { useI18n } from '@/i18n/I18nProvider';
import type { MessageKey } from '@/i18n/dictionary';
import { AlertCircle, ICON } from './icons';

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
    <div className="flex items-center gap-2 py-16 text-sm text-muted">
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
    <div className="mb-8 flex items-end justify-between gap-4 border-b border-border pb-5">
      <div>
        {eyebrow && <p className="eyebrow mb-1.5">{eyebrow}</p>}
        <h1 className="font-display text-3xl text-text md:text-4xl">{title}</h1>
      </div>
      {action && <div className="shrink-0 pb-1">{action}</div>}
    </div>
  );
}

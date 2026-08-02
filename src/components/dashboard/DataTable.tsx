import type { ReactNode } from 'react';

/**
 * Responsive data-list primitives for the dashboard and portal.
 *
 * A six- or eight-column table is unreadable on a 390px screen however it
 * scrolls sideways, so every list renders the same data twice: the table at
 * `md+` (unchanged from before), stacked label/value cards below it. This is
 * the pattern the public Plans page uses; it is re-implemented here against the
 * dashboard palette (surface/border) instead of the marketing block palette so
 * the two design languages stay separate.
 *
 * Only one of the two is in the DOM's layout at a time (`hidden` / `md:hidden`),
 * so there is no duplicate content for screen readers to read out.
 */

export function TableWrap({ minWidth = '', children }: { minWidth?: string; children: ReactNode }) {
  return (
    <div className="hidden overflow-x-auto md:block">
      <table className={`w-full text-start text-sm ${minWidth}`}>{children}</table>
    </div>
  );
}

export function Th({ children, className = '' }: { children?: ReactNode; className?: string }) {
  return (
    <th className={`px-3 py-2.5 text-start text-xs font-medium tracking-wide text-muted ${className}`}>
      {children}
    </th>
  );
}

export function Td({ children, dir, className = '' }: { children?: ReactNode; dir?: string; className?: string }) {
  return (
    <td dir={dir} className={`px-3 py-3 ${className}`}>
      {children}
    </td>
  );
}

export function CardList({ children }: { children: ReactNode }) {
  return <ul className="space-y-3 md:hidden">{children}</ul>;
}

/**
 * One record as a stacked card. When `onClick` is given the whole card becomes
 * the tap target — far larger than the 44px minimum — instead of asking for a
 * precise tap on a table row.
 */
export function DataCard({ onClick, children }: { onClick?: () => void; children: ReactNode }) {
  const base = 'w-full rounded border border-border bg-surface p-4 text-start';
  if (!onClick) return <li className={base}>{children}</li>;
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className={`focus-ring min-h-[44px] transition-colors hover:bg-surface-2 ${base}`}
      >
        {children}
      </button>
    </li>
  );
}

/** Card title line: primary value at the start, a status/amount at the end. */
export function CardHead({ title, aside }: { title: ReactNode; aside?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="min-w-0 break-words font-medium text-text">{title}</span>
      {aside !== undefined && aside !== null && <span className="shrink-0 text-end">{aside}</span>}
    </div>
  );
}

export function CardMeta({ children }: { children: ReactNode }) {
  return <dl className="mt-3 space-y-1.5 border-t border-border pt-3">{children}</dl>;
}

export function CardRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="shrink-0 text-xs text-faint">{label}</dt>
      <dd className="min-w-0 break-words text-end text-sm text-text">{children}</dd>
    </div>
  );
}

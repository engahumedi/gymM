import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/auth/AuthProvider';
import { useI18n } from '@/i18n/I18nProvider';
import type { Locale, MessageKey } from '@/i18n/dictionary';
import { fetchMonthlyReport, type MonthlyReport as Report } from '@/lib/api';
import { ReferenceDataProvider, useReferenceData } from '@/lib/ReferenceData';
import { useAsync } from '@/lib/useAsync';
import { riyadhToday } from '@/lib/analytics';
import { localizedName } from '@/lib/display';
import { formatCurrency, formatMonthDual, getGymCalendar } from '@/lib/format';
import type { PaymentMethod } from '@/lib/database.types';
import { Button } from '@/components/ui/Button';
import { Field, SelectInput, TextInput } from '@/components/ui/Field';
import { ErrorText, InlineLoading } from '@/components/ui/misc';
import { ChevronRight, ICON_SM, Printer } from '@/components/ui/icons';

// Printable monthly financial report. Like the receipt, this is a top-level
// route: window.print() then yields the report alone, with no dashboard chrome
// around it, and the sheet itself is white "paper" on the dark app.
//
// Every figure comes from monthly_report(), which is SECURITY INVOKER — RLS
// decides what a reception user sees. The branch filter below is a convenience
// for a super admin, never the thing that scopes the data.

// ---------------------------------------------------------------------------
// Local formatting. Money goes through the shared formatCurrency; counts and
// percentages need the same locale so a report does not mix Arabic-Indic
// digits in the money column with Latin digits in the count column.
// ---------------------------------------------------------------------------
function intlLocale(locale: Locale): string {
  return locale === 'ar' ? 'ar-SA' : 'en-GB';
}

// Dates here pin the Gregorian calendar explicitly. `ar-SA` defaults to Umm
// al-Qura, and a Hijri month does not line up with the Gregorian one this
// report actually covers — Safar 1448 straddles July and August 2026, so
// labelling a 1–31 July total "صفر ١٤٤٨" would be wrong, not just different.
// The digits stay Arabic-Indic either way; only the calendar changes.
function intlDateLocale(locale: Locale): string {
  return locale === 'ar' ? 'ar-SA-u-ca-gregory' : 'en-GB';
}

function formatCount(n: number, locale: Locale): string {
  return new Intl.NumberFormat(intlLocale(locale)).format(n);
}

function formatPercent(fraction: number, locale: Locale, signed = false): string {
  return new Intl.NumberFormat(intlLocale(locale), {
    style: 'percent',
    maximumFractionDigits: 1,
    ...(signed ? { signDisplay: 'exceptZero' as const } : {}),
  }).format(fraction);
}

// 'YYYY-MM' → "July 2026" / "يوليو ٢٠٢٦". Built from the parts rather than
// parsed, so no timezone can push it into the previous month.
function formatMonth(month: string, locale: Locale): string {
  const [y, m] = month.split('-').map(Number);
  if (!y || !m) return month;
  return new Intl.DateTimeFormat(intlDateLocale(locale), { year: 'numeric', month: 'long' })
    .format(new Date(y, m - 1, 1));
}

// The RPC returns 'YYYY-MM-DD HH:MM' already converted to Riyadh wall-clock.
// Rebuilding it from its parts and formatting with no timeZone renders exactly
// those numbers, so a viewer in another timezone still reads the gym's clock.
function formatGenerated(raw: string, locale: Locale): string {
  const p = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})$/.exec(raw);
  if (!p) return raw;
  const [, y, mo, d, h, mi] = p.map(Number);
  return new Intl.DateTimeFormat(intlDateLocale(locale), {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(y, mo - 1, d, h, mi));
}

// A share of nothing is not 0% or NaN — it is unknown.
const NO_VALUE = '—';

function share(part: number, whole: number, locale: Locale): string {
  return whole > 0 ? formatPercent(part / whole, locale) : NO_VALUE;
}

function change(current: number, previous: number, locale: Locale): string {
  return previous > 0 ? formatPercent((current - previous) / previous, locale, true) : NO_VALUE;
}

const METHOD_KEYS: Record<PaymentMethod, MessageKey> = {
  cash: 'method.cash',
  mada: 'method.mada',
  online: 'method.online',
  other: 'method.other',
};

// Paper palette, shared with ReceiptView: the sheet is white so print output is
// clean, which means it cannot use the dark app's text tokens.
const INK = 'text-[#14171a]';
const RULE = 'border-[#e6e2da]';
const RULE_SOFT = 'border-[#efece6]';
const MUTED = 'text-[#8a8578]';
// Same treatment as the app's .eyebrow (which cannot be reused here — it
// carries the dark theme's muted colour): tighter tracking and no uppercase in
// Arabic, where letter-spacing fights the cursive script and caps do not exist.
const LABEL = `text-[11px] font-medium uppercase tracking-[0.16em] rtl:normal-case rtl:tracking-[0.06em] ${MUTED}`;

interface Row {
  key: string;
  label: string;
  count: number;
  total: number;
}

// The provider only wraps the dashboard and portal layouts; this route is
// deliberately outside both, so it brings its own branch/plan/gym reference data.
export function MonthlyReport() {
  return (
    <ReferenceDataProvider>
      <MonthlyReportSheet />
    </ReferenceDataProvider>
  );
}

function MonthlyReportSheet() {
  const { t, locale } = useI18n();
  const { profile } = useAuth();
  const { gym, branches, plans } = useReferenceData();

  const isAdmin = profile?.role === 'super_admin';
  const [month, setMonth] = useState(() => riyadhToday().slice(0, 7));
  const monthSpan = useMemo(() => formatMonthDual(month, locale), [month, locale]);
  const [branchId, setBranchId] = useState('');

  // Reception has no branch choice — RLS already limits them to their own.
  const scope = isAdmin ? branchId || null : null;
  const report = useAsync(() => fetchMonthlyReport(month, scope), [month, scope]);

  const rows = useMemo(() => {
    const r: Report | null = report.data;
    if (!r) return { branch: [] as Row[], plan: [] as Row[], method: [] as Row[] };
    return {
      branch: r.by_branch.map((s, i) => ({
        key: s.branch_id ?? `branch-${i}`,
        label: localizedName(branches.find((b) => b.id === s.branch_id), locale),
        count: s.count,
        total: s.total,
      })),
      plan: r.by_plan.map((s, i) => {
        const plan = plans.find((p) => p.id === s.plan_id);
        return {
          key: s.plan_id ?? `plan-${i}`,
          label: plan ? localizedName(plan, locale) : t('report.unknown_plan'),
          count: s.count,
          total: s.total,
        };
      }),
      method: r.by_method.map((s) => ({
        key: s.method,
        label: t(METHOD_KEYS[s.method]),
        count: s.count,
        total: s.total,
      })),
    };
  }, [report.data, branches, plans, locale, t]);

  const data = report.data;

  return (
    <div className="min-h-screen bg-bg p-4 sm:p-5 print:bg-white print:p-0">
      <div className="mx-auto max-w-3xl">
        {/* Controls — never printed. */}
        <div className="mb-5 print:hidden">
          <Link
            to="/dashboard"
            className="focus-ring inline-flex min-h-[44px] items-center gap-1 text-sm text-muted hover:text-text"
          >
            <ChevronRight {...ICON_SM} className="rotate-180 rtl:rotate-0" />
            {t('common.back')}
          </Link>

          <div className="mt-2 flex flex-wrap items-end gap-3">
            <div className="w-full sm:w-56">
              <Field label={t('report.month')}>
                <TextInput
                  type="month"
                  dir="ltr"
                  className="focus-ring min-h-[44px]"
                  value={month}
                  onChange={(e) => setMonth(e.target.value || month)}
                />
              </Field>
              {/* A Gregorian month straddles two Hijri months; show which span
                  these figures actually cover. */}
              {monthSpan && (
                <p className="mt-1.5 text-xs text-faint">
                  <span className="text-muted">{getGymCalendar() === 'hijri' ? t('cal.hijri') : t('cal.gregorian')}:</span>{' '}
                  {monthSpan.primary}
                </p>
              )}
            </div>

            {isAdmin && (
              <div className="w-full sm:w-56">
                <Field label={t('analytics.filter.branch')}>
                  <SelectInput
                    className="focus-ring min-h-[44px]"
                    value={branchId}
                    onChange={(e) => setBranchId(e.target.value)}
                  >
                    <option value="">{t('report.branch_all')}</option>
                    {branches.map((b) => (
                      <option key={b.id} value={b.id}>{localizedName(b, locale)}</option>
                    ))}
                  </SelectInput>
                </Field>
              </div>
            )}

            <Button
              onClick={() => window.print()}
              className="focus-ring min-h-[44px] w-full sm:ms-auto sm:w-auto"
            >
              <Printer {...ICON_SM} />
              {t('report.print')}
            </Button>
          </div>

          {report.error && (
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <ErrorText error={report.error} />
              <Button variant="secondary" className="focus-ring min-h-[44px]" onClick={report.reload}>
                {t('common.retry')}
              </Button>
            </div>
          )}
        </div>

        {/* The sheet. */}
        <div className={`bg-white p-4 sm:p-10 print:p-6 ${INK}`}>
          <div className={`flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b ${RULE} pb-5`}>
            <span className="font-display text-xl">{gym ? localizedName(gym, locale) : ''}</span>
            <span className={LABEL}>{t('report.title')}</span>
          </div>

          <div className={`mt-4 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 text-xs ${MUTED}`}>
            <span className="font-medium">{formatMonth(month, locale)}</span>
            {data?.generated_at && (
              <span>{t('report.generated')} {formatGenerated(data.generated_at, locale)}</span>
            )}
          </div>

          {report.loading || !data ? (
            <InlineLoading />
          ) : (
            <>
              <div className={`mt-7 border-b ${RULE} pb-6`}>
                <p className={`${LABEL} mb-2`}>{t('report.revenue')}</p>
                <p className="font-display text-4xl leading-none">{formatCurrency(data.revenue, locale)}</p>
              </div>

              <div className="grid grid-cols-2 gap-x-6 gap-y-5 py-6 sm:grid-cols-5">
                <Figure label={t('report.revenue_prev')} value={formatCurrency(data.revenue_prev, locale)} />
                <Figure label={t('report.change')} value={change(data.revenue, data.revenue_prev, locale)} />
                <Figure label={t('report.payments_count')} value={formatCount(data.payments_count, locale)} />
                <Figure label={t('report.new_members')} value={formatCount(data.new_members, locale)} />
                <Figure label={t('report.active_members')} value={formatCount(data.active_members, locale)} />
              </div>

              {data.payments_count === 0 ? (
                <p className={`border-t ${RULE} pt-6 text-sm ${MUTED}`}>{t('report.empty')}</p>
              ) : (
                <div className="space-y-9">
                  <Table title={t('report.by_branch')} head={t('members.col.branch')} rows={rows.branch} revenue={data.revenue} />
                  <Table title={t('report.by_plan')} head={t('sub.col.plan')} rows={rows.plan} revenue={data.revenue} />
                  <Table title={t('report.by_method')} head={t('pay.col.method')} rows={rows.method} revenue={data.revenue} />
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// justify-between keeps the numbers on one line across the row even when a
// longer label wraps to two — grid items stretch, so the values stay aligned.
function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col justify-between gap-1.5">
      <p className={LABEL}>{label}</p>
      <p className="font-display text-xl leading-none">{value}</p>
    </div>
  );
}

// Each table scrolls inside its own container: on a 390px phone the money
// column cannot shrink, and the page itself must never scroll sideways.
function Table({
  title,
  head,
  rows,
  revenue,
}: {
  title: string;
  head: string;
  rows: Row[];
  revenue: number;
}) {
  const { t, locale } = useI18n();
  if (rows.length === 0) return null;

  return (
    <section className="break-inside-avoid">
      <h2 className={`border-t ${RULE} pt-5 text-sm font-semibold`}>{title}</h2>
      <div className="mt-2 overflow-x-auto print:overflow-visible">
        <table className="w-full text-sm">
          <thead>
            <tr className={`border-b ${RULE} ${LABEL}`}>
              <th className="py-2 pe-3 text-start font-medium">{head}</th>
              <th className="py-2 pe-3 text-end font-medium">{t('report.col.count')}</th>
              <th className="py-2 pe-3 text-end font-medium">{t('report.col.total')}</th>
              <th className="py-2 text-end font-medium">{t('report.col.share')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} className={`border-b ${RULE_SOFT}`}>
                <td className="py-2.5 pe-3">{r.label}</td>
                <td className="py-2.5 pe-3 text-end tabular-nums">{formatCount(r.count, locale)}</td>
                <td className="whitespace-nowrap py-2.5 pe-3 text-end tabular-nums">
                  {formatCurrency(r.total, locale)}
                </td>
                <td className={`whitespace-nowrap py-2.5 text-end tabular-nums ${MUTED}`}>
                  {share(r.total, revenue, locale)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

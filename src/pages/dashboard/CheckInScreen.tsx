import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useI18n } from '@/i18n/I18nProvider';
import { useAuth } from '@/auth/AuthProvider';
import { useReferenceData } from '@/lib/ReferenceData';
import { fetchMembers, fetchTodayCheckIns, recordCheckIn, type MemberListItem } from '@/lib/api';
import { useAsync } from '@/lib/useAsync';
import { errorMessageKey } from '@/lib/errors';
import { localizedName } from '@/lib/display';
import { formatDate, formatDateTime } from '@/lib/format';
import { pickCurrent, subscriptionDisplayStatus } from '@/lib/subscriptionStatus';
import { StatusBadge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { SelectInput } from '@/components/ui/Field';
import { EmptyState, InlineLoading, PageHeader } from '@/components/ui/misc';
import { QrScanner } from '@/components/QrScanner';
import { Search, Check, AlertCircle, ArrowRight, QrCode, ICON, ICON_SM } from '@/components/ui/icons';

export function CheckInScreen() {
  const { t, locale } = useI18n();
  const { profile } = useAuth();
  const { branches } = useReferenceData();
  const navigate = useNavigate();

  const members = useAsync(fetchMembers, []);
  const todays = useAsync(fetchTodayCheckIns, []);

  const [query, setQuery] = useState('');
  const [branchId, setBranchId] = useState(profile?.branch_id ?? branches[0]?.id ?? '');
  const [result, setResult] = useState<{ memberId: string; ok: boolean; msgKey: string } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scanMsg, setScanMsg] = useState<string | null>(null);

  const effectiveBranch = profile?.role === 'reception' ? profile.branch_id ?? '' : branchId;

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [] as MemberListItem[];
    return (members.data ?? []).filter((m) => `${m.full_name} ${m.phone} ${m.member_code ?? ''}`.toLowerCase().includes(q)).slice(0, 8);
  }, [members.data, query]);

  async function doCheckIn(m: MemberListItem) {
    if (!effectiveBranch) return;
    setBusyId(m.id); setResult(null);
    try {
      await recordCheckIn(m.id, effectiveBranch);
      setResult({ memberId: m.id, ok: true, msgKey: 'checkin.success' });
      todays.reload();
    } catch (err) {
      setResult({ memberId: m.id, ok: false, msgKey: errorMessageKey(err instanceof Error ? err.message : '') });
    } finally { setBusyId(null); }
  }

  // A scanned QR carries the member_code. Look it up in the RLS-scoped member
  // list and record the check-in immediately, so a scan reflects in the system
  // exactly like a manual check-in.
  function onScan(text: string) {
    const code = text.trim().toLowerCase();
    setScanMsg(null);
    const m = (members.data ?? []).find((x) => (x.member_code ?? '').toLowerCase() === code);
    setScanning(false);
    if (!m) {
      setQuery(text.trim());
      setScanMsg(t('scan.not_found'));
      return;
    }
    setQuery(m.full_name);
    doCheckIn(m);
  }

  const branchName = (id: string | null) => { const b = branches.find((x) => x.id === id); return b ? localizedName(b, locale) : '—'; };

  return (
    <div>
      <PageHeader
        eyebrow={t('checkin.eyebrow')}
        title={t('checkin.title')}
        action={
          <div className="flex items-center gap-2">
            {profile?.role !== 'reception' && (
              <SelectInput value={branchId} onChange={(e) => setBranchId(e.target.value)} className="w-auto">
                {branches.map((b) => <option key={b.id} value={b.id}>{localizedName(b, locale)}</option>)}
              </SelectInput>
            )}
            <Button variant="secondary" onClick={() => { setScanMsg(null); setScanning(true); }} disabled={!effectiveBranch}>
              <QrCode {...ICON_SM} /> {t('scan.button')}
            </Button>
          </div>
        }
      />

      {scanMsg && (
        <p className="mb-4 flex items-center gap-2 border-s-2 border-accent bg-surface-2 px-3 py-2 text-sm text-text">
          <AlertCircle {...ICON_SM} className="text-accent" /> {scanMsg}
        </p>
      )}
      {scanning && <QrScanner onScan={onScan} onClose={() => setScanning(false)} />}

      <div className="relative mb-8">
        <Search {...ICON} className="pointer-events-none absolute inset-y-0 my-auto text-faint start-4" />
        <input
          autoFocus
          placeholder={t('checkin.search')}
          value={query}
          onChange={(e) => { setQuery(e.target.value); setResult(null); }}
          className="w-full rounded border border-border bg-surface py-4 text-lg text-text outline-none transition-colors focus:border-accent placeholder:text-faint ps-12 pe-4"
        />
      </div>

      {members.loading ? (
        <InlineLoading />
      ) : query.trim() === '' ? (
        <p className="text-sm text-faint">{t('checkin.search_hint')}</p>
      ) : matches.length === 0 ? (
        <EmptyState messageKey="checkin.no_match" />
      ) : (
        <ul className="mb-12">
          {matches.map((m) => {
            const sub = pickCurrent(m.subscriptions ?? []);
            const status = subscriptionDisplayStatus(sub);
            const res = result?.memberId === m.id ? result : null;
            return (
              <li key={m.id} className="border-b border-border">
                <div className="flex items-center gap-4 py-4">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center border border-border-strong font-display text-lg text-faint">
                    {m.full_name.charAt(0)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-3">
                      <button className="truncate font-medium text-text hover:text-accent" onClick={() => navigate(`/dashboard/members/${m.id}`)}>{m.full_name}</button>
                      <StatusBadge status={status} />
                    </div>
                    <p dir="ltr" className="text-start text-xs text-faint">
                      {m.member_code} · {m.phone}{sub?.end_date ? ` · ${t('checkin.expiry')} ${formatDate(sub.end_date, locale)}` : ''}
                    </p>
                  </div>
                  <Button loading={busyId === m.id} onClick={() => doCheckIn(m)}>{t('checkin.do')}</Button>
                </div>
                {res && (
                  <div className={`flex items-center justify-between gap-2 pb-3 text-sm ${res.ok ? 'text-good' : 'text-accent'}`}>
                    <span className="flex items-center gap-2">
                      {res.ok ? <Check {...ICON_SM} /> : <AlertCircle {...ICON_SM} />}
                      {res.ok ? t('checkin.success') : `${t('checkin.blocked')} — ${t(res.msgKey as never)}`}
                    </span>
                    {!res.ok && (
                      <button className="inline-flex items-center gap-1 font-semibold text-text hover:text-accent" onClick={() => navigate(`/dashboard/members/${m.id}`)}>
                        {t('checkin.go_renew')} <ArrowRight {...ICON_SM} className="rtl:rotate-180" />
                      </button>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <section>
        <p className="eyebrow mb-3 border-b border-border pb-3">{t('checkin.today')}</p>
        {todays.loading ? (
          <InlineLoading />
        ) : (todays.data ?? []).length === 0 ? (
          <EmptyState messageKey="checkin.empty" />
        ) : (
          <ul>
            {(todays.data ?? []).map((c) => (
              <li key={c.id} className="flex items-center justify-between border-b border-border py-2.5 text-sm">
                <span className="text-text">{c.members?.full_name ?? '—'}</span>
                <span className="text-faint">{branchName(c.branch_id)} · {formatDateTime(c.checked_in_at, locale)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

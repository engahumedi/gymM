import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useI18n } from '@/i18n/I18nProvider';
import { useAuth } from '@/auth/AuthProvider';
import { useReferenceData } from '@/lib/ReferenceData';
import {
  fetchTodayCheckIns, findMemberByCode, recordCheckIn, searchMembersQuick, signedPhotoUrl,
  type MemberOverview,
} from '@/lib/api';
import { useAsync, useDebounced } from '@/lib/useAsync';
import { errorMessageKey } from '@/lib/errors';
import { localizedName } from '@/lib/display';
import { formatDate, formatDateTime } from '@/lib/format';
import { StatusBadge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { SelectInput } from '@/components/ui/Field';
import { EmptyState, InlineLoading, PageHeader } from '@/components/ui/misc';
import { QrScanner } from '@/components/QrScanner';
import { Search, Check, AlertCircle, ArrowRight, QrCode, ICON, ICON_SM } from '@/components/ui/icons';
import type { MessageKey } from '@/i18n/dictionary';

interface CheckInResult { memberId: string; ok: boolean; msgKey: MessageKey }

export function CheckInScreen() {
  const { t, locale } = useI18n();
  const { profile } = useAuth();
  const { branches } = useReferenceData();
  const navigate = useNavigate();

  const todays = useAsync(fetchTodayCheckIns, []);

  const [query, setQuery] = useState('');
  const [branchId, setBranchId] = useState(profile?.branch_id ?? branches[0]?.id ?? '');
  const [result, setResult] = useState<CheckInResult | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scanMsg, setScanMsg] = useState<string | null>(null);
  const [scanned, setScanned] = useState<MemberOverview | null>(null);

  const effectiveBranch = profile?.role === 'reception' ? profile.branch_id ?? '' : branchId;

  // The search runs on the server (indexed ilike over the RLS-scoped view),
  // debounced so typing does not fire a request per keystroke.
  const debouncedQuery = useDebounced(query.trim(), 300);
  const matches = useAsync(() => searchMembersQuick(debouncedQuery, 8), [debouncedQuery]);
  const rows = debouncedQuery ? matches.data ?? [] : [];

  async function doCheckIn(m: MemberOverview) {
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

  // A scanned QR carries the member_code, which is short and sequential — so a
  // scan only RESOLVES the member and shows their card. Reception confirms the
  // identity against the photo before the check-in is recorded.
  const onScan = useCallback(async (text: string) => {
    setScanning(false);
    setScanMsg(null);
    setResult(null);
    try {
      const m = await findMemberByCode(text);
      if (!m) { setScanned(null); setScanMsg(t('scan.not_found')); return; }
      setScanned(m);
    } catch {
      setScanned(null);
      setScanMsg(t('scan.not_found'));
    }
  }, [t]);

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
            <Button variant="secondary" onClick={() => { setScanMsg(null); setScanned(null); setScanning(true); }} disabled={!effectiveBranch}>
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

      {scanned && (
        <ScannedMember
          member={scanned}
          busy={busyId === scanned.id}
          result={result?.memberId === scanned.id ? result : null}
          onConfirm={() => doCheckIn(scanned)}
          onDismiss={() => { setScanned(null); setResult(null); }}
          onOpen={() => navigate(`/dashboard/members/${scanned.id}`)}
        />
      )}

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

      {debouncedQuery === '' ? (
        <p className="text-sm text-faint">{t('checkin.search_hint')}</p>
      ) : matches.loading ? (
        <InlineLoading />
      ) : rows.length === 0 ? (
        <EmptyState messageKey="checkin.no_match" />
      ) : (
        <ul className="mb-12">
          {rows.map((m) => {
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
                      <StatusBadge status={m.display_status} />
                    </div>
                    <p dir="ltr" className="text-start text-xs text-faint">
                      {m.member_code} · {m.phone}{m.end_date ? ` · ${t('checkin.expiry')} ${formatDate(m.end_date, locale)}` : ''}
                    </p>
                  </div>
                  <Button loading={busyId === m.id} onClick={() => doCheckIn(m)}>{t('checkin.do')}</Button>
                </div>
                {res && (
                  <div className={`flex items-center justify-between gap-2 pb-3 text-sm ${res.ok ? 'text-good' : 'text-accent'}`}>
                    <span className="flex items-center gap-2">
                      {res.ok ? <Check {...ICON_SM} /> : <AlertCircle {...ICON_SM} />}
                      {res.ok ? t('checkin.success') : `${t('checkin.blocked')} — ${t(res.msgKey)}`}
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

// The scan result: identity card first, check-in only on an explicit confirm.
function ScannedMember({
  member,
  busy,
  result,
  onConfirm,
  onDismiss,
  onOpen,
}: {
  member: MemberOverview;
  busy: boolean;
  result: CheckInResult | null;
  onConfirm: () => void;
  onDismiss: () => void;
  onOpen: () => void;
}) {
  const { t, locale } = useI18n();
  const photo = useAsync(() => signedPhotoUrl(member.photo_url), [member.photo_url]);

  return (
    <section className="mb-8 border-y border-border-strong py-5">
      <div className="flex flex-wrap items-center gap-5">
        <div className="h-20 w-20 shrink-0 overflow-hidden border border-border-strong">
          {photo.data ? (
            <img src={photo.data} alt={member.full_name} className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center font-display text-2xl text-faint">{member.full_name.charAt(0)}</div>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-3">
            <button className="truncate font-display text-2xl text-text hover:text-accent" onClick={onOpen}>{member.full_name}</button>
            <StatusBadge status={member.display_status} />
          </div>
          <p dir="ltr" className="mt-1 text-start text-xs text-faint">
            {member.member_code} · {member.phone}
            {member.end_date ? ` · ${t('checkin.expiry')} ${formatDate(member.end_date, locale)}` : ''}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {!result?.ok && (
            <Button loading={busy} onClick={onConfirm}><Check {...ICON_SM} />{t('checkin.do')}</Button>
          )}
          <Button variant="secondary" onClick={onDismiss}>{t('common.close')}</Button>
        </div>
      </div>

      {result && (
        <p className={`mt-3 flex items-center gap-2 text-sm ${result.ok ? 'text-good' : 'text-accent'}`}>
          {result.ok ? <Check {...ICON_SM} /> : <AlertCircle {...ICON_SM} />}
          {result.ok ? t('checkin.success') : `${t('checkin.blocked')} — ${t(result.msgKey)}`}
        </p>
      )}
    </section>
  );
}

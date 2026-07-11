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
import { TextInput, SelectInput } from '@/components/ui/Field';
import { Card, EmptyState, InlineLoading, PageHeader } from '@/components/ui/misc';

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

  const effectiveBranch = profile?.role === 'reception' ? profile.branch_id ?? '' : branchId;

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [] as MemberListItem[];
    return (members.data ?? [])
      .filter((m) => `${m.full_name} ${m.phone} ${m.member_code ?? ''}`.toLowerCase().includes(q))
      .slice(0, 8);
  }, [members.data, query]);

  async function doCheckIn(m: MemberListItem) {
    if (!effectiveBranch) return;
    setBusyId(m.id);
    setResult(null);
    try {
      await recordCheckIn(m.id, effectiveBranch);
      setResult({ memberId: m.id, ok: true, msgKey: 'checkin.success' });
      todays.reload();
    } catch (err) {
      setResult({ memberId: m.id, ok: false, msgKey: errorMessageKey(err instanceof Error ? err.message : '') });
    } finally {
      setBusyId(null);
    }
  }

  const branchName = (id: string | null) => {
    const b = branches.find((x) => x.id === id);
    return b ? localizedName(b, locale) : '—';
  };

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title={t('checkin.title')} />

      {profile?.role !== 'reception' && (
        <div className="mb-3">
          <SelectInput value={branchId} onChange={(e) => setBranchId(e.target.value)} className="max-w-xs">
            {branches.map((b) => (
              <option key={b.id} value={b.id}>{localizedName(b, locale)}</option>
            ))}
          </SelectInput>
        </div>
      )}

      <TextInput
        autoFocus
        placeholder={t('checkin.search')}
        value={query}
        onChange={(e) => { setQuery(e.target.value); setResult(null); }}
        className="mb-4 text-lg"
      />

      {members.loading ? (
        <InlineLoading />
      ) : query.trim() === '' ? (
        <p className="py-6 text-center text-sm text-slate-400">{t('checkin.search_hint')}</p>
      ) : matches.length === 0 ? (
        <EmptyState messageKey="checkin.no_match" />
      ) : (
        <div className="space-y-3">
          {matches.map((m) => {
            const sub = pickCurrent(m.subscriptions ?? []);
            const status = subscriptionDisplayStatus(sub);
            const res = result?.memberId === m.id ? result : null;
            return (
              <Card key={m.id}>
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-lg text-slate-400">
                    {m.full_name.charAt(0)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <button
                        className="truncate font-semibold text-ink hover:text-brand"
                        onClick={() => navigate(`/dashboard/members/${m.id}`)}
                      >
                        {m.full_name}
                      </button>
                      <StatusBadge status={status} />
                    </div>
                    <p dir="ltr" className="text-start text-xs text-slate-400">
                      {m.member_code} · {m.phone}
                    </p>
                    {sub?.end_date && (
                      <p className="text-xs text-slate-400">{t('checkin.expiry')}: {formatDate(sub.end_date, locale)}</p>
                    )}
                  </div>
                  <Button loading={busyId === m.id} onClick={() => doCheckIn(m)}>
                    {t('checkin.do')}
                  </Button>
                </div>

                {res && (
                  <div
                    className={`mt-3 rounded-lg px-3 py-2 text-sm ${
                      res.ok ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span>{res.ok ? t('checkin.success') : `${t('checkin.blocked')}: ${t(res.msgKey as never)}`}</span>
                      {!res.ok && (
                        <button
                          className="shrink-0 font-semibold underline"
                          onClick={() => navigate(`/dashboard/members/${m.id}`)}
                        >
                          {t('checkin.go_renew')}
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {/* Today's feed */}
      <div className="mt-8">
        <h3 className="mb-2 text-sm font-semibold text-slate-500">{t('checkin.today')}</h3>
        {todays.loading ? (
          <InlineLoading />
        ) : (todays.data ?? []).length === 0 ? (
          <EmptyState messageKey="checkin.empty" />
        ) : (
          <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
            {(todays.data ?? []).map((c) => (
              <div key={c.id} className="flex items-center justify-between px-3 py-2 text-sm">
                <span className="font-medium text-ink">{c.members?.full_name ?? '—'}</span>
                <span className="text-slate-400">{branchName(c.branch_id)} · {formatDateTime(c.checked_in_at, locale)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

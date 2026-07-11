import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useI18n } from '@/i18n/I18nProvider';
import { useAuth } from '@/auth/AuthProvider';
import { useReferenceData } from '@/lib/ReferenceData';
import { fetchMembers, type MemberListItem } from '@/lib/api';
import { useAsync } from '@/lib/useAsync';
import { localizedName } from '@/lib/display';
import { formatDate } from '@/lib/format';
import { pickCurrent, subscriptionDisplayStatus, type DisplayStatus } from '@/lib/subscriptionStatus';
import { StatusBadge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { SelectInput } from '@/components/ui/Field';
import { InlineLoading, EmptyState, ErrorText, PageHeader, DaysLeft } from '@/components/ui/misc';
import { Search, UserPlus, ICON_SM } from '@/components/ui/icons';

const STATUS_OPTIONS: DisplayStatus[] = ['active', 'expiring', 'expired', 'frozen', 'pending', 'none'];

export function MembersList() {
  const { t, locale } = useI18n();
  const { profile } = useAuth();
  const { branches } = useReferenceData();
  const navigate = useNavigate();
  const { data, loading, error } = useAsync(fetchMembers, []);

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<DisplayStatus | ''>('');
  const [branchFilter, setBranchFilter] = useState('');
  const isAdmin = profile?.role === 'super_admin';

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (data ?? [])
      .map((m) => { const sub = pickCurrent(m.subscriptions ?? []); return { m, sub, status: subscriptionDisplayStatus(sub) }; })
      .filter(({ m, status }) => {
        if (q && !`${m.full_name} ${m.phone} ${m.member_code ?? ''}`.toLowerCase().includes(q)) return false;
        if (statusFilter && status !== statusFilter) return false;
        if (branchFilter && m.branch_id !== branchFilter) return false;
        return true;
      });
  }, [data, search, statusFilter, branchFilter]);

  const branchName = (id: string | null) => {
    const b = branches.find((x) => x.id === id);
    return b ? localizedName(b, locale) : '—';
  };

  return (
    <div>
      <PageHeader
        eyebrow={data ? `${data.length} ${t('members.count')}` : undefined}
        title={t('members.title')}
        action={<Button onClick={() => navigate('/dashboard/members/new')}><UserPlus {...ICON_SM} />{t('members.register')}</Button>}
      />

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 basis-64">
          <Search {...ICON_SM} className="pointer-events-none absolute inset-y-0 my-auto text-faint start-3" />
          <input
            placeholder={t('members.search')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded border border-border bg-surface py-2 text-sm text-text outline-none transition-colors focus:border-accent placeholder:text-faint ps-9 pe-3"
          />
        </div>
        <SelectInput value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as DisplayStatus | '')} className="w-auto">
          <option value="">{t('members.filter.status')}</option>
          {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{t(`status.${s}` as never)}</option>)}
        </SelectInput>
        {isAdmin && (
          <SelectInput value={branchFilter} onChange={(e) => setBranchFilter(e.target.value)} className="w-auto">
            <option value="">{t('members.filter.branch')}</option>
            {branches.map((b) => <option key={b.id} value={b.id}>{localizedName(b, locale)}</option>)}
          </SelectInput>
        )}
      </div>

      <ErrorText error={error} />
      {loading ? (
        <InlineLoading />
      ) : rows.length === 0 ? (
        <EmptyState messageKey="members.empty" />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[52rem] text-start text-sm">
            <thead>
              <tr className="border-b border-border text-xs tracking-wide text-muted">
                <Th>{t('members.col.code')}</Th><Th>{t('members.col.name')}</Th>
                <Th>{t('members.col.phone')}</Th><Th>{t('members.col.branch')}</Th>
                <Th>{t('members.col.start')}</Th><Th>{t('members.col.end')}</Th>
                <Th>{t('members.col.remaining')}</Th><Th>{t('members.col.status')}</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ m, sub, status }) => (
                <tr
                  key={m.id}
                  onClick={() => navigate(`/dashboard/members/${m.id}`)}
                  className="cursor-pointer border-b border-border transition-colors hover:bg-surface"
                >
                  <Td className="font-mono text-xs text-faint">{m.member_code}</Td>
                  <Td className="font-medium text-text">{m.full_name}</Td>
                  <Td dir="ltr" className="text-start text-muted">{m.phone}</Td>
                  <Td className="text-muted">{branchName(m.branch_id)}</Td>
                  <Td className="text-muted">{formatDate(sub?.start_date, locale)}</Td>
                  <Td className="text-muted">{formatDate(sub?.end_date, locale)}</Td>
                  <Td>{sub && (sub.status === 'active' || sub.status === 'frozen') ? <DaysLeft end={sub.end_date} /> : <span className="text-faint">—</span>}</Td>
                  <Td><StatusBadge status={status} /></Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="px-3 py-2.5 text-start font-medium">{children}</th>;
}
function Td({ children, className = '', dir }: { children: React.ReactNode; className?: string; dir?: string }) {
  return <td dir={dir} className={`px-3 py-3 ${className}`}>{children}</td>;
}

export type { MemberListItem };

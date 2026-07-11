import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useI18n } from '@/i18n/I18nProvider';
import { useAuth } from '@/auth/AuthProvider';
import { useReferenceData } from '@/lib/ReferenceData';
import { fetchMembers, type MemberListItem } from '@/lib/api';
import { useAsync } from '@/lib/useAsync';
import { localizedName } from '@/lib/display';
import {
  pickCurrent,
  subscriptionDisplayStatus,
  type DisplayStatus,
} from '@/lib/subscriptionStatus';
import { StatusBadge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { TextInput, SelectInput } from '@/components/ui/Field';
import { InlineLoading, EmptyState, ErrorText, PageHeader } from '@/components/ui/misc';

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
    const members = data ?? [];
    const q = search.trim().toLowerCase();
    return members
      .map((m) => ({ m, status: subscriptionDisplayStatus(pickCurrent(m.subscriptions ?? [])) }))
      .filter(({ m, status }) => {
        if (q) {
          const hay = `${m.full_name} ${m.phone} ${m.member_code ?? ''}`.toLowerCase();
          if (!hay.includes(q)) return false;
        }
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
        title={`${t('members.title')}`}
        action={
          <Button onClick={() => navigate('/dashboard/members/new')}>{t('members.register')}</Button>
        }
      />

      <div className="mb-4 flex flex-wrap gap-2">
        <TextInput
          placeholder={t('members.search')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs flex-1"
        />
        <SelectInput
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as DisplayStatus | '')}
          className="w-auto"
        >
          <option value="">{t('members.filter.status')}: {t('common.all')}</option>
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {t(`status.${s}` as never)}
            </option>
          ))}
        </SelectInput>
        {isAdmin && (
          <SelectInput
            value={branchFilter}
            onChange={(e) => setBranchFilter(e.target.value)}
            className="w-auto"
          >
            <option value="">{t('members.filter.branch')}: {t('common.all')}</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {localizedName(b, locale)}
              </option>
            ))}
          </SelectInput>
        )}
      </div>

      <ErrorText error={error} />
      {loading ? (
        <InlineLoading />
      ) : rows.length === 0 ? (
        <EmptyState messageKey="members.empty" />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-start text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-slate-500">
              <tr>
                <Th>{t('members.col.code')}</Th>
                <Th>{t('members.col.name')}</Th>
                <Th>{t('members.col.phone')}</Th>
                <Th>{t('members.col.branch')}</Th>
                <Th>{t('members.col.status')}</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ m, status }) => (
                <tr
                  key={m.id}
                  className="cursor-pointer border-b border-slate-100 last:border-0 hover:bg-slate-50"
                  onClick={() => navigate(`/dashboard/members/${m.id}`)}
                >
                  <Td className="font-mono text-xs text-slate-500">{m.member_code}</Td>
                  <Td className="font-medium text-ink">
                    <Link to={`/dashboard/members/${m.id}`} onClick={(e) => e.stopPropagation()}>
                      {m.full_name}
                    </Link>
                  </Td>
                  <Td dir="ltr" className="text-slate-600">{m.phone}</Td>
                  <Td className="text-slate-600">{branchName(m.branch_id)}</Td>
                  <Td><StatusBadge status={status} /></Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {!loading && rows.length > 0 && (
        <p className="mt-2 text-xs text-slate-400">{rows.length} {t('members.count')}</p>
      )}
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="px-3 py-2 text-start font-medium">{children}</th>;
}
function Td({ children, className = '', dir }: { children: React.ReactNode; className?: string; dir?: string }) {
  return <td dir={dir} className={`px-3 py-2 ${className}`}>{children}</td>;
}

export type { MemberListItem };

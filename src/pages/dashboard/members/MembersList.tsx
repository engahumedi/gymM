import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useI18n } from '@/i18n/I18nProvider';
import { useAuth } from '@/auth/AuthProvider';
import { useReferenceData } from '@/lib/ReferenceData';
import { fetchMembersPage, DEFAULT_PAGE_SIZE } from '@/lib/api';
import { useDebounced, usePaged } from '@/lib/useAsync';
import { localizedName } from '@/lib/display';
import { formatDate } from '@/lib/format';
import type { MemberDisplayStatus } from '@/lib/database.types';
import { StatusBadge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { SelectInput } from '@/components/ui/Field';
import { InlineLoading, EmptyState, ErrorText, PageHeader, DaysLeft } from '@/components/ui/misc';
import { Search, UserPlus, Download, ICON_SM } from '@/components/ui/icons';

const STATUS_OPTIONS: MemberDisplayStatus[] = ['active', 'expiring', 'expired', 'frozen', 'pending', 'none'];

export function MembersList() {
  const { t, locale } = useI18n();
  const { profile } = useAuth();
  const { branches } = useReferenceData();
  const navigate = useNavigate();

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<MemberDisplayStatus | ''>('');
  const [branchFilter, setBranchFilter] = useState('');
  const isAdmin = profile?.role === 'super_admin';

  // Search, filters and paging all run on the server (members_overview view);
  // the browser never downloads more than one page of members.
  const query = useDebounced(search.trim(), 300);
  const page = usePaged(
    (offset, limit) =>
      fetchMembersPage({ search: query, status: statusFilter || undefined, branchId: branchFilter, offset, limit }),
    [query, statusFilter, branchFilter],
    DEFAULT_PAGE_SIZE,
  );

  const branchName = (id: string | null) => {
    const b = branches.find((x) => x.id === id);
    return b ? localizedName(b, locale) : '—';
  };

  return (
    <div>
      <PageHeader
        eyebrow={page.loading ? undefined : `${page.total} ${t('members.count')}`}
        title={t('members.title')}
        action={
          <div className="flex items-center gap-2">
            <Button variant="secondary" onClick={() => navigate('/dashboard/members/import')}>
              <Download {...ICON_SM} className="rotate-180" />{t('import.title')}
            </Button>
            <Button onClick={() => navigate('/dashboard/members/new')}><UserPlus {...ICON_SM} />{t('members.register')}</Button>
          </div>
        }
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
        <SelectInput value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as MemberDisplayStatus | '')} className="w-auto">
          <option value="">{t('members.filter.status')}</option>
          {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{t(`status.${s}`)}</option>)}
        </SelectInput>
        {isAdmin && (
          <SelectInput value={branchFilter} onChange={(e) => setBranchFilter(e.target.value)} className="w-auto">
            <option value="">{t('members.filter.branch')}</option>
            {branches.map((b) => <option key={b.id} value={b.id}>{localizedName(b, locale)}</option>)}
          </SelectInput>
        )}
      </div>

      {page.error && (
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <ErrorText error={page.error} />
          <Button variant="secondary" onClick={page.reload}>{t('common.retry')}</Button>
        </div>
      )}

      {page.loading ? (
        <InlineLoading />
      ) : page.rows.length === 0 ? (
        <EmptyState messageKey="members.empty" />
      ) : (
        <>
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
                {page.rows.map((m) => (
                  <tr
                    key={m.id}
                    onClick={() => navigate(`/dashboard/members/${m.id}`)}
                    className="cursor-pointer border-b border-border transition-colors hover:bg-surface"
                  >
                    <Td className="font-mono text-xs text-faint">{m.member_code}</Td>
                    <Td className="font-medium text-text">{m.full_name}</Td>
                    <Td dir="ltr" className="text-start text-muted">{m.phone}</Td>
                    <Td className="text-muted">{branchName(m.branch_id)}</Td>
                    <Td className="text-muted">{formatDate(m.start_date, locale)}</Td>
                    <Td className="text-muted">{formatDate(m.end_date, locale)}</Td>
                    <Td>{m.sub_status === 'active' || m.sub_status === 'frozen' ? <DaysLeft end={m.end_date} /> : <span className="text-faint">—</span>}</Td>
                    <Td><StatusBadge status={m.display_status} /></Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-6 flex items-center justify-between gap-4">
            <p className="text-xs text-faint">
              {t('common.showing')} {page.rows.length} {t('common.of')} {page.total}
            </p>
            {page.hasMore && (
              <Button variant="secondary" loading={page.loadingMore} onClick={page.loadMore}>
                {t('common.load_more')}
              </Button>
            )}
          </div>
        </>
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

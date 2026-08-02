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
import { TableWrap, Th, Td, CardList, DataCard, CardHead, CardMeta, CardRow } from '@/components/dashboard/DataTable';
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
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" onClick={() => navigate('/dashboard/members/import')} className="flex-1 sm:flex-none">
              <Download {...ICON_SM} className="rotate-180" />{t('import.title')}
            </Button>
            <Button onClick={() => navigate('/dashboard/members/new')} className="flex-1 sm:flex-none">
              <UserPlus {...ICON_SM} />{t('members.register')}
            </Button>
          </div>
        }
      />

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <div className="relative w-full sm:flex-1 sm:basis-64">
          <Search {...ICON_SM} className="pointer-events-none absolute inset-y-0 my-auto text-faint start-3" />
          <input
            placeholder={t('members.search')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label={t('members.search')}
            className="focus-ring min-h-[44px] w-full rounded border border-border bg-surface py-2 text-base text-text outline-none transition-colors focus:border-accent placeholder:text-faint ps-9 pe-3 md:text-sm"
          />
        </div>
        <SelectInput
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as MemberDisplayStatus | '')}
          className="flex-1 sm:w-auto sm:flex-none"
          aria-label={t('members.filter.status')}
        >
          <option value="">{t('members.filter.status')}</option>
          {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{t(`status.${s}`)}</option>)}
        </SelectInput>
        {isAdmin && (
          <SelectInput
            value={branchFilter}
            onChange={(e) => setBranchFilter(e.target.value)}
            className="flex-1 sm:w-auto sm:flex-none"
            aria-label={t('members.filter.branch')}
          >
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
          <TableWrap minWidth="min-w-[52rem]">
            <thead>
              <tr className="border-b border-border">
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
          </TableWrap>

          {/* Phone: the same eight columns as one tappable card per member. */}
          <CardList>
            {page.rows.map((m) => (
              <DataCard key={m.id} onClick={() => navigate(`/dashboard/members/${m.id}`)}>
                <CardHead title={m.full_name} aside={<StatusBadge status={m.display_status} />} />
                <p dir="ltr" className="mt-1 text-start text-xs text-faint">
                  {m.member_code} · {m.phone}
                </p>
                <CardMeta>
                  <CardRow label={t('members.col.branch')}>{branchName(m.branch_id)}</CardRow>
                  <CardRow label={t('members.col.end')}>{formatDate(m.end_date, locale)}</CardRow>
                  <CardRow label={t('members.col.remaining')}>
                    {m.sub_status === 'active' || m.sub_status === 'frozen'
                      ? <DaysLeft end={m.end_date} />
                      : <span className="text-faint">—</span>}
                  </CardRow>
                </CardMeta>
              </DataCard>
            ))}
          </CardList>

          <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-faint">
              {t('common.showing')} {page.rows.length} {t('common.of')} {page.total}
            </p>
            {page.hasMore && (
              <Button variant="secondary" loading={page.loadingMore} onClick={page.loadMore} className="w-full sm:w-auto">
                {t('common.load_more')}
              </Button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

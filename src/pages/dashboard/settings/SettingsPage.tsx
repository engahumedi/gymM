import { useState } from 'react';
import { useI18n } from '@/i18n/I18nProvider';
import type { MessageKey } from '@/i18n/dictionary';
import { PageHeader } from '@/components/ui/misc';
import { IdentitySettings } from './IdentitySettings';
import { BranchesSettings } from './BranchesSettings';
import { StaffSettings } from './StaffSettings';
import { ContentSettings } from './ContentSettings';
import { AuditSettings } from './AuditSettings';

type Tab = 'identity' | 'branches' | 'staff' | 'content' | 'audit';

const TABS: { id: Tab; key: MessageKey }[] = [
  { id: 'identity', key: 'settings.tab.identity' },
  { id: 'branches', key: 'settings.tab.branches' },
  { id: 'staff', key: 'settings.tab.staff' },
  { id: 'content', key: 'settings.tab.content' },
  { id: 'audit', key: 'settings.tab.audit' },
];

export function SettingsPage() {
  const { t } = useI18n();
  const [tab, setTab] = useState<Tab>('identity');

  return (
    <div>
      <PageHeader eyebrow={t('settings.eyebrow')} title={t('dashboard.settings')} />

      <div className="mb-8 flex gap-1 overflow-x-auto border-b border-border">
        {TABS.map(({ id, key }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`-mb-px whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
              tab === id
                ? 'border-accent text-text'
                : 'border-transparent text-muted hover:text-text'
            }`}
          >
            {t(key)}
          </button>
        ))}
      </div>

      {tab === 'identity' && <IdentitySettings />}
      {tab === 'branches' && <BranchesSettings />}
      {tab === 'staff' && <StaffSettings />}
      {tab === 'content' && <ContentSettings />}
      {tab === 'audit' && <AuditSettings />}
    </div>
  );
}

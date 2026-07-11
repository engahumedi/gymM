import { useState } from 'react';
import { useI18n } from '@/i18n/I18nProvider';
import { useAuth } from '@/auth/AuthProvider';
import { useReferenceData } from '@/lib/ReferenceData';
import {
  fetchMember,
  fetchMyNotifications,
  fetchSubscriptions,
  markNotificationRead,
  requestRenewal,
} from '@/lib/api';
import { useAsync } from '@/lib/useAsync';
import { localizedName } from '@/lib/display';
import { formatDate, formatDateTime } from '@/lib/format';
import { pickCurrent, subscriptionDisplayStatus } from '@/lib/subscriptionStatus';
import { errorMessageKey } from '@/lib/errors';
import { StatusBadge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { SelectInput, Field } from '@/components/ui/Field';
import { Card, EmptyState, InlineLoading, ErrorText } from '@/components/ui/misc';

export function PortalHome() {
  const { t, locale } = useI18n();
  const { profile } = useAuth();
  const { plans } = useReferenceData();
  const memberId = profile?.member_id ?? '';

  const member = useAsync(() => (memberId ? fetchMember(memberId) : Promise.resolve(null)), [memberId]);
  const subs = useAsync(() => (memberId ? fetchSubscriptions(memberId) : Promise.resolve([])), [memberId]);
  const notifs = useAsync(fetchMyNotifications, []);

  const [asking, setAsking] = useState(false);

  const current = pickCurrent(subs.data ?? []);
  const status = subscriptionDisplayStatus(current);
  const hasPending = (subs.data ?? []).some((s) => s.status === 'pending');
  const planName = (id: string) => localizedName(plans.find((p) => p.id === id), locale);

  if (member.loading || subs.loading) return <InlineLoading />;

  return (
    <div className="space-y-5">
      {/* Subscription status */}
      <Card>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-muted">{t('portal.status')}</h2>
          <StatusBadge status={status} />
        </div>
        {current && current.status !== 'pending' ? (
          <div className="grid grid-cols-2 gap-y-2 text-sm">
            <span className="text-muted">{t('portal.plan')}</span>
            <span className="font-medium">{planName(current.plan_id)}</span>
            <span className="text-muted">{t('portal.expiry')}</span>
            <span className="font-medium">{formatDate(current.end_date, locale)}</span>
          </div>
        ) : (
          <p className="text-sm text-muted">{t('portal.no_active_sub')}</p>
        )}

        {hasPending && (
          <p className="mt-3 border-s-2 border-sand bg-surface-2 px-3 py-2 text-sm text-text">
            {t('portal.pending_note')}
          </p>
        )}

        <div className="mt-4">
          <Button onClick={() => setAsking(true)} disabled={hasPending}>
            {t('portal.request_renewal')}
          </Button>
        </div>
      </Card>

      {/* Notifications */}
      <div>
        <h2 className="mb-2 text-sm font-semibold text-muted">{t('notif.title')}</h2>
        {notifs.loading ? (
          <InlineLoading />
        ) : (notifs.data ?? []).length === 0 ? (
          <EmptyState messageKey="notif.empty" />
        ) : (
          <div className="divide-y divide-border rounded border border-border bg-surface">
            {(notifs.data ?? []).map((n) => (
              <div key={n.id} className="flex items-start justify-between gap-3 px-4 py-3">
                <div className={n.status === 'read' ? 'text-faint' : 'text-text'}>
                  <p className="text-sm">{locale === 'ar' ? n.message_ar : n.message_en}</p>
                  <p className="mt-0.5 text-xs text-faint">{formatDateTime(n.created_at, locale)}</p>
                </div>
                {n.status !== 'read' && (
                  <button
                    className="shrink-0 text-xs font-semibold text-accent hover:underline"
                    onClick={async () => {
                      await markNotificationRead(n.id);
                      notifs.reload();
                    }}
                  >
                    {t('notif.mark_read')}
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {asking && member.data && (
        <RenewalRequest
          memberId={member.data.id}
          branchId={member.data.branch_id ?? ''}
          onClose={() => setAsking(false)}
          onDone={() => {
            setAsking(false);
            subs.reload();
          }}
        />
      )}
    </div>
  );
}

function RenewalRequest({
  memberId,
  branchId,
  onClose,
  onDone,
}: {
  memberId: string;
  branchId: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const { t, locale } = useI18n();
  const { plans } = useReferenceData();
  const active = plans.filter((p) => p.is_active);
  const [planId, setPlanId] = useState(active[0]?.id ?? '');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await requestRenewal(memberId, planId, branchId);
      setDone(true);
    } catch (err) {
      setError(t(errorMessageKey(err instanceof Error ? err.message : '')));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={t('portal.request.title')}>
      {done ? (
        <div className="space-y-4">
          <p className="border-s-2 border-good bg-surface-2 px-3 py-2 text-sm text-text">{t('portal.request_sent')}</p>
          <Button onClick={onDone}>{t('common.save')}</Button>
        </div>
      ) : (
        <div className="space-y-4">
          <Field label={t('portal.pick_plan')} required>
            <SelectInput value={planId} onChange={(e) => setPlanId(e.target.value)}>
              {active.map((p) => (
                <option key={p.id} value={p.id}>{localizedName(p, locale)}</option>
              ))}
            </SelectInput>
          </Field>
          <ErrorText error={error} />
          <div className="flex gap-2">
            <Button onClick={submit} loading={busy}>{t('portal.request_renewal')}</Button>
            <Button variant="secondary" onClick={onClose}>{t('common.cancel')}</Button>
          </div>
        </div>
      )}
    </Modal>
  );
}

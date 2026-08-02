import { useState } from 'react';
import { Link } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { useI18n } from '@/i18n/I18nProvider';
import { useAuth } from '@/auth/AuthProvider';
import { useReferenceData } from '@/lib/ReferenceData';
import {
  fetchMember,
  fetchMyNotifications,
  fetchSubscriptions,
  fetchMyFreezeRequests,
  markNotificationRead,
  requestRenewal,
  requestFreeze,
} from '@/lib/api';
import { useAsync } from '@/lib/useAsync';
import { localizedName } from '@/lib/display';
import { formatDate, formatDateTime } from '@/lib/format';
import { pickCurrent, subscriptionDisplayStatus } from '@/lib/subscriptionStatus';
import { errorMessageKey } from '@/lib/errors';
import { StatusBadge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { SelectInput, Field, TextInput, TextArea } from '@/components/ui/Field';
import { Card, EmptyState, InlineLoading, ErrorText, DaysLeft } from '@/components/ui/misc';
import { daysUntil } from '@/lib/format';

export function PortalHome() {
  const { t, locale } = useI18n();
  const { profile } = useAuth();
  const { plans } = useReferenceData();
  const memberId = profile?.member_id ?? '';

  const member = useAsync(() => (memberId ? fetchMember(memberId) : Promise.resolve(null)), [memberId]);
  const subs = useAsync(() => (memberId ? fetchSubscriptions(memberId) : Promise.resolve([])), [memberId]);
  const notifs = useAsync(fetchMyNotifications, []);
  const freezeReqs = useAsync(fetchMyFreezeRequests, []);

  const [asking, setAsking] = useState(false);
  const [freezing, setFreezing] = useState(false);

  const current = pickCurrent(subs.data ?? []);
  const status = subscriptionDisplayStatus(current);
  const hasPending = (subs.data ?? []).some((s) => s.status === 'pending');
  const pendingFreeze = (freezeReqs.data ?? []).find((r) => r.status === 'pending');
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
          <div className="flex flex-wrap items-end gap-x-8 gap-y-4 sm:gap-x-10">
            <div>
              <p className="text-xs text-muted">{t('portal.plan')}</p>
              <p className="mt-1 font-medium text-text">{planName(current.plan_id)}</p>
            </div>
            <div>
              <p className="text-xs text-muted">{t('portal.expiry')}</p>
              <p className="mt-1 font-medium text-text">{formatDate(current.end_date, locale)}</p>
            </div>
            <div>
              <p className="text-xs text-muted">{t('portal.remaining')}</p>
              <p className="font-display mt-1 text-2xl leading-none">
                {(() => { const d = daysUntil(current.end_date); return d !== null && d >= 0 ? d : 0; })()}
                <span className="ms-1.5 align-baseline text-xs text-muted">{t('common.days')}</span>
              </p>
            </div>
            <div className="pb-1"><DaysLeft end={current.end_date} /></div>
          </div>
        ) : (
          <p className="text-sm text-muted">{t('portal.no_active_sub')}</p>
        )}

        {/* Only ONE pending subscription is allowed per member (enforced by RLS),
            so the request action is hidden while one is awaiting activation. */}
        {hasPending && (
          <p className="mt-3 border-s-2 border-sand bg-surface-2 px-3 py-2 text-sm text-text">
            {t('portal.renewal_pending')}
          </p>
        )}
        {pendingFreeze && (
          <p className="mt-3 border-s-2 border-sand bg-surface-2 px-3 py-2 text-sm text-text">
            {t('freezereq.pending_note').replace('{n}', String(pendingFreeze.days))}
          </p>
        )}

        {(!hasPending || current?.status === 'active') && (
          <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3">
            {!hasPending && (
              <Button onClick={() => setAsking(true)}>
                {t('portal.request_renewal')}
              </Button>
            )}
            {current?.status === 'active' && (
              <Button variant="secondary" onClick={() => setFreezing(true)} disabled={Boolean(pendingFreeze)}>
                {t('freezereq.request')}
              </Button>
            )}
          </div>
        )}
      </Card>

      {/* Membership QR — reception scans this to check the member in */}
      {member.data?.member_code && (
        <Card>
          {/* On a phone the 104px code plus a paragraph does not fit on one
              line, so it stacks; from sm upwards it is the original row. */}
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-5">
            <div className="w-fit shrink-0 rounded bg-white p-2.5">
              <QRCodeSVG value={member.data.member_code} size={104} bgColor="#ffffff" fgColor="#0d0f12" level="M" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm font-semibold text-muted">{t('portal.qr.title')}</h2>
              <p className="mt-1 text-sm text-text">{t('portal.qr.hint')}</p>
              <p dir="ltr" className="font-display mt-2 text-start text-lg tracking-wider text-text">{member.data.member_code}</p>
              <Link
                to={`/card/${member.data.id}`}
                className="focus-ring mt-1 inline-flex min-h-[44px] items-center rounded text-sm font-semibold text-accent hover:underline"
              >
                {t('portal.qr.card')}
              </Link>
            </div>
          </div>
        </Card>
      )}

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
              <div key={n.id} className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
                <div className={`min-w-0 ${n.status === 'read' ? 'text-faint' : 'text-text'}`}>
                  <p className="text-sm">{locale === 'ar' ? n.message_ar : n.message_en}</p>
                  <p className="mt-0.5 text-xs text-faint">{formatDateTime(n.created_at, locale)}</p>
                </div>
                {n.status !== 'read' && (
                  <button
                    className="focus-ring inline-flex min-h-[44px] shrink-0 items-center self-start rounded text-xs font-semibold text-accent hover:underline"
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

      {freezing && current && (
        <FreezeRequest
          subscriptionId={current.id}
          allowanceLeft={(plans.find((p) => p.id === current.plan_id)?.freeze_allowance_days ?? 0) - current.frozen_days_used}
          onClose={() => setFreezing(false)}
          onDone={() => { setFreezing(false); freezeReqs.reload(); }}
        />
      )}
    </div>
  );
}

function FreezeRequest({
  subscriptionId,
  allowanceLeft,
  onClose,
  onDone,
}: {
  subscriptionId: string;
  allowanceLeft: number;
  onClose: () => void;
  onDone: () => void;
}) {
  const { t } = useI18n();
  const [days, setDays] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  async function submit() {
    setBusy(true); setError(null);
    try { await requestFreeze(subscriptionId, Number(days), note || null); setDone(true); }
    catch (err) { setError(t(errorMessageKey(err instanceof Error ? err.message : ''))); }
    finally { setBusy(false); }
  }

  return (
    <Modal open onClose={onClose} title={t('freezereq.title')}>
      {done ? (
        <div className="space-y-4">
          <p className="border-s-2 border-good bg-surface-2 px-3 py-2 text-sm text-text">{t('freezereq.sent')}</p>
          <Button onClick={onDone}>{t('common.save')}</Button>
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-muted">{t('freezereq.hint')}</p>
          <Field label={t('freezereq.days')} required>
            <TextInput type="number" min={1} max={Math.max(1, allowanceLeft)} value={days} onChange={(e) => setDays(e.target.value)} />
            <span className="mt-1 block text-xs text-faint">{t('plans.col.freeze')}: {Math.max(0, allowanceLeft)} {t('freezereq.days_short')}</span>
          </Field>
          <Field label={t('freezereq.note')}>
            <TextArea rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
          <ErrorText error={error} />
          <div className="flex gap-2">
            <Button onClick={submit} loading={busy} disabled={days === '' || Number(days) < 1}>{t('freezereq.submit')}</Button>
            <Button variant="secondary" onClick={onClose}>{t('common.cancel')}</Button>
          </div>
        </div>
      )}
    </Modal>
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

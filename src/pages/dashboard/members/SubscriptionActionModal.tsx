import { useEffect, useMemo, useState } from 'react';
import { useI18n } from '@/i18n/I18nProvider';
import { useReferenceData } from '@/lib/ReferenceData';
import {
  activateSubscription,
  createSubscription,
  freezeSubscription,
  renewSubscription,
  upgradeQuote,
  upgradeSubscription,
} from '@/lib/api';
import { errorMessageKey } from '@/lib/errors';
import { localizedName, methodLabelKey, PAYMENT_METHODS } from '@/lib/display';
import { formatCurrency } from '@/lib/format';
import type { Member, PaymentMethod, Plan, Subscription } from '@/lib/database.types';
import type { MessageKey } from '@/i18n/dictionary';
import { Modal } from '@/components/ui/Modal';
import { Field, SelectInput, TextInput } from '@/components/ui/Field';
import { Button } from '@/components/ui/Button';
import { ErrorText } from '@/components/ui/misc';

export type SubAction = 'new' | 'activate' | 'renew' | 'freeze' | 'upgrade';

const TITLE: Record<SubAction, MessageKey> = {
  new: 'sub.new.title',
  activate: 'sub.activate.title',
  renew: 'sub.renew.title',
  freeze: 'sub.freeze.title',
  upgrade: 'sub.upgrade.title',
};

interface Props {
  action: SubAction;
  member: Member;
  subscription: Subscription | null; // required for all but 'new'
  onClose: () => void;
  onDone: () => void;
}

export function SubscriptionActionModal({ action, member, subscription, onClose, onDone }: Props) {
  const { t, locale } = useI18n();
  const { plans } = useReferenceData();
  const activePlans = useMemo(() => plans.filter((p) => p.is_active), [plans]);

  const currentPlan = plans.find((p) => p.id === subscription?.plan_id) ?? null;
  const [planId, setPlanId] = useState(activePlans[0]?.id ?? '');
  const [activateNow, setActivateNow] = useState(true);
  const [days, setDays] = useState('');
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<PaymentMethod>('cash');
  const [receipt, setReceipt] = useState('');
  const [quote, setQuote] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const selectedPlan: Plan | undefined = plans.find((p) => p.id === planId);

  // Default the amount to the relevant plan price.
  useEffect(() => {
    if (action === 'new') setAmount(String(selectedPlan?.price ?? ''));
    if (action === 'activate' || action === 'renew') setAmount(String(currentPlan?.price ?? ''));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planId, action]);

  // Live prorated quote for upgrades.
  useEffect(() => {
    if (action !== 'upgrade' || !subscription || !planId) return;
    let active = true;
    upgradeQuote(subscription.id, planId)
      .then((q) => {
        if (!active) return;
        setQuote(q);
        setAmount(String(q));
      })
      .catch(() => active && setQuote(null));
    return () => {
      active = false;
    };
  }, [action, planId, subscription]);

  const needsPayment =
    action === 'renew' || action === 'activate' || action === 'upgrade' || (action === 'new' && activateNow);

  async function submit() {
    setError(null);
    setBusy(true);
    try {
      const pay = { amount: amount === '' ? null : Number(amount), method, receipt: receipt || null };
      if (action === 'new') {
        await createSubscription(member.id, planId, member.branch_id!, activateNow, pay);
      } else if (action === 'activate' && subscription) {
        await activateSubscription(subscription.id, pay);
      } else if (action === 'renew' && subscription) {
        await renewSubscription(subscription.id, pay);
      } else if (action === 'freeze' && subscription) {
        await freezeSubscription(subscription.id, Number(days));
      } else if (action === 'upgrade' && subscription) {
        await upgradeSubscription(subscription.id, planId, pay);
      }
      onDone();
      onClose();
    } catch (err) {
      setError(t(errorMessageKey(err instanceof Error ? err.message : '')));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={t(TITLE[action])}>
      <div className="space-y-4">
        {(action === 'new' || action === 'upgrade') && (
          <Field label={t(action === 'upgrade' ? 'sub.field.new_plan' : 'sub.field.plan')} required>
            <SelectInput value={planId} onChange={(e) => setPlanId(e.target.value)}>
              {activePlans.map((p) => (
                <option key={p.id} value={p.id}>
                  {localizedName(p, locale)} · {formatCurrency(p.price, locale)}
                </option>
              ))}
            </SelectInput>
          </Field>
        )}

        {action === 'new' && (
          <label className="flex items-center gap-2 text-sm text-text">
            <input type="checkbox" checked={activateNow} onChange={(e) => setActivateNow(e.target.checked)} />
            {t('sub.field.activate_now')}
          </label>
        )}

        {action === 'freeze' && (
          <Field label={t('sub.field.days')} required>
            <TextInput
              type="number"
              min={1}
              value={days}
              onChange={(e) => setDays(e.target.value)}
            />
            {currentPlan && (
              <span className="mt-1 block text-xs text-faint">
                {t('plans.col.freeze')}: {currentPlan.freeze_allowance_days} ·{' '}
                {t('profile.frozen_days')}: {subscription?.frozen_days_used ?? 0}
              </span>
            )}
          </Field>
        )}

        {action === 'upgrade' && quote !== null && (
          <div className="border-s-2 border-sand bg-surface-2 px-3 py-2 text-sm text-text">
            {t('sub.quote.due')}: <strong>{formatCurrency(quote, locale)}</strong>
          </div>
        )}

        {needsPayment && (
          <>
            <Field label={t('sub.field.amount')}>
              <TextInput type="number" step="0.01" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label={t('sub.field.method')}>
                <SelectInput value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>
                  {PAYMENT_METHODS.map((m) => (
                    <option key={m} value={m}>{t(methodLabelKey(m))}</option>
                  ))}
                </SelectInput>
              </Field>
              <Field label={t('sub.field.receipt')}>
                <TextInput value={receipt} onChange={(e) => setReceipt(e.target.value)} />
              </Field>
            </div>
          </>
        )}

        <ErrorText error={error} />
        <div className="flex gap-2">
          <Button onClick={submit} loading={busy}>{t('common.save')}</Button>
          <Button variant="secondary" onClick={onClose}>{t('common.cancel')}</Button>
        </div>
      </div>
    </Modal>
  );
}

import { useState } from 'react';
import { useI18n } from '@/i18n/I18nProvider';
import {
  fetchSubscriptions,
  recordPayment,
  searchMembersQuick,
  type MemberOverview,
} from '@/lib/api';
import { useAsync, useDebounced } from '@/lib/useAsync';
import { errorMessageKey } from '@/lib/errors';
import { localizedName, methodLabelKey, PAYMENT_METHODS } from '@/lib/display';
import { formatDate } from '@/lib/format';
import { useReferenceData } from '@/lib/ReferenceData';
import type { PaymentMethod } from '@/lib/database.types';
import { Modal } from '@/components/ui/Modal';
import { Field, SelectInput, TextInput } from '@/components/ui/Field';
import { Button } from '@/components/ui/Button';
import { ErrorText } from '@/components/ui/misc';

export function RecordPaymentModal({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved: (paymentId: string) => void;
}) {
  const { t, locale } = useI18n();
  const { plans } = useReferenceData();

  const [query, setQuery] = useState('');
  const [member, setMember] = useState<MemberOverview | null>(null);
  const [subId, setSubId] = useState<string>('');
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<PaymentMethod>('cash');
  const [receipt, setReceipt] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Server-side, debounced member lookup — the picker never loads the roster.
  const debouncedQuery = useDebounced(member ? '' : query.trim(), 300);
  const search = useAsync(() => searchMembersQuick(debouncedQuery, 6), [debouncedQuery]);
  const matches = debouncedQuery ? search.data ?? [] : [];

  const memberSubs = useAsync(async () => (member ? fetchSubscriptions(member.id) : []), [member?.id]);
  const planName = (planId: string) => localizedName(plans.find((p) => p.id === planId), locale);

  async function submit() {
    if (!member) return;
    setError(null);
    setBusy(true);
    try {
      const pay = await recordPayment(
        member.id,
        subId || null,
        Number(amount),
        method,
        receipt || null,
      );
      onSaved(pay.id);
    } catch (err) {
      setError(t(errorMessageKey(err instanceof Error ? err.message : '')));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={t('payments.record.title')}>
      <div className="space-y-4">
        {!member ? (
          <Field label={t('payments.field.member_search')} required>
            <TextInput value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('checkin.search')} />
            {matches.length > 0 && (
              <div className="mt-1 max-h-64 overflow-y-auto border border-border divide-y divide-border">
                {matches.map((m) => (
                  <button
                    key={m.id}
                    className="focus-ring flex min-h-[48px] w-full flex-col justify-center px-3 py-2 text-start text-sm hover:bg-surface"
                    onClick={() => { setMember(m); setQuery(m.full_name); }}
                  >
                    <span className="font-medium">{m.full_name}</span>
                    <span dir="ltr" className="text-start text-xs text-faint">{m.member_code} · {m.phone}</span>
                  </button>
                ))}
              </div>
            )}
          </Field>
        ) : (
          <div className="flex min-h-[48px] items-center justify-between gap-3 bg-surface-2 px-3 py-2 text-sm">
            <span className="min-w-0 truncate font-medium">{member.full_name}</span>
            <button
              className="focus-ring inline-flex min-h-[44px] shrink-0 items-center rounded px-2 text-accent hover:underline"
              onClick={() => { setMember(null); setSubId(''); }}
            >
              {t('common.cancel')}
            </button>
          </div>
        )}

        {member && (
          <>
            <Field label={t('payments.field.subscription')}>
              <SelectInput value={subId} onChange={(e) => setSubId(e.target.value)}>
                <option value="">{t('payments.field.none_sub')}</option>
                {(memberSubs.data ?? []).map((s) => (
                  <option key={s.id} value={s.id}>
                    {planName(s.plan_id)} · {formatDate(s.end_date, locale)}
                  </option>
                ))}
              </SelectInput>
            </Field>

            <Field label={t('sub.field.amount')} required>
              <TextInput type="number" step="0.01" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} />
            </Field>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
          <Button onClick={submit} loading={busy} disabled={!member || amount === ''}>{t('common.save')}</Button>
          <Button variant="secondary" onClick={onClose}>{t('common.cancel')}</Button>
        </div>
      </div>
    </Modal>
  );
}

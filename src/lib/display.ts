import type { Locale, MessageKey } from '@/i18n/dictionary';
import type { PaymentMethod } from './database.types';

// Pick the Arabic or English name from a {name_ar, name_en} record.
export function localizedName(
  obj: { name_ar: string; name_en: string } | null | undefined,
  locale: Locale,
): string {
  if (!obj) return '—';
  return locale === 'ar' ? obj.name_ar : obj.name_en;
}

export const PAYMENT_METHODS: PaymentMethod[] = ['cash', 'mada', 'online', 'other'];

export function methodLabelKey(method: PaymentMethod): MessageKey {
  return `sub.method.${method}` as MessageKey;
}

import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(amount: number): string {
  return `${amount.toLocaleString('ar-SA')} ريال`;
}

export function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '-';
  try {
    return new Date(dateStr).toLocaleDateString('ar-SA', {
      year: 'numeric', month: 'short', day: 'numeric',
    });
  } catch {
    return dateStr;
  }
}

export function formatDateTime(dateStr: string | null | undefined): string {
  if (!dateStr) return '-';
  try {
    return new Date(dateStr).toLocaleString('ar-SA', {
      year: 'numeric', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return dateStr;
  }
}

export function daysUntil(dateStr: string): number {
  const target = new Date(dateStr);
  const now = new Date();
  return Math.ceil((target.getTime() - now.getTime()) / 86400000);
}

export function calculateAge(dob: string): number {
  const birth = new Date(dob);
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const m = now.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) age--;
  return age;
}

export function getSubscriptionStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    active: 'نشط',
    expired: 'منتهي',
    frozen: 'مجمد',
    cancelled: 'ملغى',
  };
  return labels[status] || status;
}

export function getSubscriptionStatusColor(status: string): string {
  const colors: Record<string, string> = {
    active: 'text-green-400 bg-green-400/10',
    expired: 'text-red-400 bg-red-400/10',
    frozen: 'text-blue-400 bg-blue-400/10',
    cancelled: 'text-gray-400 bg-gray-400/10',
  };
  return colors[status] || 'text-gray-400 bg-gray-400/10';
}

export function getGenderLabel(gender: string): string {
  return gender === 'male' ? 'ذكر' : gender === 'female' ? 'أنثى' : '-';
}

export function getPaymentMethodLabel(method: string): string {
  const labels: Record<string, string> = {
    cash: 'نقداً',
    transfer: 'تحويل بنكي',
    card: 'بطاقة',
    online: 'إلكتروني',
  };
  return labels[method] || method;
}

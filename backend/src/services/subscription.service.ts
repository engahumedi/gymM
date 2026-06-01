import { db } from '../db/index';

interface SubscriptionRow {
  id: number;
  member_id: number;
  plan_id: number;
  branch_id: number;
  start_date: string;
  end_date: string;
  status: string;
  price_paid: number;
  freeze_count: number;
}

export function autoExpireSubscriptions(): void {
  db.prepare(`
    UPDATE subscriptions
    SET status = 'expired', updated_at = datetime('now')
    WHERE status = 'active' AND date(end_date) < date('now')
  `).run();
}

export function freezeSubscription(
  subscriptionId: number,
  days: number,
  reason: string,
  userId: number
): void {
  const sub = db.prepare('SELECT * FROM subscriptions WHERE id = ?').get(subscriptionId) as SubscriptionRow | undefined;
  if (!sub) throw new Error('الاشتراك غير موجود');
  if (sub.status !== 'active') throw new Error('لا يمكن تجميد اشتراك غير نشط');
  if (sub.freeze_count >= 2) throw new Error('تم استنفاد الحد الأقصى للتجميد (مرتان)');

  const today = new Date().toISOString().split('T')[0];
  const freezeEnd = new Date(today);
  freezeEnd.setDate(freezeEnd.getDate() + days - 1);
  const freezeEndStr = freezeEnd.toISOString().split('T')[0];

  const newEndDate = new Date(sub.end_date);
  newEndDate.setDate(newEndDate.getDate() + days);
  const newEndDateStr = newEndDate.toISOString().split('T')[0];

  const updateSub = db.transaction(() => {
    db.prepare(`
      INSERT INTO subscription_freezes (subscription_id, freeze_start, freeze_end, days_frozen, reason, created_by)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(subscriptionId, today, freezeEndStr, days, reason, userId);

    db.prepare(`
      UPDATE subscriptions
      SET status = 'frozen', end_date = ?, freeze_count = freeze_count + 1, updated_at = datetime('now')
      WHERE id = ?
    `).run(newEndDateStr, subscriptionId);
  });

  updateSub();
}

export function unfreezeSubscription(subscriptionId: number): void {
  const sub = db.prepare('SELECT * FROM subscriptions WHERE id = ?').get(subscriptionId) as SubscriptionRow | undefined;
  if (!sub) throw new Error('الاشتراك غير موجود');
  if (sub.status !== 'frozen') throw new Error('الاشتراك غير مجمد');

  db.prepare(`
    UPDATE subscriptions SET status = 'active', updated_at = datetime('now') WHERE id = ?
  `).run(subscriptionId);
}

export function renewSubscription(
  subscriptionId: number,
  userId: number,
  branchId: number
): number {
  const sub = db.prepare(`
    SELECT s.*, sp.duration_days, sp.price FROM subscriptions s
    JOIN subscription_plans sp ON s.plan_id = sp.id
    WHERE s.id = ?
  `).get(subscriptionId) as (SubscriptionRow & { duration_days: number; price: number }) | undefined;

  if (!sub) throw new Error('الاشتراك غير موجود');

  const today = new Date().toISOString().split('T')[0];
  const startDate = sub.end_date >= today ? addDays(sub.end_date, 1) : today;
  const endDate = addDays(startDate, sub.duration_days - 1);

  const result = db.prepare(`
    INSERT INTO subscriptions (member_id, plan_id, branch_id, start_date, end_date, price_paid, payment_method, processed_by, status)
    VALUES (?, ?, ?, ?, ?, ?, 'cash', ?, 'active')
  `).run(sub.member_id, sub.plan_id, branchId, startDate, endDate, sub.price_paid, userId);

  return result.lastInsertRowid as number;
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

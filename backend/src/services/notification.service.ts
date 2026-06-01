import { db } from '../db/index';

export function generateNotifications(): void {
  // Expiring in ≤3 days
  const expiringSoon = db.prepare(`
    SELECT s.id, s.member_id, s.end_date, m.name_ar, b.id as branch_id
    FROM subscriptions s
    JOIN members m ON s.member_id = m.id
    JOIN branches b ON s.branch_id = b.id
    WHERE s.status = 'active'
      AND date(s.end_date) BETWEEN date('now') AND date('now', '+3 days')
  `).all() as Array<{ id: number; member_id: number; end_date: string; name_ar: string; branch_id: number }>;

  const insertNotif = db.prepare(`
    INSERT INTO notifications (type, title, message, member_id, target_role, branch_id)
    SELECT ?, ?, ?, ?, 'all', ?
    WHERE NOT EXISTS (
      SELECT 1 FROM notifications
      WHERE type = ? AND member_id = ? AND date(created_at) = date('now')
    )
  `);

  for (const sub of expiringSoon) {
    const daysLeft = Math.ceil((new Date(sub.end_date).getTime() - Date.now()) / 86400000);
    insertNotif.run(
      'expiring_soon',
      `اشتراك على وشك الانتهاء`,
      `اشتراك ${sub.name_ar} ينتهي خلال ${daysLeft} يوم`,
      sub.member_id, sub.branch_id,
      'expiring_soon', sub.member_id
    );
  }

  // Expired today
  const expiredToday = db.prepare(`
    SELECT s.member_id, m.name_ar, s.branch_id
    FROM subscriptions s
    JOIN members m ON s.member_id = m.id
    WHERE s.status = 'expired' AND date(s.end_date) = date('now')
  `).all() as Array<{ member_id: number; name_ar: string; branch_id: number }>;

  for (const sub of expiredToday) {
    insertNotif.run(
      'expired_today',
      'اشتراك منتهي',
      `انتهى اشتراك ${sub.name_ar} اليوم`,
      sub.member_id, sub.branch_id,
      'expired_today', sub.member_id
    );
  }

  // Branches with zero check-ins yesterday
  const zeroBranches = db.prepare(`
    SELECT b.id, b.name
    FROM branches b
    WHERE b.is_active = 1
      AND NOT EXISTS (
        SELECT 1 FROM attendance a
        WHERE a.branch_id = b.id
          AND date(a.check_in_time) = date('now', '-1 day')
      )
  `).all() as Array<{ id: number; name: string }>;

  const insertBranchNotif = db.prepare(`
    INSERT INTO notifications (type, title, message, target_role, branch_id)
    SELECT ?, ?, ?, 'admin', ?
    WHERE NOT EXISTS (
      SELECT 1 FROM notifications
      WHERE type = 'no_checkin' AND branch_id = ? AND date(created_at) = date('now')
    )
  `);

  for (const branch of zeroBranches) {
    insertBranchNotif.run(
      'no_checkin',
      'لا حضور في الفرع',
      `لم يتم تسجيل أي حضور في ${branch.name} أمس`,
      branch.id, branch.id
    );
  }
}

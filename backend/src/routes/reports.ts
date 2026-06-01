import { Router, Request, Response } from 'express';
import { authenticateJWT } from '../middleware/auth';
import { scopeToBranch } from '../middleware/branchScope';
import { db } from '../db/index';
import { autoExpireSubscriptions } from '../services/subscription.service';
import { generateNotifications } from '../services/notification.service';

const router = Router();
router.use(authenticateJWT, scopeToBranch);

router.get('/dashboard', (req: Request, res: Response) => {
  autoExpireSubscriptions();
  generateNotifications();

  const branchId = req.effectiveBranchId;
  const bf = branchId ? 'AND branch_id = ?' : '';
  const bp = branchId ? [branchId] : [];

  // KPIs
  const activeMembers = (db.prepare(`
    SELECT COUNT(DISTINCT member_id) as count FROM subscriptions WHERE status='active' ${bf}
  `).get(...bp) as { count: number }).count;

  const newThisMonth = (db.prepare(`
    SELECT COUNT(*) as count FROM members WHERE strftime('%Y-%m',created_at)=strftime('%Y-%m','now')
    ${branchId ? 'AND home_branch_id=?' : ''}
  `).get(...(branchId ? [branchId] : [])) as { count: number }).count;

  const lastMonthMembers = (db.prepare(`
    SELECT COUNT(*) as count FROM members WHERE strftime('%Y-%m',created_at)=strftime('%Y-%m',date('now','-1 month'))
    ${branchId ? 'AND home_branch_id=?' : ''}
  `).get(...(branchId ? [branchId] : [])) as { count: number }).count;

  const expiringSoon = (db.prepare(`
    SELECT COUNT(*) as count FROM subscriptions
    WHERE status='active' AND date(end_date) BETWEEN date('now') AND date('now','+7 days') ${bf}
  `).get(...bp) as { count: number }).count;

  const revenueThisMonth = (db.prepare(`
    SELECT COALESCE(SUM(price_paid),0) as total FROM subscriptions
    WHERE strftime('%Y-%m',created_at)=strftime('%Y-%m','now') ${bf}
  `).get(...bp) as { total: number }).total;

  const revenueLastMonth = (db.prepare(`
    SELECT COALESCE(SUM(price_paid),0) as total FROM subscriptions
    WHERE strftime('%Y-%m',created_at)=strftime('%Y-%m',date('now','-1 month')) ${bf}
  `).get(...bp) as { total: number }).total;

  const checkinsToday = (db.prepare(`
    SELECT COUNT(*) as count FROM attendance WHERE date(check_in_time)=date('now') ${bf}
  `).get(...bp) as { count: number }).count;

  const checkinsThisMonth = (db.prepare(`
    SELECT COUNT(*) as count FROM attendance WHERE strftime('%Y-%m',check_in_time)=strftime('%Y-%m','now') ${bf}
  `).get(...bp) as { count: number }).count;

  const frozenCount = (db.prepare(`
    SELECT COUNT(*) as count FROM subscriptions WHERE status='frozen' ${bf}
  `).get(...bp) as { count: number }).count;

  const atRiskCount = (db.prepare(`
    SELECT COUNT(DISTINCT m.id) as count FROM members m
    WHERE m.is_active=1
      AND NOT EXISTS (
        SELECT 1 FROM attendance a WHERE a.member_id=m.id AND date(a.check_in_time) >= date('now','-14 days')
      )
      AND EXISTS (SELECT 1 FROM subscriptions s WHERE s.member_id=m.id AND s.status='active')
      ${branchId ? 'AND m.home_branch_id=?' : ''}
  `).get(...(branchId ? [branchId] : [])) as { count: number }).count;

  // Revenue chart (last 12 months)
  const revenueChart = db.prepare(`
    SELECT strftime('%Y-%m', created_at) as month,
           COALESCE(SUM(price_paid),0) as revenue,
           COUNT(*) as subscription_count
    FROM subscriptions
    WHERE created_at >= date('now','-12 months') ${bf}
    GROUP BY month ORDER BY month ASC
  `).all(...bp);

  // Status distribution
  const statusDist = db.prepare(`
    SELECT status, COUNT(*) as count FROM subscriptions ${branchId ? 'WHERE branch_id=?' : ''} GROUP BY status
  `).all(...(branchId ? [branchId] : []));

  // Daily checkins last 30 days
  const dailyCheckins = db.prepare(`
    SELECT date(check_in_time) as day, COUNT(*) as checkins
    FROM attendance WHERE check_in_time >= date('now','-30 days') ${bf}
    GROUP BY day ORDER BY day ASC
  `).all(...bp);

  // Top plans
  const topPlans = db.prepare(`
    SELECT sp.name as plan_name, COUNT(*) as subscriber_count, SUM(s.price_paid) as total_revenue
    FROM subscriptions s JOIN subscription_plans sp ON s.plan_id=sp.id
    WHERE s.status='active' ${bf}
    GROUP BY sp.id ORDER BY subscriber_count DESC LIMIT 5
  `).all(...bp);

  // Recent activity
  const recentActivity = db.prepare(`
    SELECT 'checkin' as event_type, m.name_ar as member_name, m.member_code,
           b.name as branch_name, a.check_in_time as event_time
    FROM attendance a
    JOIN members m ON a.member_id=m.id JOIN branches b ON a.branch_id=b.id
    ${branchId ? 'WHERE a.branch_id=?' : ''}
    UNION ALL
    SELECT 'subscription', m.name_ar, m.member_code, b.name, s.created_at
    FROM subscriptions s JOIN members m ON s.member_id=m.id JOIN branches b ON s.branch_id=b.id
    ${branchId ? 'WHERE s.branch_id=?' : ''}
    ORDER BY event_time DESC LIMIT 15
  `).all(...(branchId ? [branchId, branchId] : []));

  // Attendance heatmap (day of week x hour)
  const heatmap = db.prepare(`
    SELECT
      CAST(strftime('%w', check_in_time) AS INTEGER) as day_of_week,
      CAST(strftime('%H', check_in_time) AS INTEGER) as hour,
      COUNT(*) as count
    FROM attendance WHERE check_in_time >= date('now','-30 days') ${bf}
    GROUP BY day_of_week, hour
  `).all(...bp);

  // Branch comparison (admin only)
  let branchComparison = null;
  if (req.user!.role === 'admin' && !branchId) {
    branchComparison = db.prepare(`
      SELECT b.id, b.name as branch_name,
        (SELECT COUNT(DISTINCT m.id) FROM members m WHERE m.home_branch_id=b.id AND m.is_active=1) as total_members,
        (SELECT COUNT(DISTINCT s.member_id) FROM subscriptions s WHERE s.branch_id=b.id AND s.status='active') as active_members,
        (SELECT COALESCE(SUM(s.price_paid),0) FROM subscriptions s WHERE s.branch_id=b.id AND strftime('%Y-%m',s.created_at)=strftime('%Y-%m','now')) as revenue_this_month,
        (SELECT COUNT(*) FROM attendance a WHERE a.branch_id=b.id AND date(a.check_in_time)=date('now')) as checkins_today,
        (SELECT COUNT(*) FROM subscriptions s WHERE s.branch_id=b.id AND strftime('%Y-%m',s.created_at)=strftime('%Y-%m','now')) as new_subs_this_month,
        (SELECT COUNT(*) FROM users u WHERE u.branch_id=b.id AND u.is_active=1) as staff_count
      FROM branches b WHERE b.is_active=1
    `).all();
  }

  // Revenue by branch (last 6 months)
  const revenueByBranch = req.user!.role === 'admin' ? db.prepare(`
    SELECT b.name as branch_name,
           strftime('%Y-%m', s.created_at) as month,
           COALESCE(SUM(s.price_paid),0) as revenue
    FROM subscriptions s JOIN branches b ON s.branch_id=b.id
    WHERE s.created_at >= date('now','-6 months')
    GROUP BY b.id, month ORDER BY month ASC
  `).all() : [];

  // Daily revenue per branch last 30 days
  const dailyRevByBranch = req.user!.role === 'admin' ? db.prepare(`
    SELECT b.name as branch_name,
           date(s.created_at) as day,
           COALESCE(SUM(s.price_paid),0) as revenue
    FROM subscriptions s JOIN branches b ON s.branch_id=b.id
    WHERE s.created_at >= date('now','-30 days')
    GROUP BY b.id, day ORDER BY day ASC
  `).all() : [];

  // Alerts
  const alerts = [];

  const expIn3 = (db.prepare(`
    SELECT COUNT(*) as count FROM subscriptions
    WHERE status='active' AND date(end_date) BETWEEN date('now') AND date('now','+3 days') ${bf}
  `).get(...bp) as { count: number }).count;
  if (expIn3 > 0) alerts.push({ level: 'red', message: `${expIn3} اشتراك تنتهي خلال 3 أيام`, type: 'expiring' });

  if (atRiskCount > 0) alerts.push({ level: 'orange', message: `${atRiskCount} عضو لم يحضر منذ 14+ يوم`, type: 'at_risk' });

  if (frozenCount > 0) alerts.push({ level: 'blue', message: `${frozenCount} اشتراك مجمد حالياً`, type: 'frozen' });

  const revenueChange = revenueLastMonth > 0 ? ((revenueThisMonth - revenueLastMonth) / revenueLastMonth) * 100 : 0;
  if (revenueChange > 10) {
    alerts.push({ level: 'green', message: `الإيرادات هذا الشهر أعلى بنسبة ${revenueChange.toFixed(0)}% من الشهر الماضي`, type: 'revenue_up' });
  } else if (revenueChange < -10) {
    alerts.push({ level: 'red', message: `الإيرادات انخفضت ${Math.abs(revenueChange).toFixed(0)}% مقارنة بالشهر الماضي`, type: 'revenue_down' });
  }

  res.json({
    success: true,
    data: {
      kpis: {
        activeMembers, newThisMonth, lastMonthMembers, expiringSoon,
        revenueThisMonth, revenueLastMonth, checkinsToday, checkinsThisMonth,
        frozenCount, atRiskCount,
        revenueChange: revenueLastMonth > 0 ? ((revenueThisMonth - revenueLastMonth) / revenueLastMonth) * 100 : 0,
        membersChange: lastMonthMembers > 0 ? ((newThisMonth - lastMonthMembers) / lastMonthMembers) * 100 : 0,
        attendanceRate: activeMembers > 0 ? Math.round((checkinsThisMonth / (activeMembers * 30)) * 100) : 0,
      },
      revenueChart,
      statusDist,
      dailyCheckins,
      topPlans,
      recentActivity,
      heatmap,
      branchComparison,
      revenueByBranch,
      dailyRevByBranch,
      alerts,
    },
  });
});

// Daily revenue report
router.get('/revenue/daily', (req: Request, res: Response) => {
  const date = req.query.date as string || new Date().toISOString().split('T')[0];
  const branchId = req.effectiveBranchId;
  const bf = branchId ? 'AND s.branch_id=?' : '';
  const bp = branchId ? [branchId] : [];

  const transactions = db.prepare(`
    SELECT s.*, m.name_ar as member_name, m.member_code,
           sp.name as plan_name, b.name as branch_name, u.name as staff_name
    FROM subscriptions s
    JOIN members m ON s.member_id=m.id JOIN subscription_plans sp ON s.plan_id=sp.id
    JOIN branches b ON s.branch_id=b.id LEFT JOIN users u ON s.processed_by=u.id
    WHERE date(s.created_at)=? ${bf}
    ORDER BY s.created_at DESC
  `).all(date, ...bp);

  const total = transactions.reduce((sum: number, t: any) => sum + t.price_paid, 0);
  const byMethod: Record<string, number> = {};
  for (const t of transactions as any[]) {
    byMethod[t.payment_method] = (byMethod[t.payment_method] || 0) + t.price_paid;
  }

  res.json({ success: true, data: { date, transactions, total, by_method: byMethod } });
});

// Monthly summary
router.get('/revenue/monthly', (req: Request, res: Response) => {
  const month = req.query.month as string || new Date().toISOString().slice(0, 7);
  const branchId = req.effectiveBranchId;
  const bf = branchId ? 'AND branch_id=?' : '';
  const bp = branchId ? [branchId] : [];

  const summary = db.prepare(`
    SELECT
      COALESCE(SUM(price_paid),0) as total_revenue,
      COUNT(*) as total_subs,
      COUNT(CASE WHEN status='active' THEN 1 END) as active,
      COUNT(CASE WHEN status='cancelled' THEN 1 END) as cancelled
    FROM subscriptions WHERE strftime('%Y-%m',created_at)=? ${bf}
  `).get(month, ...bp);

  const byBranch = db.prepare(`
    SELECT b.name as branch_name, COALESCE(SUM(s.price_paid),0) as revenue, COUNT(*) as subs
    FROM subscriptions s JOIN branches b ON s.branch_id=b.id
    WHERE strftime('%Y-%m',s.created_at)=? ${bf}
    GROUP BY b.id
  `).all(month, ...bp);

  res.json({ success: true, data: { month, summary, by_branch: byBranch } });
});

// Revenue by plan
router.get('/revenue/by-plan', (req: Request, res: Response) => {
  const branchId = req.effectiveBranchId;
  const bf = branchId ? 'AND s.branch_id=?' : '';
  const bp = branchId ? [branchId] : [];

  const data = db.prepare(`
    SELECT sp.name as plan_name, sp.price as plan_price, sp.duration_days,
           COUNT(*) as total_subs, COALESCE(SUM(s.price_paid),0) as total_revenue,
           COUNT(CASE WHEN s.status='active' THEN 1 END) as active_subs
    FROM subscriptions s JOIN subscription_plans sp ON s.plan_id=sp.id
    WHERE 1=1 ${bf}
    GROUP BY sp.id ORDER BY total_revenue DESC
  `).all(...bp);

  res.json({ success: true, data });
});

// Expiring subscriptions
router.get('/members/expiring', (req: Request, res: Response) => {
  const days = parseInt(req.query.days as string) || 7;
  const branchId = req.effectiveBranchId;
  const bf = branchId ? 'AND s.branch_id=?' : '';
  const bp = branchId ? [branchId] : [];

  const members = db.prepare(`
    SELECT m.id, m.name_ar, m.member_code, m.phone,
           s.end_date, s.status, sp.name as plan_name, b.name as branch_name
    FROM subscriptions s
    JOIN members m ON s.member_id=m.id
    JOIN subscription_plans sp ON s.plan_id=sp.id
    JOIN branches b ON s.branch_id=b.id
    WHERE s.status='active'
      AND date(s.end_date) BETWEEN date('now') AND date('now','+'||?||' days')
      ${bf}
    ORDER BY s.end_date ASC
  `).all(days, ...bp);

  res.json({ success: true, data: members });
});

// Inactive members (churn risk)
router.get('/members/inactive', (req: Request, res: Response) => {
  const days = parseInt(req.query.days as string) || 30;
  const branchId = req.effectiveBranchId;

  const members = db.prepare(`
    SELECT m.id, m.name_ar, m.member_code, m.phone, b.name as branch_name,
           s.end_date, sp.name as plan_name,
           MAX(a.check_in_time) as last_checkin
    FROM members m
    JOIN branches b ON m.home_branch_id=b.id
    LEFT JOIN subscriptions s ON s.id=(
      SELECT id FROM subscriptions WHERE member_id=m.id ORDER BY end_date DESC LIMIT 1
    )
    LEFT JOIN subscription_plans sp ON s.plan_id=sp.id
    LEFT JOIN attendance a ON a.member_id=m.id
    WHERE m.is_active=1
      AND (s.status='expired' OR s.status IS NULL)
      AND date(s.end_date) <= date('now','-'||?||' days')
      ${branchId ? 'AND m.home_branch_id=?' : ''}
    GROUP BY m.id
    ORDER BY s.end_date DESC
  `).all(days, ...(branchId ? [branchId] : []));

  res.json({ success: true, data: members });
});

// Attendance summary
router.get('/attendance/summary', (req: Request, res: Response) => {
  const dateFrom = req.query.date_from as string || new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0];
  const dateTo = req.query.date_to as string || new Date().toISOString().split('T')[0];
  const branchId = req.effectiveBranchId;
  const bf = branchId ? 'AND a.branch_id=?' : '';
  const bp = branchId ? [branchId] : [];

  const daily = db.prepare(`
    SELECT date(check_in_time) as day, COUNT(*) as checkins,
           COUNT(DISTINCT member_id) as unique_members
    FROM attendance a
    WHERE date(check_in_time) BETWEEN ? AND ? ${bf}
    GROUP BY day ORDER BY day ASC
  `).all(dateFrom, dateTo, ...bp);

  const peakHours = db.prepare(`
    SELECT CAST(strftime('%H',check_in_time) AS INTEGER) as hour, COUNT(*) as count
    FROM attendance a WHERE date(check_in_time) BETWEEN ? AND ? ${bf}
    GROUP BY hour ORDER BY count DESC
  `).all(dateFrom, dateTo, ...bp);

  const byBranch = req.user!.role === 'admin' ? db.prepare(`
    SELECT b.name as branch_name, COUNT(*) as checkins
    FROM attendance a JOIN branches b ON a.branch_id=b.id
    WHERE date(a.check_in_time) BETWEEN ? AND ?
    GROUP BY b.id ORDER BY checkins DESC
  `).all(dateFrom, dateTo) : [];

  res.json({ success: true, data: { daily, peak_hours: peakHours, by_branch: byBranch } });
});

// Branch comparison
router.get('/branches/comparison', (req: Request, res: Response) => {
  if (req.user!.role !== 'admin') {
    res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'غير مسموح' } });
    return;
  }
  const dateFrom = req.query.date_from as string || new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0];
  const dateTo = req.query.date_to as string || new Date().toISOString().split('T')[0];

  const data = db.prepare(`
    SELECT b.id, b.name,
      (SELECT COUNT(DISTINCT m.id) FROM members m WHERE m.home_branch_id=b.id AND m.is_active=1) as total_members,
      (SELECT COUNT(DISTINCT s.member_id) FROM subscriptions s WHERE s.branch_id=b.id AND s.status='active') as active_members,
      (SELECT COALESCE(SUM(s.price_paid),0) FROM subscriptions s WHERE s.branch_id=b.id AND date(s.created_at) BETWEEN ? AND ?) as revenue,
      (SELECT COUNT(*) FROM subscriptions s WHERE s.branch_id=b.id AND date(s.created_at) BETWEEN ? AND ?) as new_subs,
      (SELECT COUNT(*) FROM attendance a WHERE a.branch_id=b.id AND date(a.check_in_time) BETWEEN ? AND ?) as checkins
    FROM branches b WHERE b.is_active=1
  `).all(dateFrom, dateTo, dateFrom, dateTo, dateFrom, dateTo);

  res.json({ success: true, data });
});

export default router;

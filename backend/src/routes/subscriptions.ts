import { Router, Request, Response } from 'express';
import { authenticateJWT } from '../middleware/auth';
import { scopeToBranch } from '../middleware/branchScope';
import { db } from '../db/index';
import {
  autoExpireSubscriptions,
  freezeSubscription,
  unfreezeSubscription,
  renewSubscription,
} from '../services/subscription.service';

const router = Router();
router.use(authenticateJWT, scopeToBranch);

router.get('/', (req: Request, res: Response) => {
  autoExpireSubscriptions();

  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const perPage = parseInt(req.query.per_page as string) || 20;
  const offset = (page - 1) * perPage;
  const status = req.query.status as string || '';
  const search = req.query.search as string || '';
  const branchId = req.effectiveBranchId;

  let where = 'WHERE 1=1';
  const params: any[] = [];

  if (branchId) { where += ' AND s.branch_id = ?'; params.push(branchId); }
  if (status) { where += ' AND s.status = ?'; params.push(status); }
  if (search) {
    where += ' AND (m.name_ar LIKE ? OR m.member_code LIKE ?)';
    params.push(`%${search}%`, `%${search}%`);
  }

  const total = (db.prepare(`
    SELECT COUNT(*) as count FROM subscriptions s
    JOIN members m ON s.member_id = m.id
    ${where}
  `).get(...params) as { count: number }).count;

  const subs = db.prepare(`
    SELECT s.*, m.name_ar as member_name, m.member_code, m.photo_path,
           sp.name as plan_name, sp.duration_days,
           b.name as branch_name,
           u.name as processed_by_name
    FROM subscriptions s
    JOIN members m ON s.member_id = m.id
    JOIN subscription_plans sp ON s.plan_id = sp.id
    JOIN branches b ON s.branch_id = b.id
    LEFT JOIN users u ON s.processed_by = u.id
    ${where}
    ORDER BY s.created_at DESC
    LIMIT ? OFFSET ?
  `).all(...params, perPage, offset);

  res.json({ success: true, data: subs, meta: { total, page, per_page: perPage } });
});

router.get('/:id', (req: Request, res: Response) => {
  const sub = db.prepare(`
    SELECT s.*, m.name_ar as member_name, m.member_code, m.phone as member_phone,
           sp.name as plan_name, sp.duration_days, sp.features_json,
           b.name as branch_name, u.name as processed_by_name
    FROM subscriptions s
    JOIN members m ON s.member_id = m.id
    JOIN subscription_plans sp ON s.plan_id = sp.id
    JOIN branches b ON s.branch_id = b.id
    LEFT JOIN users u ON s.processed_by = u.id
    WHERE s.id = ?
  `).get(req.params.id) as any;

  if (!sub) {
    res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'الاشتراك غير موجود' } });
    return;
  }

  const freezes = db.prepare(
    'SELECT * FROM subscription_freezes WHERE subscription_id = ? ORDER BY created_at DESC'
  ).all(req.params.id);

  const gymSettings = db.prepare("SELECT key, value FROM settings WHERE key IN ('gym_name','gym_phone','gym_address')").all() as Array<{key: string; value: string}>;
  const gymInfo: Record<string, string> = {};
  for (const s of gymSettings) gymInfo[s.key] = s.value;

  res.json({ success: true, data: { ...sub, freezes, gym_info: gymInfo } });
});

router.post('/', (req: Request, res: Response) => {
  const { member_id, plan_id, start_date, price_paid, discount_amount,
          discount_reason, payment_method, payment_reference, notes } = req.body;

  if (!member_id || !plan_id || !start_date) {
    res.status(400).json({ success: false, error: { code: 'VALIDATION', message: 'بيانات الاشتراك ناقصة' } });
    return;
  }

  const member = db.prepare('SELECT * FROM members WHERE id = ? AND is_active = 1').get(member_id);
  if (!member) {
    res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'العضو غير موجود' } });
    return;
  }

  const plan = db.prepare('SELECT * FROM subscription_plans WHERE id = ? AND is_active = 1').get(plan_id) as any;
  if (!plan) {
    res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'الخطة غير موجودة' } });
    return;
  }

  const branchId = req.effectiveBranchId || req.user!.branchId;
  if (!branchId) {
    res.status(400).json({ success: false, error: { code: 'VALIDATION', message: 'الفرع مطلوب' } });
    return;
  }

  const endDate = new Date(start_date);
  endDate.setDate(endDate.getDate() + plan.duration_days - 1);
  const end_date = endDate.toISOString().split('T')[0];

  try {
    const result = db.prepare(`
      INSERT INTO subscriptions (
        member_id, plan_id, branch_id, start_date, end_date, price_paid,
        discount_amount, discount_reason, payment_method, payment_reference,
        processed_by, notes, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')
    `).run(
      member_id, plan_id, branchId, start_date, end_date,
      price_paid ?? plan.price,
      discount_amount || 0, discount_reason || null,
      payment_method || 'cash', payment_reference || null,
      req.user!.userId, notes || null
    );

    const sub = db.prepare('SELECT * FROM subscriptions WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json({ success: true, data: sub });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } });
  }
});

router.put('/:id', (req: Request, res: Response) => {
  const existing = db.prepare('SELECT * FROM subscriptions WHERE id = ?').get(req.params.id) as any;
  if (!existing) {
    res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'الاشتراك غير موجود' } });
    return;
  }
  db.prepare(`
    UPDATE subscriptions SET notes=?, payment_method=?, payment_reference=?, updated_at=datetime('now')
    WHERE id=?
  `).run(
    req.body.notes ?? existing.notes,
    req.body.payment_method ?? existing.payment_method,
    req.body.payment_reference ?? existing.payment_reference,
    req.params.id
  );
  const updated = db.prepare('SELECT * FROM subscriptions WHERE id = ?').get(req.params.id);
  res.json({ success: true, data: updated });
});

router.post('/:id/freeze', (req: Request, res: Response) => {
  const { days, reason } = req.body;
  if (!days || days < 1) {
    res.status(400).json({ success: false, error: { code: 'VALIDATION', message: 'عدد أيام التجميد مطلوب' } });
    return;
  }
  try {
    freezeSubscription(parseInt(req.params.id), days, reason || '', req.user!.userId);
    const sub = db.prepare('SELECT * FROM subscriptions WHERE id = ?').get(req.params.id);
    res.json({ success: true, data: sub });
  } catch (err: any) {
    res.status(400).json({ success: false, error: { code: 'FREEZE_ERROR', message: err.message } });
  }
});

router.post('/:id/unfreeze', (req: Request, res: Response) => {
  try {
    unfreezeSubscription(parseInt(req.params.id));
    const sub = db.prepare('SELECT * FROM subscriptions WHERE id = ?').get(req.params.id);
    res.json({ success: true, data: sub });
  } catch (err: any) {
    res.status(400).json({ success: false, error: { code: 'UNFREEZE_ERROR', message: err.message } });
  }
});

router.post('/:id/renew', (req: Request, res: Response) => {
  const branchId = req.effectiveBranchId || req.user!.branchId;
  if (!branchId) {
    res.status(400).json({ success: false, error: { code: 'VALIDATION', message: 'الفرع مطلوب' } });
    return;
  }
  try {
    const newSubId = renewSubscription(parseInt(req.params.id), req.user!.userId, branchId);
    const sub = db.prepare(`
      SELECT s.*, sp.name as plan_name, b.name as branch_name
      FROM subscriptions s
      JOIN subscription_plans sp ON s.plan_id = sp.id
      JOIN branches b ON s.branch_id = b.id
      WHERE s.id = ?
    `).get(newSubId);
    res.status(201).json({ success: true, data: sub });
  } catch (err: any) {
    res.status(400).json({ success: false, error: { code: 'RENEW_ERROR', message: err.message } });
  }
});

router.post('/:id/cancel', (req: Request, res: Response) => {
  const { reason } = req.body;
  if (!reason) {
    res.status(400).json({ success: false, error: { code: 'VALIDATION', message: 'سبب الإلغاء مطلوب' } });
    return;
  }
  const existing = db.prepare('SELECT * FROM subscriptions WHERE id = ?').get(req.params.id) as any;
  if (!existing) {
    res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'الاشتراك غير موجود' } });
    return;
  }
  if (existing.status === 'cancelled') {
    res.status(400).json({ success: false, error: { code: 'ALREADY_CANCELLED', message: 'الاشتراك ملغى مسبقاً' } });
    return;
  }
  db.prepare(`
    UPDATE subscriptions SET status='cancelled', notes=?, updated_at=datetime('now') WHERE id=?
  `).run(reason, req.params.id);
  const sub = db.prepare('SELECT * FROM subscriptions WHERE id = ?').get(req.params.id);
  res.json({ success: true, data: sub });
});

export default router;

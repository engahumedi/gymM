import { Router, Request, Response } from 'express';
import { authenticateJWT } from '../middleware/auth';
import { requireRole } from '../middleware/roles';
import { db } from '../db/index';

const router = Router();
router.use(authenticateJWT);

router.get('/', (_req: Request, res: Response) => {
  const plans = db.prepare('SELECT * FROM subscription_plans ORDER BY price ASC').all();
  res.json({ success: true, data: plans });
});

router.get('/:id', (req: Request, res: Response) => {
  const plan = db.prepare('SELECT * FROM subscription_plans WHERE id = ?').get(req.params.id);
  if (!plan) {
    res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'الخطة غير موجودة' } });
    return;
  }
  res.json({ success: true, data: plan });
});

router.post('/', requireRole('admin'), (req: Request, res: Response) => {
  const { name, duration_days, price, description, features_json, sessions_per_day } = req.body;
  if (!name || !duration_days || price === undefined) {
    res.status(400).json({ success: false, error: { code: 'VALIDATION', message: 'الاسم والمدة والسعر مطلوبة' } });
    return;
  }
  const result = db.prepare(`
    INSERT INTO subscription_plans (name, duration_days, price, description, features_json, sessions_per_day)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    name, duration_days, price, description || null,
    features_json ? JSON.stringify(features_json) : '[]',
    sessions_per_day || null
  );
  const plan = db.prepare('SELECT * FROM subscription_plans WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json({ success: true, data: plan });
});

router.put('/:id', requireRole('admin'), (req: Request, res: Response) => {
  const existing = db.prepare('SELECT * FROM subscription_plans WHERE id = ?').get(req.params.id) as any;
  if (!existing) {
    res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'الخطة غير موجودة' } });
    return;
  }
  db.prepare(`
    UPDATE subscription_plans
    SET name=?, duration_days=?, price=?, description=?, features_json=?, sessions_per_day=?, is_active=?, updated_at=datetime('now')
    WHERE id=?
  `).run(
    req.body.name ?? existing.name,
    req.body.duration_days ?? existing.duration_days,
    req.body.price ?? existing.price,
    req.body.description ?? existing.description,
    req.body.features_json ? JSON.stringify(req.body.features_json) : existing.features_json,
    req.body.sessions_per_day !== undefined ? req.body.sessions_per_day : existing.sessions_per_day,
    req.body.is_active !== undefined ? (req.body.is_active ? 1 : 0) : existing.is_active,
    req.params.id
  );
  const updated = db.prepare('SELECT * FROM subscription_plans WHERE id = ?').get(req.params.id);
  res.json({ success: true, data: updated });
});

router.delete('/:id', requireRole('admin'), (req: Request, res: Response) => {
  const usageCount = (db.prepare('SELECT COUNT(*) as count FROM subscriptions WHERE plan_id = ?').get(req.params.id) as { count: number }).count;
  if (usageCount > 0) {
    res.status(400).json({ success: false, error: { code: 'IN_USE', message: `لا يمكن حذف الخطة، تستخدمها ${usageCount} اشتراكات` } });
    return;
  }
  db.prepare("UPDATE subscription_plans SET is_active=0, updated_at=datetime('now') WHERE id=?").run(req.params.id);
  res.json({ success: true, data: { message: 'تم حذف الخطة' } });
});

export default router;

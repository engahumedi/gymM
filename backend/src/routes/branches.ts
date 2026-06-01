import { Router, Request, Response } from 'express';
import { authenticateJWT } from '../middleware/auth';
import { requireRole } from '../middleware/roles';
import { db } from '../db/index';

const router = Router();
router.use(authenticateJWT);

router.get('/', (req: Request, res: Response) => {
  let query: string;
  let params: any[];

  if (req.user!.role === 'admin') {
    query = `
      SELECT b.*,
        (SELECT COUNT(*) FROM users u WHERE u.branch_id = b.id AND u.is_active = 1) as staff_count,
        (SELECT COUNT(DISTINCT s.member_id) FROM subscriptions s WHERE s.branch_id = b.id AND s.status = 'active') as active_members,
        (SELECT COALESCE(SUM(s.price_paid), 0) FROM subscriptions s
         WHERE s.branch_id = b.id AND strftime('%Y-%m', s.created_at) = strftime('%Y-%m', 'now')) as revenue_this_month
      FROM branches b
      ORDER BY b.id
    `;
    params = [];
  } else {
    query = `
      SELECT b.*,
        (SELECT COUNT(*) FROM users u WHERE u.branch_id = b.id AND u.is_active = 1) as staff_count,
        (SELECT COUNT(DISTINCT s.member_id) FROM subscriptions s WHERE s.branch_id = b.id AND s.status = 'active') as active_members,
        (SELECT COALESCE(SUM(s.price_paid), 0) FROM subscriptions s
         WHERE s.branch_id = b.id AND strftime('%Y-%m', s.created_at) = strftime('%Y-%m', 'now')) as revenue_this_month
      FROM branches b
      WHERE b.id = ?
    `;
    params = [req.user!.branchId];
  }

  const branches = db.prepare(query).all(...params);
  res.json({ success: true, data: branches });
});

router.get('/:id', (req: Request, res: Response) => {
  const branch = db.prepare(`
    SELECT b.*,
      (SELECT COUNT(*) FROM users u WHERE u.branch_id = b.id AND u.is_active = 1) as staff_count,
      (SELECT COUNT(DISTINCT s.member_id) FROM subscriptions s WHERE s.branch_id = b.id AND s.status = 'active') as active_members,
      (SELECT COALESCE(SUM(s.price_paid), 0) FROM subscriptions s
       WHERE s.branch_id = b.id AND strftime('%Y-%m', s.created_at) = strftime('%Y-%m', 'now')) as revenue_this_month
    FROM branches b WHERE b.id = ?
  `).get(req.params.id);

  if (!branch) {
    res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'الفرع غير موجود' } });
    return;
  }
  res.json({ success: true, data: branch });
});

router.post('/', requireRole('admin'), (req: Request, res: Response) => {
  const { name, address, phone, manager_name } = req.body;
  if (!name) {
    res.status(400).json({ success: false, error: { code: 'VALIDATION', message: 'اسم الفرع مطلوب' } });
    return;
  }
  try {
    const result = db.prepare(
      'INSERT INTO branches (name, address, phone, manager_name) VALUES (?, ?, ?, ?)'
    ).run(name, address || null, phone || null, manager_name || null);
    const branch = db.prepare('SELECT * FROM branches WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json({ success: true, data: branch });
  } catch (err: any) {
    if (err.message?.includes('UNIQUE')) {
      res.status(400).json({ success: false, error: { code: 'DUPLICATE', message: 'اسم الفرع مستخدم مسبقاً' } });
    } else {
      res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: 'خطأ في الخادم' } });
    }
  }
});

router.put('/:id', requireRole('admin'), (req: Request, res: Response) => {
  const { name, address, phone, manager_name, is_active } = req.body;
  const existing = db.prepare('SELECT * FROM branches WHERE id = ?').get(req.params.id);
  if (!existing) {
    res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'الفرع غير موجود' } });
    return;
  }
  try {
    db.prepare(`
      UPDATE branches SET name=?, address=?, phone=?, manager_name=?, is_active=?, updated_at=datetime('now')
      WHERE id=?
    `).run(
      name ?? (existing as any).name,
      address ?? (existing as any).address,
      phone ?? (existing as any).phone,
      manager_name ?? (existing as any).manager_name,
      is_active !== undefined ? (is_active ? 1 : 0) : (existing as any).is_active,
      req.params.id
    );
    const updated = db.prepare('SELECT * FROM branches WHERE id = ?').get(req.params.id);
    res.json({ success: true, data: updated });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: 'خطأ في الخادم' } });
  }
});

export default router;

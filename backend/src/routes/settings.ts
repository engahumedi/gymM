import { Router, Request, Response } from 'express';
import { authenticateJWT } from '../middleware/auth';
import { requireRole } from '../middleware/roles';
import { db } from '../db/index';
import { uploadPhoto } from '../middleware/upload';
import bcrypt from 'bcryptjs';

const router = Router();
router.use(authenticateJWT, requireRole('admin'));

router.get('/', (_req: Request, res: Response) => {
  const settings = db.prepare('SELECT * FROM settings').all() as Array<{ key: string; value: string }>;
  const obj: Record<string, string> = {};
  for (const s of settings) obj[s.key] = s.value;
  res.json({ success: true, data: obj });
});

router.put('/', (req: Request, res: Response) => {
  const updates = req.body as Record<string, string>;
  const upsert = db.prepare(`
    INSERT INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
    ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=datetime('now')
  `);
  for (const [key, value] of Object.entries(updates)) {
    upsert.run(key, String(value));
  }
  res.json({ success: true, data: { message: 'تم تحديث الإعدادات' } });
});

router.put('/logo', uploadPhoto, (req: Request, res: Response) => {
  if (!req.file) {
    res.status(400).json({ success: false, error: { code: 'NO_FILE', message: 'لم يتم رفع الشعار' } });
    return;
  }
  const logoPath = `/uploads/members/${req.file.filename}`;
  db.prepare(`
    INSERT INTO settings (key, value, updated_at) VALUES ('gym_logo', ?, datetime('now'))
    ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=datetime('now')
  `).run(logoPath);
  res.json({ success: true, data: { logo_path: logoPath } });
});

// User management
router.get('/users', (_req: Request, res: Response) => {
  const users = db.prepare(`
    SELECT u.id, u.name, u.email, u.role, u.branch_id, u.is_active,
           b.name as branch_name, u.created_at
    FROM users u
    LEFT JOIN branches b ON u.branch_id = b.id
    ORDER BY u.role, u.name
  `).all();
  res.json({ success: true, data: users });
});

router.post('/users', (req: Request, res: Response) => {
  const { name, email, password, role, branch_id } = req.body;
  if (!name || !email || !password || !role) {
    res.status(400).json({ success: false, error: { code: 'VALIDATION', message: 'جميع الحقول مطلوبة' } });
    return;
  }
  if (role === 'receptionist' && !branch_id) {
    res.status(400).json({ success: false, error: { code: 'VALIDATION', message: 'الفرع مطلوب للموظف' } });
    return;
  }
  try {
    const hash = bcrypt.hashSync(password, 10);
    const result = db.prepare(
      'INSERT INTO users (name, email, password_hash, role, branch_id) VALUES (?, ?, ?, ?, ?)'
    ).run(name, email, hash, role, role === 'admin' ? null : branch_id);
    const user = db.prepare('SELECT id, name, email, role, branch_id, is_active FROM users WHERE id=?').get(result.lastInsertRowid);
    res.status(201).json({ success: true, data: user });
  } catch (err: any) {
    if (err.message?.includes('UNIQUE')) {
      res.status(400).json({ success: false, error: { code: 'DUPLICATE', message: 'البريد الإلكتروني مستخدم مسبقاً' } });
    } else {
      res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } });
    }
  }
});

router.put('/users/:id', (req: Request, res: Response) => {
  const { name, email, password, is_active, branch_id } = req.body;
  const existing = db.prepare('SELECT * FROM users WHERE id=?').get(req.params.id) as any;
  if (!existing) {
    res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'المستخدم غير موجود' } });
    return;
  }
  const hash = password ? bcrypt.hashSync(password, 10) : existing.password_hash;
  try {
    db.prepare(`
      UPDATE users SET name=?, email=?, password_hash=?, is_active=?, branch_id=?, updated_at=datetime('now') WHERE id=?
    `).run(
      name ?? existing.name,
      email ?? existing.email,
      hash,
      is_active !== undefined ? (is_active ? 1 : 0) : existing.is_active,
      branch_id !== undefined ? branch_id : existing.branch_id,
      req.params.id
    );
    const user = db.prepare('SELECT id, name, email, role, branch_id, is_active FROM users WHERE id=?').get(req.params.id);
    res.json({ success: true, data: user });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } });
  }
});

// Data backup
router.get('/backup', (_req: Request, res: Response) => {
  const tables = ['branches', 'users', 'members', 'subscription_plans', 'subscriptions',
                  'subscription_freezes', 'attendance', 'notifications', 'settings'];
  const backup: Record<string, unknown[]> = {};
  for (const table of tables) {
    backup[table] = db.prepare(`SELECT * FROM ${table}`).all();
  }
  res.setHeader('Content-Disposition', `attachment; filename="gym-backup-${new Date().toISOString().split('T')[0]}.json"`);
  res.json(backup);
});

// Danger zone: reset
router.post('/reset', (req: Request, res: Response) => {
  const { confirm, admin_password } = req.body;
  if (confirm !== 'CONFIRM') {
    res.status(400).json({ success: false, error: { code: 'VALIDATION', message: 'يجب كتابة CONFIRM' } });
    return;
  }
  const admin = db.prepare('SELECT * FROM users WHERE id=?').get(req.user!.userId) as any;
  if (!admin || !bcrypt.compareSync(admin_password, admin.password_hash)) {
    res.status(401).json({ success: false, error: { code: 'INVALID_PASSWORD', message: 'كلمة المرور غير صحيحة' } });
    return;
  }
  db.exec(`
    DELETE FROM attendance;
    DELETE FROM subscription_freezes;
    DELETE FROM subscriptions;
    DELETE FROM notifications;
    DELETE FROM members;
    DELETE FROM refresh_tokens;
    UPDATE settings SET value='0' WHERE key='member_code_counter';
  `);
  res.json({ success: true, data: { message: 'تم إعادة تعيين البيانات' } });
});

export default router;

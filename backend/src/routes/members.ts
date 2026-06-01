import { Router, Request, Response } from 'express';
import { authenticateJWT } from '../middleware/auth';
import { requireRole } from '../middleware/roles';
import { scopeToBranch } from '../middleware/branchScope';
import { uploadPhoto } from '../middleware/upload';
import { db } from '../db/index';
import QRCode from 'qrcode';

const router = Router();
router.use(authenticateJWT, scopeToBranch);

const generateMemberCode = (dbInstance: typeof db) => {
  return (dbInstance as any).transaction(() => {
    const row = (dbInstance as any).prepare("SELECT value FROM settings WHERE key='member_code_counter'").get() as { value: string };
    const next = parseInt(row.value, 10) + 1;
    (dbInstance as any).prepare("UPDATE settings SET value=? WHERE key='member_code_counter'").run(String(next));
    return `GYM-${String(next).padStart(4, '0')}`;
  })();
};

router.get('/', (req: Request, res: Response) => {
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const perPage = parseInt(req.query.per_page as string) || 20;
  const offset = (page - 1) * perPage;
  const search = req.query.search as string || '';
  const status = req.query.status as string || '';
  const gender = req.query.gender as string || '';
  const branchId = req.effectiveBranchId;

  let whereClause = 'WHERE m.is_active = 1';
  const params: any[] = [];

  if (branchId) {
    whereClause += ' AND m.home_branch_id = ?';
    params.push(branchId);
  }
  if (search) {
    whereClause += ' AND (m.name_ar LIKE ? OR m.name_en LIKE ? OR m.phone LIKE ? OR m.member_code LIKE ?)';
    const s = `%${search}%`;
    params.push(s, s, s, s);
  }
  if (status) {
    whereClause += ' AND m.status = ?';
    params.push(status);
  }
  if (gender) {
    whereClause += ' AND m.gender = ?';
    params.push(gender);
  }

  const total = (db.prepare(`SELECT COUNT(*) as count FROM members m ${whereClause}`).get(...params) as { count: number }).count;

  const members = db.prepare(`
    SELECT m.*,
      b.name as home_branch_name,
      s.id as sub_id, s.status as sub_status, s.end_date as sub_end_date,
      sp.name as plan_name
    FROM members m
    LEFT JOIN branches b ON m.home_branch_id = b.id
    LEFT JOIN subscriptions s ON s.id = (
      SELECT id FROM subscriptions WHERE member_id = m.id AND status = 'active'
      ORDER BY end_date DESC LIMIT 1
    )
    LEFT JOIN subscription_plans sp ON s.plan_id = sp.id
    ${whereClause}
    ORDER BY m.created_at DESC
    LIMIT ? OFFSET ?
  `).all(...params, perPage, offset);

  res.json({
    success: true,
    data: members,
    meta: { total, page, per_page: perPage, total_pages: Math.ceil(total / perPage) },
  });
});

router.get('/:id/qr', async (req: Request, res: Response) => {
  const member = db.prepare('SELECT member_code FROM members WHERE id = ?').get(req.params.id) as { member_code: string } | undefined;
  if (!member) {
    res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'العضو غير موجود' } });
    return;
  }
  try {
    const qrDataUrl = await QRCode.toDataURL(member.member_code, { width: 300, margin: 2 });
    res.json({ success: true, data: { qr: qrDataUrl, member_code: member.member_code } });
  } catch {
    res.status(500).json({ success: false, error: { code: 'QR_ERROR', message: 'فشل إنشاء رمز QR' } });
  }
});

router.get('/:id', (req: Request, res: Response) => {
  const member = db.prepare(`
    SELECT m.*, b.name as home_branch_name
    FROM members m
    LEFT JOIN branches b ON m.home_branch_id = b.id
    WHERE m.id = ? AND m.is_active = 1
  `).get(req.params.id) as any;

  if (!member) {
    res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'العضو غير موجود' } });
    return;
  }

  const subscriptions = db.prepare(`
    SELECT s.*, sp.name as plan_name, sp.duration_days, b.name as branch_name,
           u.name as processed_by_name
    FROM subscriptions s
    JOIN subscription_plans sp ON s.plan_id = sp.id
    JOIN branches b ON s.branch_id = b.id
    LEFT JOIN users u ON s.processed_by = u.id
    WHERE s.member_id = ?
    ORDER BY s.created_at DESC
  `).all(req.params.id);

  const attendance = db.prepare(`
    SELECT a.*, b.name as branch_name, u.name as processed_by_name
    FROM attendance a
    JOIN branches b ON a.branch_id = b.id
    LEFT JOIN users u ON a.processed_by = u.id
    WHERE a.member_id = ?
    ORDER BY a.check_in_time DESC
    LIMIT 100
  `).all(req.params.id);

  res.json({ success: true, data: { ...member, subscriptions, attendance } });
});

router.post('/', uploadPhoto, (req: Request, res: Response) => {
  const { name_ar, name_en, phone, email, gender, dob, national_id,
          emergency_contact_name, emergency_contact_phone, health_notes,
          home_branch_id, join_date } = req.body;

  if (!name_ar) {
    res.status(400).json({ success: false, error: { code: 'VALIDATION', message: 'الاسم بالعربية مطلوب' } });
    return;
  }

  const branchId = req.effectiveBranchId || home_branch_id;
  if (!branchId) {
    res.status(400).json({ success: false, error: { code: 'VALIDATION', message: 'الفرع مطلوب' } });
    return;
  }

  try {
    const member_code = generateMemberCode(db);
    const photo_path = req.file ? `/uploads/members/${req.file.filename}` : null;

    const result = db.prepare(`
      INSERT INTO members (
        member_code, name_ar, name_en, phone, email, photo_path, gender, dob,
        national_id, emergency_contact_name, emergency_contact_phone, health_notes,
        home_branch_id, join_date, created_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      member_code, name_ar, name_en || null, phone || null, email || null,
      photo_path, gender || null, dob || null, national_id || null,
      emergency_contact_name || null, emergency_contact_phone || null,
      health_notes || null, branchId,
      join_date || new Date().toISOString().split('T')[0],
      req.user!.userId
    );

    // Generate new member notification
    db.prepare(`
      INSERT INTO notifications (type, title, message, member_id, branch_id)
      VALUES ('new_member', 'عضو جديد', ?, ?, ?)
    `).run(`تم تسجيل عضو جديد: ${name_ar}`, result.lastInsertRowid, branchId);

    const member = db.prepare('SELECT * FROM members WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json({ success: true, data: member });
  } catch (err: any) {
    if (err.message?.includes('UNIQUE') && err.message?.includes('national_id')) {
      res.status(400).json({ success: false, error: { code: 'DUPLICATE', message: 'رقم الهوية مستخدم مسبقاً' } });
    } else {
      res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } });
    }
  }
});

router.put('/:id', uploadPhoto, (req: Request, res: Response) => {
  const existing = db.prepare('SELECT * FROM members WHERE id = ? AND is_active = 1').get(req.params.id) as any;
  if (!existing) {
    res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'العضو غير موجود' } });
    return;
  }

  const photo_path = req.file ? `/uploads/members/${req.file.filename}` : existing.photo_path;

  try {
    db.prepare(`
      UPDATE members SET
        name_ar=?, name_en=?, phone=?, email=?, photo_path=?, gender=?, dob=?,
        national_id=?, emergency_contact_name=?, emergency_contact_phone=?,
        health_notes=?, home_branch_id=?, status=?, updated_at=datetime('now')
      WHERE id=?
    `).run(
      req.body.name_ar ?? existing.name_ar,
      req.body.name_en ?? existing.name_en,
      req.body.phone ?? existing.phone,
      req.body.email ?? existing.email,
      photo_path,
      req.body.gender ?? existing.gender,
      req.body.dob ?? existing.dob,
      req.body.national_id ?? existing.national_id,
      req.body.emergency_contact_name ?? existing.emergency_contact_name,
      req.body.emergency_contact_phone ?? existing.emergency_contact_phone,
      req.body.health_notes ?? existing.health_notes,
      req.body.home_branch_id ?? existing.home_branch_id,
      req.body.status ?? existing.status,
      req.params.id
    );
    const updated = db.prepare('SELECT * FROM members WHERE id = ?').get(req.params.id);
    res.json({ success: true, data: updated });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } });
  }
});

router.delete('/:id', requireRole('admin'), (req: Request, res: Response) => {
  const existing = db.prepare('SELECT id FROM members WHERE id = ? AND is_active = 1').get(req.params.id);
  if (!existing) {
    res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'العضو غير موجود' } });
    return;
  }
  db.prepare("UPDATE members SET is_active=0, updated_at=datetime('now') WHERE id=?").run(req.params.id);
  res.json({ success: true, data: { message: 'تم حذف العضو' } });
});

export default router;

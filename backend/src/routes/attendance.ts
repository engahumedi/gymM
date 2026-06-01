import { Router, Request, Response } from 'express';
import { authenticateJWT } from '../middleware/auth';
import { scopeToBranch } from '../middleware/branchScope';
import { db } from '../db/index';

const router = Router();
router.use(authenticateJWT, scopeToBranch);

router.post('/', (req: Request, res: Response) => {
  const { member_code, member_id, method = 'manual', branch_id: bodyBranchId } = req.body;
  const branchId = req.effectiveBranchId || req.user!.branchId || (bodyBranchId ? Number(bodyBranchId) : null);

  if (!branchId) {
    res.status(400).json({ success: false, error: { code: 'VALIDATION', message: 'الفرع مطلوب' } });
    return;
  }

  let member: any;
  if (member_code) {
    member = db.prepare('SELECT * FROM members WHERE member_code = ? AND is_active = 1').get(member_code);
  } else if (member_id) {
    member = db.prepare('SELECT * FROM members WHERE id = ? AND is_active = 1').get(member_id);
  }

  if (!member) {
    res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'العضو غير موجود' } });
    return;
  }

  // Check for active subscription
  const activeSub = db.prepare(`
    SELECT s.*, sp.sessions_per_day FROM subscriptions s
    JOIN subscription_plans sp ON s.plan_id = sp.id
    WHERE s.member_id = ? AND s.status = 'active' AND date(s.end_date) >= date('now')
    ORDER BY s.end_date DESC LIMIT 1
  `).get(member.id) as any;

  if (!activeSub) {
    res.status(400).json({ success: false, error: { code: 'NO_ACTIVE_SUB', message: 'لا يوجد اشتراك نشط لهذا العضو' } });
    return;
  }

  // Check sessions per day limit
  if (activeSub.sessions_per_day) {
    const todayCount = (db.prepare(`
      SELECT COUNT(*) as count FROM attendance
      WHERE member_id = ? AND date(check_in_time) = date('now')
    `).get(member.id) as { count: number }).count;

    if (todayCount >= activeSub.sessions_per_day) {
      res.status(400).json({ success: false, error: { code: 'SESSION_LIMIT', message: 'تم استنفاد الحد اليومي للجلسات' } });
      return;
    }
  }

  const result = db.prepare(`
    INSERT INTO attendance (member_id, subscription_id, branch_id, method, processed_by)
    VALUES (?, ?, ?, ?, ?)
  `).run(member.id, activeSub.id, branchId, method, req.user!.userId);

  const daysLeft = Math.ceil(
    (new Date(activeSub.end_date).getTime() - Date.now()) / 86400000
  );

  const branch = db.prepare('SELECT name FROM branches WHERE id = ?').get(branchId) as { name: string };

  res.status(201).json({
    success: true,
    data: {
      attendance_id: result.lastInsertRowid,
      member: {
        id: member.id,
        name_ar: member.name_ar,
        member_code: member.member_code,
        photo_path: member.photo_path,
      },
      subscription: {
        end_date: activeSub.end_date,
        days_left: daysLeft,
      },
      branch_name: branch?.name,
      check_in_time: new Date().toISOString(),
    },
  });
});

router.post('/checkout/:id', (req: Request, res: Response) => {
  const record = db.prepare('SELECT * FROM attendance WHERE id = ?').get(req.params.id) as any;
  if (!record) {
    res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'سجل الحضور غير موجود' } });
    return;
  }
  db.prepare("UPDATE attendance SET check_out_time=datetime('now') WHERE id=?").run(req.params.id);
  res.json({ success: true, data: { message: 'تم تسجيل الانصراف' } });
});

router.get('/', (req: Request, res: Response) => {
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const perPage = parseInt(req.query.per_page as string) || 50;
  const offset = (page - 1) * perPage;
  const branchId = req.effectiveBranchId;
  const dateFrom = req.query.date_from as string;
  const dateTo = req.query.date_to as string;
  const search = req.query.search as string;

  let where = 'WHERE 1=1';
  const params: any[] = [];

  if (branchId) { where += ' AND a.branch_id = ?'; params.push(branchId); }
  if (dateFrom) { where += ' AND date(a.check_in_time) >= ?'; params.push(dateFrom); }
  if (dateTo) { where += ' AND date(a.check_in_time) <= ?'; params.push(dateTo); }
  if (search) {
    where += ' AND (m.name_ar LIKE ? OR m.member_code LIKE ?)';
    params.push(`%${search}%`, `%${search}%`);
  }

  const total = (db.prepare(`
    SELECT COUNT(*) as count FROM attendance a
    JOIN members m ON a.member_id = m.id
    ${where}
  `).get(...params) as { count: number }).count;

  const records = db.prepare(`
    SELECT a.*, m.name_ar as member_name, m.member_code, m.photo_path,
           b.name as branch_name, u.name as processed_by_name
    FROM attendance a
    JOIN members m ON a.member_id = m.id
    JOIN branches b ON a.branch_id = b.id
    LEFT JOIN users u ON a.processed_by = u.id
    ${where}
    ORDER BY a.check_in_time DESC
    LIMIT ? OFFSET ?
  `).all(...params, perPage, offset);

  res.json({ success: true, data: records, meta: { total, page, per_page: perPage } });
});

router.get('/member/:memberId', (req: Request, res: Response) => {
  const records = db.prepare(`
    SELECT a.*, b.name as branch_name
    FROM attendance a
    JOIN branches b ON a.branch_id = b.id
    WHERE a.member_id = ?
    ORDER BY a.check_in_time DESC
    LIMIT 200
  `).all(req.params.memberId);
  res.json({ success: true, data: records });
});

export default router;

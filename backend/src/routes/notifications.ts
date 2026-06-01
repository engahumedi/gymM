import { Router, Request, Response } from 'express';
import { authenticateJWT } from '../middleware/auth';
import { scopeToBranch } from '../middleware/branchScope';
import { db } from '../db/index';
import { generateNotifications } from '../services/notification.service';

const router = Router();
router.use(authenticateJWT, scopeToBranch);

router.get('/', (req: Request, res: Response) => {
  const branchId = req.effectiveBranchId;
  const isAdmin = req.user!.role === 'admin';

  let where = 'WHERE 1=1';
  const params: any[] = [];

  if (!isAdmin) {
    where += ' AND (n.branch_id = ? OR n.branch_id IS NULL)';
    where += ' AND (n.target_role = "all" OR n.target_role = "receptionist")';
    params.push(branchId);
  }

  const notifications = db.prepare(`
    SELECT n.*, m.name_ar as member_name, m.member_code,
           b.name as branch_name
    FROM notifications n
    LEFT JOIN members m ON n.member_id = m.id
    LEFT JOIN branches b ON n.branch_id = b.id
    ${where}
    ORDER BY n.created_at DESC
    LIMIT 50
  `).all(...params);

  const unreadCount = (db.prepare(`
    SELECT COUNT(*) as count FROM notifications n
    ${where} AND n.is_read = 0
  `).get(...params) as { count: number }).count;

  res.json({ success: true, data: notifications, meta: { unread_count: unreadCount } });
});

router.post('/generate', (_req: Request, res: Response) => {
  generateNotifications();
  res.json({ success: true, data: { message: 'تم إنشاء الإشعارات' } });
});

router.put('/:id/read', (req: Request, res: Response) => {
  db.prepare('UPDATE notifications SET is_read=1 WHERE id=?').run(req.params.id);
  res.json({ success: true, data: { message: 'تم تحديث الإشعار' } });
});

router.put('/read-all', (req: Request, res: Response) => {
  const branchId = req.effectiveBranchId;
  if (branchId) {
    db.prepare('UPDATE notifications SET is_read=1 WHERE branch_id=? OR branch_id IS NULL').run(branchId);
  } else {
    db.prepare('UPDATE notifications SET is_read=1').run();
  }
  res.json({ success: true, data: { message: 'تم تحديث جميع الإشعارات' } });
});

router.delete('/:id', (req: Request, res: Response) => {
  db.prepare('DELETE FROM notifications WHERE id=?').run(req.params.id);
  res.json({ success: true, data: { message: 'تم حذف الإشعار' } });
});

export default router;

import { Router, Request, Response } from 'express';
import { authenticateJWT } from '../middleware/auth';
import { loginUser, refreshTokens, revokeRefreshToken, revokeAllUserTokens } from '../services/auth.service';
import { db } from '../db/index';
import { autoExpireSubscriptions } from '../services/subscription.service';

const router = Router();

const COOKIE_OPTS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: (process.env.NODE_ENV === 'production' ? 'strict' : 'lax') as 'strict' | 'lax',
};

router.post('/login', (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      res.status(400).json({ success: false, error: { code: 'VALIDATION', message: 'البريد الإلكتروني وكلمة المرور مطلوبان' } });
      return;
    }
    const { tokens, user } = loginUser(email, password);

    res.cookie('accessToken', tokens.accessToken, { ...COOKIE_OPTS, maxAge: 15 * 60 * 1000 });
    res.cookie('refreshToken', tokens.refreshToken, { ...COOKIE_OPTS, maxAge: 7 * 24 * 60 * 60 * 1000 });

    const branch = user.branch_id
      ? db.prepare('SELECT id, name FROM branches WHERE id = ?').get(user.branch_id)
      : null;

    res.json({
      success: true,
      data: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        branchId: user.branch_id,
        branch,
      },
    });
  } catch (err: any) {
    res.status(401).json({ success: false, error: { code: 'INVALID_CREDENTIALS', message: err.message } });
  }
});

router.post('/refresh', (req: Request, res: Response) => {
  try {
    const refreshToken = req.cookies?.refreshToken;
    if (!refreshToken) {
      res.status(401).json({ success: false, error: { code: 'NO_REFRESH_TOKEN', message: 'لا يوجد رمز تحديث' } });
      return;
    }
    const tokens = refreshTokens(refreshToken);
    res.cookie('accessToken', tokens.accessToken, { ...COOKIE_OPTS, maxAge: 15 * 60 * 1000 });
    res.cookie('refreshToken', tokens.refreshToken, { ...COOKIE_OPTS, maxAge: 7 * 24 * 60 * 60 * 1000 });
    res.json({ success: true, data: { message: 'تم تجديد الجلسة' } });
  } catch (err: any) {
    res.status(401).json({ success: false, error: { code: 'REFRESH_FAILED', message: err.message } });
  }
});

router.post('/logout', authenticateJWT, (req: Request, res: Response) => {
  const refreshToken = req.cookies?.refreshToken;
  if (refreshToken) revokeRefreshToken(refreshToken);
  res.clearCookie('accessToken');
  res.clearCookie('refreshToken');
  res.json({ success: true, data: { message: 'تم تسجيل الخروج' } });
});

router.post('/logout-all', authenticateJWT, (req: Request, res: Response) => {
  revokeAllUserTokens(req.user!.userId);
  res.clearCookie('accessToken');
  res.clearCookie('refreshToken');
  res.json({ success: true, data: { message: 'تم تسجيل الخروج من جميع الأجهزة' } });
});

router.get('/me', authenticateJWT, (req: Request, res: Response) => {
  autoExpireSubscriptions();
  const user = db.prepare(`
    SELECT u.id, u.name, u.email, u.role, u.branch_id,
           b.name as branch_name
    FROM users u
    LEFT JOIN branches b ON u.branch_id = b.id
    WHERE u.id = ? AND u.is_active = 1
  `).get(req.user!.userId) as any;

  if (!user) {
    res.status(401).json({ success: false, error: { code: 'USER_NOT_FOUND', message: 'المستخدم غير موجود' } });
    return;
  }
  res.json({ success: true, data: user });
});

export default router;

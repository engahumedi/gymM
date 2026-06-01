import { Request, Response, NextFunction } from 'express';
import { JwtPayload } from './auth';

export function requireRole(...roles: JwtPayload['role'][]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user || !roles.includes(req.user.role)) {
      res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'غير مسموح' } });
      return;
    }
    next();
  };
}

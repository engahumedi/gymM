import { Request, Response, NextFunction } from 'express';

export function scopeToBranch(req: Request, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'غير مصرح' } });
    return;
  }
  if (req.user.role === 'admin') {
    const qb = req.query.branchId;
    req.effectiveBranchId = qb ? Number(qb) : null;
  } else {
    req.effectiveBranchId = req.user.branchId;
  }
  next();
}

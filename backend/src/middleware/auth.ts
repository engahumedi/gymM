import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

export interface JwtPayload {
  userId: number;
  role: 'admin' | 'receptionist';
  branchId: number | null;
}

declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
      effectiveBranchId?: number | null;
    }
  }
}

export function authenticateJWT(req: Request, res: Response, next: NextFunction): void {
  const token = req.cookies?.accessToken;
  if (!token) {
    res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'غير مصرح' } });
    return;
  }
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET!) as JwtPayload;
    req.user = payload;
    next();
  } catch {
    res.status(401).json({ success: false, error: { code: 'TOKEN_EXPIRED', message: 'انتهت صلاحية الجلسة' } });
  }
}

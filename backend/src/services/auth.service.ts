import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { db } from '../db/index';
import { JwtPayload } from '../middleware/auth';

interface UserRow {
  id: number;
  name: string;
  email: string;
  password_hash: string;
  role: 'admin' | 'receptionist';
  branch_id: number | null;
  is_active: number;
}

export function loginUser(email: string, password: string) {
  const user = db.prepare(
    'SELECT * FROM users WHERE email = ? AND is_active = 1'
  ).get(email) as UserRow | undefined;

  if (!user) throw new Error('بريد إلكتروني أو كلمة مرور غير صحيحة');

  const valid = bcrypt.compareSync(password, user.password_hash);
  if (!valid) throw new Error('بريد إلكتروني أو كلمة مرور غير صحيحة');

  return { tokens: generateTokens(user), user };
}

export function generateTokens(user: { id: number; role: string; branch_id: number | null }) {
  const payload: JwtPayload = {
    userId: user.id,
    role: user.role as 'admin' | 'receptionist',
    branchId: user.branch_id,
  };

  const accessToken = jwt.sign(payload, process.env.JWT_SECRET!, { expiresIn: '15m' });
  const refreshToken = jwt.sign(payload, process.env.REFRESH_TOKEN_SECRET!, { expiresIn: '7d' });

  const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  db.prepare(
    'INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES (?, ?, ?)'
  ).run(user.id, tokenHash, expiresAt);

  return { accessToken, refreshToken };
}

export function refreshTokens(refreshToken: string) {
  let payload: JwtPayload;
  try {
    payload = jwt.verify(refreshToken, process.env.REFRESH_TOKEN_SECRET!) as JwtPayload;
  } catch {
    throw new Error('رمز التحديث غير صالح');
  }

  const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
  const stored = db.prepare(
    "SELECT * FROM refresh_tokens WHERE token_hash = ? AND expires_at > datetime('now')"
  ).get(tokenHash) as { id: number; user_id: number } | undefined;

  if (!stored) throw new Error('رمز التحديث منتهي أو ملغى');

  db.prepare('DELETE FROM refresh_tokens WHERE token_hash = ?').run(tokenHash);

  const user = db.prepare('SELECT * FROM users WHERE id = ? AND is_active = 1').get(payload.userId) as UserRow | undefined;
  if (!user) throw new Error('المستخدم غير موجود');

  return generateTokens(user);
}

export function revokeRefreshToken(refreshToken: string) {
  const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
  db.prepare('DELETE FROM refresh_tokens WHERE token_hash = ?').run(tokenHash);
}

export function revokeAllUserTokens(userId: number) {
  db.prepare('DELETE FROM refresh_tokens WHERE user_id = ?').run(userId);
}

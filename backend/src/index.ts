import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import path from 'path';
import fs from 'fs';
import { initDb } from './db/index';

import authRouter from './routes/auth';
import branchesRouter from './routes/branches';
import membersRouter from './routes/members';
import plansRouter from './routes/plans';
import subscriptionsRouter from './routes/subscriptions';
import attendanceRouter from './routes/attendance';
import reportsRouter from './routes/reports';
import notificationsRouter from './routes/notifications';
import settingsRouter from './routes/settings';

fs.mkdirSync(path.join(process.cwd(), 'uploads', 'members'), { recursive: true });

initDb();

const app = express();
const PORT = process.env.PORT || 3001;
const isProd = process.env.NODE_ENV === 'production';

app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));

// In production the frontend is served from the same origin — no CORS needed.
// In dev, allow the Vite dev server.
if (!isProd) {
  const cors = require('cors');
  app.use(cors({
    origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
    credentials: true,
  }));
}

app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 1000, standardHeaders: true, legacyHeaders: false }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

app.use('/api/v1/auth', authRouter);
app.use('/api/v1/branches', branchesRouter);
app.use('/api/v1/members', membersRouter);
app.use('/api/v1/plans', plansRouter);
app.use('/api/v1/subscriptions', subscriptionsRouter);
app.use('/api/v1/attendance', attendanceRouter);
app.use('/api/v1/reports', reportsRouter);
app.use('/api/v1/notifications', notificationsRouter);
app.use('/api/v1/settings', settingsRouter);

app.get('/api/health', (_req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

// Serve the built React frontend from the same Express server in production.
// The frontend build is placed in ./public by render.yaml's build command.
if (isProd) {
  const frontendDist = path.join(process.cwd(), 'public');
  app.use(express.static(frontendDist));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(frontendDist, 'index.html'));
  });
}

app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: 'خطأ في الخادم' } });
});

app.listen(PORT, () => {
  console.log(`✅ Server running on http://localhost:${PORT}`);
});

export default app;

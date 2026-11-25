import cors from 'cors';
import express from 'express';
import path from 'path';
import { uploadsDir } from './db/database.ts';
import { adminRouter } from './routes/admin.ts';
import { authRouter } from './routes/auth.ts';
import { apiRouter } from './routes/complaints.ts';
import { publicRouter } from './routes/public.ts';

export function createApiApp() {
  const app = express();

  app.use(cors({ origin: true, credentials: true }));
  app.use(express.json({ limit: '12mb' }));
  app.use(express.urlencoded({ extended: true, limit: '12mb' }));

  app.use('/uploads', express.static(uploadsDir));
  app.use('/demo-images', express.static(path.resolve(process.cwd(), 'src', 'assets', 'images')));

  app.use('/api/public', publicRouter);
  app.use('/api/auth', authRouter);
  app.use('/api/admin', adminRouter);
  app.use('/api', apiRouter);

  app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error('API Error:', err.message);
    res.status(400).json({ error: err.message || 'Bad request' });
  });

  return app;
}

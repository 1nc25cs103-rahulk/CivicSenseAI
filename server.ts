import 'dotenv/config';
import express from 'express';
import fs from 'fs';
import http from 'http';
import path from 'path';
import { createApiApp } from './server/app.ts';
import { getDb } from './server/db/database.ts';
import { seedDatabaseIfEmpty } from './server/db/seed.ts';

const PORT = Number(process.env.PORT) || 3000;
const isProd = process.env.NODE_ENV === 'production';

async function bootstrap() {
  getDb();
  const seedInfo = seedDatabaseIfEmpty();
  if (seedInfo.seeded) {
    console.log(`Seeded SQLite database with ${seedInfo.count} Karnataka demo complaints.`);
  }

  const app = createApiApp();
  const httpServer = http.createServer(app);

  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: { server: httpServer },
        watch: process.env.DISABLE_HMR === 'true' ? null : undefined,
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    if (fs.existsSync(distDir)) {
      app.use(express.static(distDir));
      app.get('*', (_req, res) => {
        res.sendFile(path.join(distDir, 'index.html'));
      });
    }
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`CivicSense AI running on http://localhost:${PORT} (${isProd ? 'production' : 'development'})`);
  });
}

bootstrap().catch((err) => {
  console.error('Failed to start CivicSense AI server:', err);
  process.exit(1);
});

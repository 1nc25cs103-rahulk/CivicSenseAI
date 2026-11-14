import 'dotenv/config';
import { createApiApp } from './app.ts';
import { getDb } from './db/database.ts';
import { seedDatabaseIfEmpty } from './db/seed.ts';

const PORT = Number(process.env.PORT) || 3001;

getDb();
seedDatabaseIfEmpty();

const app = createApiApp();

app.listen(PORT, '0.0.0.0', () => {
  console.log(`CivicSense AI Backend API running at http://localhost:${PORT}`);
});

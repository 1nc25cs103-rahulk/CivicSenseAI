import 'dotenv/config';
import { getDb } from './database.ts';
import { seedDatabaseIfEmpty } from './seed.ts';

getDb();
const result = seedDatabaseIfEmpty();
if (result.seeded) {
  console.log(`Database initialized and seeded with ${result.count} demonstration complaints.`);
} else {
  console.log(`Database already contains ${result.count} complaints. Skipping seed.`);
}

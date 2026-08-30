import fs from 'fs';
import path from 'path';
import { getPool } from '../src/config/supabase';

async function migrate() {
  const pool = getPool();
  if (!pool) {
    console.log('DATABASE_URL not set – skipping migrations (using in-memory)');
    return;
  }
  const migrationsDir = path.join(__dirname, '../sql/migrations');
  const files = fs.readdirSync(migrationsDir).sort();
  for (const file of files) {
    if (!file.endsWith('.sql')) continue;
    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');
    console.log(`Running migration ${file}...`);
    try {
      await pool.query(sql);
      console.log(`✓ ${file}`);
    } catch (e: any) {
      console.error(`✗ ${file} failed:`, e.message);
    }
  }
  await pool.end();
  console.log('Migrations complete');
}

migrate().catch((e) => {
  console.error(e);
  process.exit(1);
});

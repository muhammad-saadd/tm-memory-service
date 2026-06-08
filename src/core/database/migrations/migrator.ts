import { Kysely, sql } from 'kysely';
import * as migration001 from './001_initial';

interface Migration {
  up: (db: Kysely<unknown>) => Promise<void>;
}

const migrations: Record<string, Migration> = {
  '001_initial': migration001 as unknown as Migration,
};

async function ensureMigrationsTable(db: Kysely<unknown>): Promise<void> {
  await sql`
    CREATE TABLE IF NOT EXISTS kysely_migrations (
      name VARCHAR(255) PRIMARY KEY,
      timestamp VARCHAR(255) NOT NULL
    )
  `.execute(db);
}

async function getExecutedMigrations(
  db: Kysely<unknown>,
): Promise<Set<string>> {
  const result = await sql<{ name: string }>`SELECT name FROM kysely_migrations`
    .execute(db);
  return new Set(result.rows.map((r) => r.name));
}

async function recordMigration(
  db: Kysely<unknown>,
  name: string,
): Promise<void> {
  await sql`INSERT INTO kysely_migrations (name, timestamp) VALUES (${name}, ${new Date().toISOString()})`.execute(
    db,
  );
}

export async function runMigrations(db: Kysely<unknown>): Promise<void> {
  await ensureMigrationsTable(db);
  const executed = await getExecutedMigrations(db);

  const sortedNames = Object.keys(migrations).sort();

  for (const name of sortedNames) {
    if (executed.has(name)) continue;

    const migration = migrations[name];
    await migration.up(db);
    await recordMigration(db, name);
  }
}

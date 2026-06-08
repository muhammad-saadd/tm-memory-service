import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('transcripts')
    .ifNotExists()
    .addColumn('id', 'serial', (col) => col.primaryKey())
    .addColumn('content', 'jsonb', (col) => col.notNull())
    .addColumn('status', 'text', (col) => col.notNull().defaultTo('pending'))
    .addColumn('created_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .addColumn('processed_at', 'timestamptz')
    .execute();

  await db.schema
    .createTable('processing_jobs')
    .ifNotExists()
    .addColumn('id', 'serial', (col) => col.primaryKey())
    .addColumn('transcript_id', 'integer', (col) =>
      col.notNull().references('transcripts.id'),
    )
    .addColumn('status', 'text', (col) => col.notNull().defaultTo('pending'))
    .addColumn('attempts', 'integer', (col) => col.notNull().defaultTo(0))
    .addColumn('max_attempts', 'integer', (col) => col.notNull().defaultTo(3))
    .addColumn('last_error', 'text')
    .addColumn('created_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .addColumn('updated_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .execute();

  await db.schema
    .createIndex('idx_jobs_status')
    .on('processing_jobs')
    .column('status')
    .execute();

  await db.schema
    .createIndex('idx_jobs_transcript_id')
    .on('processing_jobs')
    .column('transcript_id')
    .unique()
    .execute();
}

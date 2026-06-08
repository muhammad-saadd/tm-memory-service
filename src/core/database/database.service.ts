import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Kysely, PostgresDialect, sql } from 'kysely';
import { Pool } from 'pg';
import { Database } from './database.types';
import { runMigrations } from './migrations/migrator';
import { AppConfig } from '../config/config.schema';

@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DatabaseService.name);
  private readonly kysely: Kysely<Database>;

  constructor(private readonly config: ConfigService<AppConfig, true>) {
    const pool = new Pool({
      host: this.config.get('DB_HOST'),
      port: this.config.get('DB_PORT'),
      user: this.config.get('DB_USER'),
      password: this.config.get('DB_PASSWORD'),
      database: this.config.get('DB_NAME'),
      max: 10,
    });

    this.kysely = new Kysely<Database>({
      dialect: new PostgresDialect({ pool }),
    });
  }

  async onModuleInit(): Promise<void> {
    this.logger.log('Running database migrations...');
    await runMigrations(this.kysely as Kysely<unknown>);
    this.logger.log('Database migrations complete');
  }

  async onModuleDestroy(): Promise<void> {
    await this.kysely.destroy();
  }

  async healthCheck(): Promise<void> {
    await sql`SELECT 1`.execute(this.kysely);
  }

  selectFrom<T extends keyof Database>(table: T) {
    return this.kysely.selectFrom(table);
  }

  insertInto<T extends keyof Database>(table: T) {
    return this.kysely.insertInto(table);
  }

  updateTable<T extends keyof Database>(table: T) {
    return this.kysely.updateTable(table);
  }

  deleteFrom<T extends keyof Database>(table: T) {
    return this.kysely.deleteFrom(table);
  }

  transaction() {
    return this.kysely.transaction();
  }
}

import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { sql } from 'kysely';
import { DatabaseService } from '../../core/database/database.service';
import { ProcessingJob } from '../../core/database/database.types';
import { ConfigService } from '@nestjs/config';
import { AppConfig } from '../../core/config/config.schema';

@Injectable()
export class JobsRepository {
  private readonly logger = new Logger(JobsRepository.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly config: ConfigService<AppConfig, true>,
  ) {}

  async create(transcriptId: number): Promise<ProcessingJob> {
    const now = new Date().toISOString();
    const maxAttempts = this.config.get('PROCESSOR_MAX_ATTEMPTS');

    const result = await this.db
      .insertInto('processing_jobs')
      .values({
        transcript_id: transcriptId,
        status: 'pending',
        attempts: 0,
        max_attempts: maxAttempts,
        created_at: now,
        updated_at: now,
      })
      .returningAll()
      .executeTakeFirst();

    if (!result) {
      throw new InternalServerErrorException(
        `Failed to create processing job for transcript ${transcriptId}`,
      );
    }

    return result as ProcessingJob;
  }

  async findNextPending(maxAttempts: number): Promise<ProcessingJob | null> {
    const result = await this.db
      .selectFrom('processing_jobs')
      .selectAll()
      .where('status', '=', 'pending')
      .where('attempts', '<', maxAttempts)
      .orderBy('created_at', 'asc')
      .limit(1)
      .executeTakeFirst();

    return (result as ProcessingJob) || null;
  }

  async markProcessing(jobId: number): Promise<void> {
    const result = await this.db
      .updateTable('processing_jobs')
      .set({
        status: 'processing',
        attempts: sql`attempts + 1`,
        updated_at: new Date().toISOString(),
      })
      .where('id', '=', jobId)
      .where('status', '=', 'pending')
      .executeTakeFirst();

    if (result.numUpdatedRows === 0n) {
      this.logger.warn(
        `markProcessing: job ${jobId} was not in 'pending' state (may have been picked up by another instance)`,
      );
    }
  }

  async markDone(jobId: number): Promise<void> {
    await this.db
      .updateTable('processing_jobs')
      .set({
        status: 'done',
        updated_at: new Date().toISOString(),
      })
      .where('id', '=', jobId)
      .executeTakeFirst();
  }

  async markFailed(jobId: number, error: string): Promise<void> {
    await this.db
      .updateTable('processing_jobs')
      .set({
        status: 'failed',
        last_error: error,
        updated_at: new Date().toISOString(),
      })
      .where('id', '=', jobId)
      .executeTakeFirst();
  }

  async resetStuckJobs(): Promise<void> {
    const cutoff = new Date(Date.now() - 60_000).toISOString();
    await this.db
      .updateTable('processing_jobs')
      .set({
        status: 'pending',
        updated_at: new Date().toISOString(),
      })
      .where('status', '=', 'processing')
      .where('updated_at', '<', cutoff)
      .execute();
  }
}

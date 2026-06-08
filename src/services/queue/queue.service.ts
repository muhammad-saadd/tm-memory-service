import { Injectable, Logger } from '@nestjs/common';
import { JobsRepository } from './jobs.repository';

@Injectable()
export class QueueService {
  private readonly logger = new Logger(QueueService.name);

  constructor(private readonly jobsRepository: JobsRepository) {}

  async enqueue(transcriptId: number): Promise<void> {
    try {
      await this.jobsRepository.create(transcriptId);
      this.logger.log(`Enqueued job for transcript ${transcriptId}`);
    } catch (err: unknown) {
      const error = err as { code?: string; constraint?: string };
      if (error.code === '23505') {
        this.logger.debug(
          `Job for transcript ${transcriptId} already exists (idempotent)`,
        );
        return;
      }
      throw err;
    }
  }
}

import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { DatabaseService } from '../core/database/database.service';
import { NewTranscript, Transcript } from '../core/database/database.types';

@Injectable()
export class TranscriptsRepository {
  private readonly logger = new Logger(TranscriptsRepository.name);

  constructor(private readonly db: DatabaseService) {}

  async create(data: NewTranscript): Promise<Transcript> {
    const result = await this.db
      .insertInto('transcripts')
      .values(data)
      .returningAll()
      .executeTakeFirst();

    if (!result) {
      throw new InternalServerErrorException('Failed to create transcript');
    }

    return result as Transcript;
  }

  async findById(id: number): Promise<Transcript | null> {
    const result = await this.db
      .selectFrom('transcripts')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();

    return (result as Transcript) || null;
  }

  async updateStatus(
    id: number,
    status: Transcript['status'],
    processedAt?: string,
  ): Promise<void> {
    const result = await this.db
      .updateTable('transcripts')
      .set({
        status,
        ...(processedAt ? { processed_at: processedAt } : {}),
      })
      .where('id', '=', id)
      .executeTakeFirst();

    if (result.numUpdatedRows === 0n) {
      this.logger.warn(
        `updateStatus: transcript ${id} not found (may have been deleted)`,
      );
    }
  }
}

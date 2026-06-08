import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { TranscriptsRepository } from './transcripts.repository';
import { QueueService } from '../services/queue/queue.service';
import { CreateTranscriptDto } from './dto/create-transcript.dto';
import { TranscriptResponseDto } from './dto/transcript-response.dto';

@Injectable()
export class TranscriptsService {
  private readonly logger = new Logger(TranscriptsService.name);

  constructor(
    private readonly repository: TranscriptsRepository,
    private readonly queueService: QueueService,
  ) {}

  async create(
    dto: CreateTranscriptDto,
  ): Promise<{ id: number; status: string; createdAt: string }> {
    const now = new Date().toISOString();
    const transcript = await this.repository.create({
      content: JSON.stringify(dto.content),
      status: 'pending',
      created_at: now,
    });

    await this.queueService.enqueue(transcript.id);

    this.logger.log(`Transcript ${transcript.id} created`);

    return {
      id: transcript.id,
      status: transcript.status,
      createdAt: transcript.created_at,
    };
  }

  async findById(id: number): Promise<TranscriptResponseDto> {
    const transcript = await this.repository.findById(id);
    if (!transcript) {
      throw new NotFoundException(`Transcript ${id} not found`);
    }

    return {
      id: transcript.id,
      content: transcript.content as TranscriptResponseDto['content'],
      status: transcript.status,
      createdAt: transcript.created_at,
      processedAt: transcript.processed_at,
    };
  }
}

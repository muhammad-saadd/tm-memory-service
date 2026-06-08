import { Module } from '@nestjs/common';
import { TranscriptsController } from './transcripts.controller';
import { TranscriptsService } from './transcripts.service';
import { TranscriptsRepository } from './transcripts.repository';

@Module({
  controllers: [TranscriptsController],
  providers: [TranscriptsService, TranscriptsRepository],
  exports: [TranscriptsService, TranscriptsRepository],
})
export class TranscriptsModule {}

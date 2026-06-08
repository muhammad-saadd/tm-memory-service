import { Module } from '@nestjs/common';
import { ProcessorService } from './processor.service';
import { TranscriptsModule } from '../../transcripts/transcripts.module';
import { QueueModule } from '../queue/queue.module';

@Module({
  imports: [TranscriptsModule, QueueModule],
  providers: [ProcessorService],
  exports: [ProcessorService],
})
export class ProcessorModule {}

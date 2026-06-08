import { Module, Global } from '@nestjs/common';
import { QueueService } from './queue.service';
import { JobsRepository } from './jobs.repository';

@Global()
@Module({
  providers: [JobsRepository, QueueService],
  exports: [QueueService, JobsRepository],
})
export class QueueModule {}

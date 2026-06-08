import { Module } from '@nestjs/common';
import { ConfigModule } from './core/config/config.module';
import { DatabaseModule } from './core/database/database.module';
import { StorageModule } from './services/storage/storage.module';
import { LLMModule } from './services/llm/llm.module';
import { QueueModule } from './services/queue/queue.module';
import { ProcessorModule } from './services/processor/processor.module';
import { SystemModule } from './services/system/system.module';
import { TranscriptsModule } from './transcripts/transcripts.module';
import { MemoriesModule } from './memories/memories.module';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';

@Module({
  imports: [
    ThrottlerModule.forRoot([
      { name: 'default', ttl: 60000, limit: 30 },
    ]),
    ConfigModule,
    DatabaseModule,
    StorageModule,
    LLMModule,
    QueueModule,
    ProcessorModule,
    SystemModule,
    TranscriptsModule,
    MemoriesModule,
  ],
  providers: [ThrottlerGuard],
})
export class AppModule {}

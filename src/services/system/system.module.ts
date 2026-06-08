import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { MetricsController } from './metrics.controller';
import { ProcessorModule } from '../processor/processor.module';

@Module({
  imports: [ProcessorModule],
  controllers: [HealthController, MetricsController],
})
export class SystemModule {}

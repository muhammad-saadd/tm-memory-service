import { Controller, Get } from '@nestjs/common';
import { ProcessorService } from '../processor/processor.service';

@Controller()
export class MetricsController {
  constructor(private readonly processorService: ProcessorService) {}

  @Get('metrics')
  metrics() {
    return {
      processor: this.processorService.getMetrics(),
      timestamp: new Date().toISOString(),
    };
  }
}

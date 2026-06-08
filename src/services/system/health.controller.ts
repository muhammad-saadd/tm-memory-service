import { Controller, Get, Logger } from '@nestjs/common';
import { Public } from '../../core/common/decorators/public.decorator';
import { DatabaseService } from '../../core/database/database.service';
import { StorageService } from '../storage/storage.service';
import { LLMService } from '../llm/llm.service';

interface HealthCheckResult {
  status: 'ok' | 'error';
  latency: number;
  error?: string;
}

@Controller()
export class HealthController {
  private readonly logger = new Logger(HealthController.name);

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly storageService: StorageService,
    private readonly llmService: LLMService,
  ) {}

  @Public()
  @Get('health')
  async health() {
    const checks: Record<string, HealthCheckResult> = {};

    checks.database = await this.timeCheck(
      'database',
      () => this.databaseService.healthCheck(),
    );

    checks.storage = await this.timeCheck(
      'storage',
      () => this.storageService.healthCheck(),
    );

    checks.llm = await this.timeCheck(
      'llm',
      () => this.llmService.healthCheck(),
    );

    const allOk = Object.values(checks).every((c) => c.status === 'ok');
    const degraded = Object.values(checks).some((c) => c.status === 'error');

    return {
      status: allOk ? 'ok' : degraded ? 'degraded' : 'error',
      timestamp: new Date().toISOString(),
      checks,
    };
  }

  private async timeCheck(
    name: string,
    fn: () => Promise<void>,
  ): Promise<HealthCheckResult> {
    const start = Date.now();
    try {
      await fn();
      return { status: 'ok', latency: Date.now() - start };
    } catch (err: unknown) {
      const error = err instanceof Error ? err.message : String(err);
      this.logger.error(`Health check failed for ${name}: ${error}`);
      return { status: 'error', latency: Date.now() - start, error };
    }
  }
}

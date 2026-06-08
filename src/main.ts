import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './core/common/filters/http-exception.filter';
import { ResponseInterceptor } from './core/common/interceptors/response.interceptor';
import { LoggingInterceptor } from './core/common/interceptors/logging.interceptor';
import { RequestIdInterceptor } from './core/common/interceptors/request-id.interceptor';
import { ApiKeyGuard } from './core/guards/api-key.guard';
import { ThrottlerGuard } from '@nestjs/throttler';
import { Logger } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AppConfig } from './core/config/config.schema';

async function bootstrap() {
  const logger = new Logger('Bootstrap');

  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService<AppConfig, true>);

  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalInterceptors(
    new RequestIdInterceptor(),
    new LoggingInterceptor(),
    new ResponseInterceptor(),
  );
  app.useGlobalGuards(
    new ApiKeyGuard(config, app.get(Reflector)),
    app.get(ThrottlerGuard),
  );

  app.enableShutdownHooks();

  const port = config.get('PORT');
  await app.listen(port);
  logger.log(`Application listening on port ${port}`);
}

bootstrap().catch((err: unknown) => {
  const logger = new Logger('Bootstrap');
  const message = err instanceof Error ? err.message : String(err);
  logger.error(`Application failed to start: ${message}`);
  process.exit(1);
});

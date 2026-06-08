import { Module, Global } from '@nestjs/common';
import { ConfigModule as NestConfigModule } from '@nestjs/config';
import { configSchema } from './config.schema';

@Global()
@Module({
  imports: [
    NestConfigModule.forRoot({
      validate: (config) => configSchema.parse(config),
      isGlobal: true,
    }),
  ],
})
export class ConfigModule {}

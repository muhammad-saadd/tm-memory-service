import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AppConfig } from '../config/config.schema';
import { IS_PUBLIC_KEY } from '../common/decorators/public.decorator';
import { Request } from 'express';

@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(
    private readonly config: ConfigService<AppConfig, true>,
    private readonly reflector: Reflector,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<Request>();
    const apiKey = request.headers['x-api-key'];

    if (!apiKey || apiKey !== this.config.get('API_KEY')) {
      throw new UnauthorizedException('Invalid or missing API key');
    }

    return true;
  }
}

import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable, map } from 'rxjs';

@Injectable()
export class ResponseInterceptor implements NestInterceptor {
  private readonly logger = new Logger(ResponseInterceptor.name);

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest();
    const { method, url } = request;

    return next.handle().pipe(
      map((responseData) => {
        if (
          responseData &&
          typeof responseData === 'object' &&
          'statusCode' in responseData
        ) {
          return responseData;
        }

        const statusCode = context.switchToHttp().getResponse().statusCode;

        this.logger.debug(`${method} ${url} → ${statusCode}`);

        return {
          statusCode,
          message: null,
          error: null,
          data: responseData,
        };
      }),
    );
  }
}

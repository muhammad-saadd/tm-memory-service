import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable, map } from 'rxjs';
import { randomUUID } from 'crypto';

@Injectable()
export class RequestIdInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest();
    const response = context.switchToHttp().getResponse();

    const requestId = (request.headers['x-request-id'] as string) || randomUUID();
    response.setHeader('x-request-id', requestId);

    return next.handle().pipe(
      map((responseData) => {
        if (
          responseData &&
          typeof responseData === 'object' &&
          'statusCode' in responseData
        ) {
          return { ...responseData, requestId };
        }

        const statusCode = response.statusCode;

        return {
          statusCode,
          message: null,
          error: null,
          requestId,
          data: responseData,
        };
      }),
    );
  }
}

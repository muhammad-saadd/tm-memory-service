import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();

      if (typeof body === 'string') {
        response.status(status).json({
          statusCode: status,
          message: body,
          error: body,
          data: null,
        });
        return;
      }

      const bodyObj = body as Record<string, unknown>;
      const errors = bodyObj.errors;

      response.status(status).json({
        statusCode: status,
        message: typeof bodyObj.message === 'string' ? bodyObj.message : null,
        error: typeof bodyObj.error === 'string' ? bodyObj.error : null,
        data: null,
        ...(Array.isArray(errors) ? { errors } : {}),
      });
      return;
    }

    this.logger.error('Unhandled exception', exception as Error);
    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      statusCode: 500,
      message: 'Internal server error',
      error: 'Internal server error',
      data: null,
    });
  }
}

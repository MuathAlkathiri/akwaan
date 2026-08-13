import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpStatus,
} from '@nestjs/common';
import { Response } from 'express';
import { LiveSessionDomainError } from '../domain/live-session.errors';

const statuses: Record<string, HttpStatus> = {
  SESSION_NOT_FOUND: HttpStatus.NOT_FOUND,
  SESSION_FORBIDDEN: HttpStatus.FORBIDDEN,
  STALE_REVISION: HttpStatus.CONFLICT,
  CONCURRENT_UPDATE: HttpStatus.CONFLICT,
  SESSION_EXPIRED: HttpStatus.GONE,
  JOIN_ACCESS_UNAVAILABLE: HttpStatus.NOT_FOUND,
  JOIN_ACCESS_NOT_FOUND: HttpStatus.NOT_FOUND,
  JOIN_ACCESS_EXPIRED: HttpStatus.GONE,
  JOIN_ACCESS_REVOKED: HttpStatus.GONE,
  SESSION_NOT_JOINABLE: HttpStatus.CONFLICT,
  SESSION_FULL: HttpStatus.CONFLICT,
  TEAM_FULL: HttpStatus.CONFLICT,
  DISPLAY_NAME_TAKEN: HttpStatus.CONFLICT,
  JOIN_RATE_EXCEEDED: HttpStatus.TOO_MANY_REQUESTS,
};

@Catch(LiveSessionDomainError)
export class LiveSessionHttpExceptionFilter implements ExceptionFilter {
  catch(exception: LiveSessionDomainError, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const status = statuses[exception.code] ?? HttpStatus.BAD_REQUEST;
    response.status(status).json({
      statusCode: status,
      code: exception.code,
      message: exception.message,
      timestamp: new Date().toISOString(),
    });
  }
}

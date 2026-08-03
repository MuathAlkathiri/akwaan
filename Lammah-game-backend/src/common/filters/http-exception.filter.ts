import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Response } from 'express';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';
    let errors: unknown = null;
    let code: string | undefined;
    let errorLabel: string | undefined;
    let structuredDetails: Record<string, unknown> = {};

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const rawResponse = exception.getResponse();
      const exceptionResponse =
        typeof rawResponse === 'object' && rawResponse !== null
          ? (rawResponse as Record<string, unknown>)
          : null;
      const responseMessage = exceptionResponse?.message;
      message = Array.isArray(responseMessage)
        ? responseMessage.map(String).join(', ')
        : typeof responseMessage === 'string'
          ? responseMessage
          : exception.message;
      errors = exceptionResponse?.errors ?? null;
      code =
        typeof exceptionResponse?.code === 'string'
          ? exceptionResponse.code
          : undefined;
      errorLabel =
        typeof exceptionResponse?.error === 'string'
          ? exceptionResponse.error
          : undefined;
      if (exceptionResponse) {
        const allowedFields = [
          'issueCodes',
          // World Content validation returns every failing rule at once so the
          // admin UI can show them together instead of one per round-trip.
          'issues',
          'meta',
          'sourceDiagnostics',
          'sourceSummary',
          'candidateDiagnostics',
          'details',
        ] as const;
        structuredDetails = Object.fromEntries(
          allowedFields.flatMap((key) =>
            key in exceptionResponse ? [[key, exceptionResponse[key]]] : [],
          ),
        );
      }
    } else if (exception instanceof Error) {
      // Unexpected infrastructure errors may contain commands, credentials,
      // provider output, or local paths. Keep those details server-side.
      message = 'Internal server error';
    }

    response.status(status).json({
      statusCode: status,
      ...(errorLabel && { error: errorLabel }),
      message,
      ...structuredDetails,
      timestamp: new Date().toISOString(),
      path: request.url,
      ...(code && { code }),
      ...(errors !== null ? { errors } : {}),
    });
  }
}

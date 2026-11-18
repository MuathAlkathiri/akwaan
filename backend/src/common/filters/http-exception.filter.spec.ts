import type { ArgumentsHost } from '@nestjs/common';
import { BadRequestException } from '@nestjs/common';
import { AllExceptionsFilter } from './http-exception.filter';

describe('AllExceptionsFilter structured errors', () => {
  it('preserves allowlisted diagnostics and drops everything else', () => {
    const json = jest.fn();
    const status = jest.fn(() => ({ json }));
    const host = {
      switchToHttp: () => ({
        getResponse: () => ({ status }),
        getRequest: () => ({ url: '/admin/worlds' }),
      }),
    } as unknown as ArgumentsHost;

    new AllExceptionsFilter().catch(
      new BadRequestException({
        error: 'Bad Request',
        message: 'Validation failed',
        issueCodes: ['SCOPE_REQUIRED'],
        meta: { attempted: 1 },
        internalTrace: 'must not leak',
      }),
      host,
    );

    expect(status).toHaveBeenCalledWith(400);
    const body = json.mock.calls[0][0] as Record<string, unknown>;
    expect(body).toEqual(
      expect.objectContaining({
        statusCode: 400,
        error: 'Bad Request',
        message: 'Validation failed',
        issueCodes: ['SCOPE_REQUIRED'],
        meta: { attempted: 1 },
      }),
    );
    expect(body).not.toHaveProperty('internalTrace');
  });
});

describe('AllExceptionsFilter game validation errors', () => {
  it('preserves bounded typed gameplay validation details', () => {
    const json = jest.fn();
    const status = jest.fn(() => ({ json }));
    const host = {
      switchToHttp: () => ({
        getResponse: () => ({ status }),
        getRequest: () => ({ url: '/games' }),
      }),
    } as unknown as ArgumentsHost;
    const details = [
      {
        code: 'STANDARD_MISSING_200_QUESTIONS',
        message: 'Missing questions',
        categoryId: 'category-1',
        gameplayMode: 'STANDARD',
        requiredCounts: { '200': 2 },
        actualCounts: { '200': 1 },
      },
    ];
    new AllExceptionsFilter().catch(
      new BadRequestException({
        error: 'Bad Request',
        code: details[0].code,
        message: details[0].message,
        issueCodes: [details[0].code],
        details,
      }),
      host,
    );
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 400,
        error: 'Bad Request',
        code: 'STANDARD_MISSING_200_QUESTIONS',
        issueCodes: ['STANDARD_MISSING_200_QUESTIONS'],
        details,
      }),
    );
  });
});

import { BadRequestException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validateSync, ValidationError } from 'class-validator';

/**
 * Flattens class-validator errors into readable strings, the way Nest's own
 * ValidationPipe does. Handing the raw error objects to BadRequestException made
 * clients render "[object Object]" instead of the reason.
 */
function describeValidationErrors(
  errors: ValidationError[],
  parentPath = '',
): string[] {
  return errors.flatMap((error) => {
    const path = parentPath
      ? `${parentPath}.${error.property}`
      : error.property;
    const constraints = Object.values(error.constraints ?? {}).map(
      (message) => `${path}: ${message}`,
    );
    return [
      ...constraints,
      ...describeValidationErrors(error.children ?? [], path),
    ];
  });
}

export function parseMultipartJsonBody<T extends object>(
  body: Record<string, unknown>,
  field: string,
  DtoClass: new () => T,
): T {
  const raw = body[field];
  let payload: unknown = body;
  if (raw !== undefined) {
    if (typeof raw !== 'string')
      throw new BadRequestException(`${field} must be a JSON string`);
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed))
        payload = parsed;
    } catch {
      // A normal application/json DTO may legitimately contain a string whose
      // name matches the multipart envelope field (for example "question").
      if (Object.keys(body).length === 1)
        throw new BadRequestException(`${field} must be valid JSON`);
    }
  }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload))
    throw new BadRequestException(`${field} payload must be an object`);
  const dto = plainToInstance(DtoClass, payload);
  const errors = validateSync(dto, {
    whitelist: true,
    forbidNonWhitelisted: true,
  });
  if (errors.length) {
    throw new BadRequestException(describeValidationErrors(errors));
  }
  return dto;
}

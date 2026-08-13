import { readFileSync } from 'fs';
import { resolve } from 'path';

type Json = Record<string, unknown>;
const file = process.env.OPENAPI_OUTPUT
  ? resolve(process.env.OPENAPI_OUTPUT)
  : resolve(__dirname, '../openapi/openapi.json');
const document = JSON.parse(readFileSync(file, 'utf8')) as Json;
const failures: string[] = [];
const operationIds = new Set<string>();
const schemas = ((document.components as Json | undefined)?.schemas ??
  {}) as Json;

if (
  typeof document.openapi !== 'string' ||
  !document.openapi.startsWith('3.')
) {
  failures.push('Document must use OpenAPI 3.x');
}

function inspect(value: unknown, location: string): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) => inspect(item, `${location}[${index}]`));
    return;
  }
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value as Json)) {
    if (key === '$ref' && typeof child === 'string') {
      const prefix = '#/components/schemas/';
      if (
        child.startsWith(prefix) &&
        !(child.slice(prefix.length) in schemas)
      ) {
        failures.push(`Unresolved schema reference ${child} at ${location}`);
      }
    }
    inspect(child, `${location}.${key}`);
  }
}

const paths = (document.paths ?? {}) as Json;
for (const [path, pathItem] of Object.entries(paths)) {
  const methods = pathItem as Json;
  for (const [method, operationValue] of Object.entries(methods)) {
    if (!['get', 'post', 'put', 'patch', 'delete'].includes(method)) continue;
    const operation = operationValue as Json;
    const operationId = operation.operationId;
    if (typeof operationId !== 'string' || !operationId) {
      failures.push(`${method.toUpperCase()} ${path} has no operationId`);
    } else if (operationIds.has(operationId)) {
      failures.push(`Duplicate operationId: ${operationId}`);
    } else {
      operationIds.add(operationId);
    }
    if (
      !operation.responses ||
      Object.keys(operation.responses as Json).length === 0
    ) {
      failures.push(`${method.toUpperCase()} ${path} has no responses`);
    }
    for (const [status, responseValue] of Object.entries(
      (operation.responses ?? {}) as Json,
    )) {
      if ('schema' in (responseValue as Json)) {
        failures.push(
          `${method.toUpperCase()} ${path} response ${status} uses invalid top-level schema`,
        );
      }
      if (!status.startsWith('2') || status === '204') continue;
      if (!(responseValue as Json).content) {
        failures.push(
          `${method.toUpperCase()} ${path} success response ${status} has no schema`,
        );
      }
    }
  }
}
inspect(document, 'document');

for (const [name, schemaValue] of Object.entries(schemas)) {
  const schema = schemaValue as Json;
  if (!schema.properties && !schema.allOf && !schema.oneOf && !schema.enum) {
    failures.push(`Schema ${name} is an untyped empty object`);
  }
}

if (failures.length) {
  throw new Error(`OpenAPI validation failed:\n- ${failures.join('\n- ')}`);
}
process.stdout.write(
  `OpenAPI valid: ${operationIds.size} unique operations, ${Object.keys(schemas).length} schemas\n`,
);

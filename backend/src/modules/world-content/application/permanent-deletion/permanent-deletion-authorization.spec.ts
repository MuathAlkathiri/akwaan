import { ConfigService } from '@nestjs/config';
import {
  permanentDeletionAdminIds,
  WorldContentDeletionService,
} from './world-content-deletion.service';

const config = (value?: string) =>
  ({ get: () => value }) as unknown as ConfigService;

/** Only `mayExecute` is under test; it reads nothing but the config. */
const service = (value?: string) =>
  new (
    WorldContentDeletionService as unknown as new (
      ...args: unknown[]
    ) => WorldContentDeletionService
  )(...Array.from({ length: 12 }, () => undefined), config(value));

const admin = { id: 'admin-1', email: 'a@example.invalid', role: 'admin' };

describe('permanent deletion authorization', () => {
  it('is fail-closed: nobody may permanently delete when unset or blank', () => {
    expect(permanentDeletionAdminIds(config(undefined)).size).toBe(0);
    expect(permanentDeletionAdminIds(config(' , ')).size).toBe(0);
    expect(service(undefined).mayExecute('permanent_delete', admin)).toBe(
      false,
    );
  });

  it('admits only listed operator ids', () => {
    const configured = service(' admin-1 , admin-2 ');
    expect(configured.mayExecute('permanent_delete', admin)).toBe(true);
    expect(
      configured.mayExecute('permanent_delete', { ...admin, id: 'admin-3' }),
    ).toBe(false);
  });

  it('keeps detach (binding only, content untouched) an ordinary Admin action', () => {
    expect(service(undefined).mayExecute('detach', admin)).toBe(true);
  });
});

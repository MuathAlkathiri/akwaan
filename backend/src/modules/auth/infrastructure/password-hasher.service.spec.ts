import { PasswordHasherService } from './password-hasher.service';

describe('PasswordHasherService', () => {
  const service = new PasswordHasherService();

  it('creates compatible bcrypt hashes and compares credentials', async () => {
    const hash = await service.hash('correct-password');
    expect(hash).not.toContain('correct-password');
    await expect(service.compare('correct-password', hash)).resolves.toBe(true);
    await expect(service.compare('wrong-password', hash)).resolves.toBe(false);
  });
});

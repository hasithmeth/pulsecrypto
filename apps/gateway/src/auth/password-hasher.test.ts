import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from './password-hasher';

describe('password hashing', () => {
  it('verifies the right password and rejects a wrong one', async () => {
    const hash = await hashPassword('correct horse battery');

    await expect(verifyPassword('correct horse battery', hash)).resolves.toBe(true);
    await expect(verifyPassword('correct horse batterz', hash)).resolves.toBe(false);
  });

  it('salts every hash, so equal passwords are stored differently', async () => {
    const [first, second] = await Promise.all([
      hashPassword('same-password'),
      hashPassword('same-password'),
    ]);

    expect(first).not.toBe(second);
    expect(first.startsWith('scrypt$16384$8$1$')).toBe(true);
    expect(first).not.toContain('same-password');
  });

  it('treats a malformed stored hash as a failed match rather than throwing', async () => {
    await expect(verifyPassword('anything', 'not-a-hash')).resolves.toBe(false);
  });
});

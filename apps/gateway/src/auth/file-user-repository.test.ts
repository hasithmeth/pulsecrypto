import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DEFAULT_USER_SETTINGS } from '@pulsecrypto/contracts';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FileUserRepository } from './file-user-repository';
import { EmailTakenError, type NewUser } from './user-repository';

const newUser = (email: string): NewUser => ({
  email,
  displayName: 'Trader',
  passwordHash: 'hash',
  settings: DEFAULT_USER_SETTINGS,
});

let directory: string;
let filePath: string;

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'pulsecrypto-users-'));
  filePath = join(directory, 'nested', 'users.json');
});

afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

describe('FileUserRepository', () => {
  it('starts empty when no data file exists yet', async () => {
    const repository = await FileUserRepository.open(filePath);
    await expect(repository.findByEmail('a@b.co')).resolves.toBeUndefined();
  });

  it('assigns ids and survives a restart', async () => {
    const first = await FileUserRepository.open(filePath);
    const created = await first.create(newUser('a@b.co'));
    expect(created.publicId).toMatch(/^\d{6}$/);

    const reopened = await FileUserRepository.open(filePath);

    await expect(reopened.findById(created.id)).resolves.toEqual(created);
    await expect(reopened.findByEmail('a@b.co')).resolves.toEqual(created);
  });

  it('refuses a second account for the same email', async () => {
    const repository = await FileUserRepository.open(filePath);
    await repository.create(newUser('a@b.co'));

    await expect(repository.create(newUser('a@b.co'))).rejects.toBeInstanceOf(EmailTakenError);
  });

  it("keeps each user's settings separate", async () => {
    const repository = await FileUserRepository.open(filePath);
    const alice = await repository.create(newUser('alice@b.co'));
    const bob = await repository.create(newUser('bob@b.co'));

    await repository.updateSettings(alice.id, {
      ...DEFAULT_USER_SETTINGS,
      favourites: ['ETHUSDT'],
    });

    const reopened = await FileUserRepository.open(filePath);
    expect((await reopened.findById(alice.id))?.settings.favourites).toEqual(['ETHUSDT']);
    expect((await reopened.findById(bob.id))?.settings.favourites).toEqual([]);
  });

  it('serialises concurrent writes without losing any', async () => {
    const repository = await FileUserRepository.open(filePath);

    await Promise.all(
      Array.from({ length: 20 }, (_, index) => repository.create(newUser(`u${index}@b.co`))),
    );

    const stored = JSON.parse(await readFile(filePath, 'utf8')) as { users: unknown[] };
    expect(stored.users).toHaveLength(20);
  });

  it('returns undefined when updating an unknown user', async () => {
    const repository = await FileUserRepository.open(filePath);
    await expect(
      repository.updateSettings('missing', DEFAULT_USER_SETTINGS),
    ).resolves.toBeUndefined();
  });
});

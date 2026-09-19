import { randomInt, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { UserSettings } from '@pulsecrypto/contracts';
import {
  EmailTakenError,
  type NewUser,
  type StoredUser,
  type UserRepository,
} from './user-repository';

interface DataFile {
  readonly version: 1;
  readonly users: StoredUser[];
}

const PUBLIC_ID_RANGE = [100_000, 1_000_000] as const;

/**
 * A single JSON document, held in memory and rewritten on change. Writes go to
 * a temp file that is renamed over the original, so a crash mid-write leaves
 * the previous file intact, and they are chained so two requests cannot
 * interleave. Adequate for a local gateway; the port lets a database replace it.
 */
export class FileUserRepository implements UserRepository {
  private readonly byId = new Map<string, StoredUser>();
  private readonly byEmail = new Map<string, StoredUser>();
  private readonly publicIds = new Set<string>();
  private pendingWrite: Promise<void> = Promise.resolve();

  private constructor(private readonly filePath: string) {}

  static async open(filePath: string): Promise<FileUserRepository> {
    const repository = new FileUserRepository(filePath);
    await mkdir(dirname(filePath), { recursive: true });
    try {
      const data = JSON.parse(await readFile(filePath, 'utf8')) as DataFile;
      for (const user of data.users) repository.index(user);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    return repository;
  }

  findById(id: string): Promise<StoredUser | undefined> {
    return Promise.resolve(this.byId.get(id));
  }

  findByEmail(email: string): Promise<StoredUser | undefined> {
    return Promise.resolve(this.byEmail.get(email));
  }

  async create(user: NewUser): Promise<StoredUser> {
    if (this.byEmail.has(user.email)) throw new EmailTakenError(user.email);
    const stored: StoredUser = {
      ...user,
      id: randomUUID(),
      publicId: this.nextPublicId(),
      createdAt: Date.now(),
    };
    this.index(stored);
    await this.persist();
    return stored;
  }

  async updateSettings(id: string, settings: UserSettings): Promise<StoredUser | undefined> {
    const existing = this.byId.get(id);
    if (!existing) return undefined;
    const updated = { ...existing, settings };
    this.index(updated);
    await this.persist();
    return updated;
  }

  private index(user: StoredUser): void {
    this.byId.set(user.id, user);
    this.byEmail.set(user.email, user);
    this.publicIds.add(user.publicId);
  }

  private nextPublicId(): string {
    for (;;) {
      const candidate = String(randomInt(...PUBLIC_ID_RANGE));
      if (!this.publicIds.has(candidate)) return candidate;
    }
  }

  private persist(): Promise<void> {
    const write = async (): Promise<void> => {
      const data: DataFile = { version: 1, users: [...this.byId.values()] };
      const tempPath = `${this.filePath}.${process.pid}.tmp`;
      await writeFile(tempPath, JSON.stringify(data, null, 2), { mode: 0o600 });
      await rename(tempPath, this.filePath);
    };
    this.pendingWrite = this.pendingWrite.then(write, write);
    return this.pendingWrite;
  }
}

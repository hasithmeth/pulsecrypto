import type { UserSettings } from '@pulsecrypto/contracts';
import {
  EmailTakenError,
  type NewUser,
  type StoredUser,
  type UserRepository,
} from '../auth/user-repository';

export class InMemoryUserRepository implements UserRepository {
  private readonly users = new Map<string, StoredUser>();

  findById(id: string): Promise<StoredUser | undefined> {
    return Promise.resolve(this.users.get(id));
  }

  findByEmail(email: string): Promise<StoredUser | undefined> {
    return Promise.resolve([...this.users.values()].find((user) => user.email === email));
  }

  async create(user: NewUser): Promise<StoredUser> {
    if (await this.findByEmail(user.email)) throw new EmailTakenError(user.email);
    const id = `user-${this.users.size + 1}`;
    const stored = { ...user, id, publicId: String(100_000 + this.users.size), createdAt: 0 };
    this.users.set(id, stored);
    return stored;
  }

  updateSettings(id: string, settings: UserSettings): Promise<StoredUser | undefined> {
    const existing = this.users.get(id);
    if (!existing) return Promise.resolve(undefined);
    const updated = { ...existing, settings };
    this.users.set(id, updated);
    return Promise.resolve(updated);
  }

  remove(id: string): void {
    this.users.delete(id);
  }
}

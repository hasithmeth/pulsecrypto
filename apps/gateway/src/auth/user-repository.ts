import type { UserSettings } from '@pulsecrypto/contracts';

export interface StoredUser {
  readonly id: string;
  readonly publicId: string;
  readonly email: string;
  readonly displayName: string;
  readonly passwordHash: string;
  readonly settings: UserSettings;
  readonly createdAt: number;
}

export type NewUser = Omit<StoredUser, 'id' | 'publicId' | 'createdAt'>;

export class EmailTakenError extends Error {
  override readonly name = 'EmailTakenError';
}

/** Persistence port. The service layer never learns where users live. */
export interface UserRepository {
  findById(id: string): Promise<StoredUser | undefined>;
  findByEmail(email: string): Promise<StoredUser | undefined>;
  /** Rejects with EmailTakenError when the email is already registered. */
  create(user: NewUser): Promise<StoredUser>;
  updateSettings(id: string, settings: UserSettings): Promise<StoredUser | undefined>;
}

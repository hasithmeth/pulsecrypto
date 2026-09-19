import {
  DEFAULT_USER_SETTINGS,
  type LoginRequest,
  type SignupRequest,
  type User,
  type UserSettings,
} from '@pulsecrypto/contracts';
import { hashPassword, verifyPassword } from './password-hasher';
import type { StoredUser, UserRepository } from './user-repository';

export class InvalidCredentialsError extends Error {
  override readonly name = 'InvalidCredentialsError';
}

export const toPublicUser = ({ id, publicId, email, displayName }: StoredUser): User => ({
  id,
  publicId,
  email,
  displayName,
});

export class AuthService {
  private decoyHash: Promise<string> | undefined;

  constructor(private readonly users: UserRepository) {}

  async signup({ email, password, displayName }: SignupRequest): Promise<StoredUser> {
    return this.users.create({
      email,
      displayName,
      passwordHash: await hashPassword(password),
      settings: DEFAULT_USER_SETTINGS,
    });
  }

  /**
   * An unknown email still pays for a hash comparison against a decoy, so
   * response time does not reveal which addresses are registered.
   */
  async login({ email, password }: LoginRequest): Promise<StoredUser> {
    const user = await this.users.findByEmail(email);
    this.decoyHash ??= hashPassword('decoy-password');
    const matches = await verifyPassword(password, user?.passwordHash ?? (await this.decoyHash));
    if (!user || !matches) throw new InvalidCredentialsError();
    return user;
  }

  findUser(id: string): Promise<StoredUser | undefined> {
    return this.users.findById(id);
  }

  saveSettings(id: string, settings: UserSettings): Promise<StoredUser | undefined> {
    return this.users.updateSettings(id, settings);
  }
}

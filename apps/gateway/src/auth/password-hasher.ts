import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from 'node:crypto';

const COST = 16_384;
const BLOCK_SIZE = 8;
const PARALLELISM = 1;
const KEY_LENGTH = 64;
const SALT_LENGTH = 16;

const derive = (
  password: string,
  salt: Buffer,
  keyLength: number,
  options: ScryptOptions,
): Promise<Buffer> =>
  new Promise((resolve, reject) => {
    scrypt(password, salt, keyLength, options, (error, key) => {
      if (error) reject(error);
      else resolve(key);
    });
  });

/** Encoded as `scrypt$N$r$p$salt$hash`, so parameters can be raised later without breaking old hashes. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH);
  const key = await derive(password, salt, KEY_LENGTH, { N: COST, r: BLOCK_SIZE, p: PARALLELISM });
  return [
    'scrypt',
    COST,
    BLOCK_SIZE,
    PARALLELISM,
    salt.toString('base64'),
    key.toString('base64'),
  ].join('$');
}

export async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  const [scheme, cost, blockSize, parallelism, salt, hash] = encoded.split('$');
  if (scheme !== 'scrypt' || !cost || !blockSize || !parallelism || !salt || !hash) return false;

  const expected = Buffer.from(hash, 'base64');
  const actual = await derive(password, Buffer.from(salt, 'base64'), expected.length, {
    N: Number(cost),
    r: Number(blockSize),
    p: Number(parallelism),
  });
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

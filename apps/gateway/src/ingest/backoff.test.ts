import { describe, expect, it } from 'vitest';
import { createBackoff } from './backoff';

describe('createBackoff', () => {
  it('doubles the ceiling per attempt up to the maximum', () => {
    const backoff = createBackoff({ baseMs: 500, maxMs: 4_000, random: () => 1 });
    expect([
      backoff.next(),
      backoff.next(),
      backoff.next(),
      backoff.next(),
      backoff.next(),
    ]).toEqual([500, 1_000, 2_000, 4_000, 4_000]);
  });

  it('applies full jitter below the ceiling', () => {
    const backoff = createBackoff({ baseMs: 1_000, maxMs: 10_000, random: () => 0.25 });
    expect(backoff.next()).toBe(250);
  });

  it('starts over after a reset', () => {
    const backoff = createBackoff({ baseMs: 500, maxMs: 4_000, random: () => 1 });
    backoff.next();
    backoff.next();
    backoff.reset();
    expect(backoff.attempt).toBe(0);
    expect(backoff.next()).toBe(500);
  });
});

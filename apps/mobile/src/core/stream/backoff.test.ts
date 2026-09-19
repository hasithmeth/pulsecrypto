import { createBackoff } from './backoff';

describe('createBackoff', () => {
  it('doubles the jitter ceiling per attempt up to the maximum', () => {
    const backoff = createBackoff({ baseMs: 500, maxMs: 2_000, random: () => 1 });

    expect([backoff.next(), backoff.next(), backoff.next(), backoff.next()]).toEqual([
      500, 1_000, 2_000, 2_000,
    ]);
    expect(backoff.attempt).toBe(4);
  });

  it('never returns less than the floor, and keeps the jitter above it', () => {
    const shortest = createBackoff({ minMs: 1_200, baseMs: 500, maxMs: 10_000, random: () => 0 });
    const longest = createBackoff({ minMs: 1_200, baseMs: 500, maxMs: 10_000, random: () => 1 });

    expect(shortest.next()).toBe(1_200);
    expect(longest.next()).toBe(1_700);
  });

  it('starts over after a reset', () => {
    const backoff = createBackoff({ baseMs: 500, maxMs: 10_000, random: () => 1 });
    backoff.next();
    backoff.next();

    backoff.reset();

    expect(backoff.attempt).toBe(0);
    expect(backoff.next()).toBe(500);
  });
});

import { AdaptiveInterval } from './adaptive-interval';

const LIMITS = { minIntervalMs: 10, maxIntervalMs: 1_000 };
const OVERLOADED = 0.5;
const HEALTHY = 0;

/** Feeds the same reading repeatedly and returns the interval after each sample. */
function run(
  controller: AdaptiveInterval,
  startMs: number,
  baseMs: number,
  share: number,
  samples: number,
): number[] {
  const trace: number[] = [];
  let current = startMs;
  for (let i = 0; i < samples; i += 1) {
    current = controller.next(current, baseMs, share);
    trace.push(current);
  }
  return trace;
}

describe('AdaptiveInterval', () => {
  it('holds steady while the UI keeps up', () => {
    expect(run(new AdaptiveInterval(LIMITS), 100, 100, HEALTHY, 30)).toEqual(Array(30).fill(100));
  });

  it('ignores a brief spike but backs off under sustained overload', () => {
    const controller = new AdaptiveInterval(LIMITS);

    expect(run(controller, 100, 100, OVERLOADED, 2)).toEqual([100, 100]);
    expect(controller.next(100, 100, HEALTHY)).toBe(100);
    expect(run(controller, 100, 100, OVERLOADED, 3)).toEqual([100, 100, 150]);
  });

  it('keeps backing off, on the 10 ms grid, and stops at the maximum', () => {
    const trace = run(new AdaptiveInterval(LIMITS), 10, 10, OVERLOADED, 60);

    expect(trace.at(-1)).toBe(1_000);
    expect(trace.every((interval) => interval % 10 === 0)).toBe(true);
    expect(trace).toEqual([...trace].sort((a, b) => a - b));
  });

  it('recovers slowly and never goes below what the user chose', () => {
    const controller = new AdaptiveInterval(LIMITS);
    const trace = run(controller, 400, 100, HEALTHY, 80);

    expect(trace.slice(0, 9)).toEqual(Array(9).fill(400));
    expect(trace[9]).toBe(320);
    expect(trace.at(-1)).toBe(100);
    expect(Math.min(...trace)).toBe(100);
  });

  it('snaps straight to a higher base when the user raises it', () => {
    expect(new AdaptiveInterval(LIMITS).next(100, 500, HEALTHY)).toBe(500);
  });
});

import {
  formatClock,
  formatCompact,
  formatDecimal,
  formatPercent,
  formatSpreadPercent,
} from './format';

describe('formatDecimal', () => {
  it.each([
    [64239.5, 2, '64,239.50'],
    [1234567.891, 2, '1,234,567.89'],
    [0.08863, 5, '0.08863'],
    [999, 0, '999'],
    [1000, 0, '1,000'],
    [-1234.5, 1, '-1,234.5'],
    [0, 2, '0.00'],
  ])('formats %d with %d decimals as %s', (value, decimals, expected) => {
    expect(formatDecimal(value, decimals)).toBe(expected);
  });

  it('shows a placeholder for values that are not finite', () => {
    expect(formatDecimal(Number.NaN, 2)).toBe('--');
  });
});

describe('formatPercent', () => {
  it('drops the sign, which the UI conveys with an arrow and colour', () => {
    expect(formatPercent(-1.224)).toBe('1.22%');
  });
});

describe('formatSpreadPercent', () => {
  it('adds precision for spreads that would otherwise round to zero', () => {
    expect(formatSpreadPercent(0.0000123)).toBe('0.000012%');
    expect(formatSpreadPercent(0.0214)).toBe('0.0214%');
    expect(formatSpreadPercent(0)).toBe('0.0000%');
  });
});

describe('formatCompact', () => {
  it.each([
    [950, '950.00'],
    [17_040, '17.04K'],
    [2_500_000, '2.50M'],
    [1_200_000_000_000, '1.20T'],
  ])('formats %d as %s', (value, expected) => {
    expect(formatCompact(value)).toBe(expected);
  });
});

describe('formatClock', () => {
  it('renders local time, optionally with milliseconds', () => {
    const timestamp = new Date(2026, 8, 19, 7, 5, 9, 42).getTime();
    expect(formatClock(timestamp)).toBe('07:05:09');
    expect(formatClock(timestamp, true)).toBe('07:05:09.042');
  });
});

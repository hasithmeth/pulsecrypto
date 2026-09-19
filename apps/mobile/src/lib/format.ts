const GROUPING = /\B(?=(\d{3})+(?!\d))/g;

/**
 * Hand-rolled instead of Intl.NumberFormat: the order book formats dozens of
 * cells per frame, and Hermes' Intl is an order of magnitude slower per call.
 */
export function formatDecimal(value: number, decimals: number): string {
  if (!Number.isFinite(value)) return '--';
  const [integer = '0', fraction] = Math.abs(value).toFixed(decimals).split('.');
  const grouped = integer.replace(GROUPING, ',');
  const sign = value < 0 ? '-' : '';
  return fraction === undefined ? `${sign}${grouped}` : `${sign}${grouped}.${fraction}`;
}

/** Spreads on liquid pairs are tiny fractions of a percent, so precision adapts instead of rounding to zero. */
export function formatSpreadPercent(value: number): string {
  if (!Number.isFinite(value)) return '--';
  return `${value.toFixed(value !== 0 && value < 0.001 ? 6 : 4)}%`;
}

export function formatPercent(value: number, decimals = 2): string {
  return Number.isFinite(value) ? `${Math.abs(value).toFixed(decimals)}%` : '--';
}

const COMPACT_UNITS = [
  { threshold: 1e12, suffix: 'T' },
  { threshold: 1e9, suffix: 'B' },
  { threshold: 1e6, suffix: 'M' },
  { threshold: 1e3, suffix: 'K' },
] as const;

export function formatCompact(value: number): string {
  if (!Number.isFinite(value)) return '--';
  const unit = COMPACT_UNITS.find(({ threshold }) => Math.abs(value) >= threshold);
  return unit ? `${(value / unit.threshold).toFixed(2)}${unit.suffix}` : value.toFixed(2);
}

const pad = (value: number, length = 2): string => String(value).padStart(length, '0');

export function formatClock(timestamp: number, withMillis = false): string {
  const date = new Date(timestamp);
  const clock = `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
  return withMillis ? `${clock}.${pad(date.getMilliseconds(), 3)}` : clock;
}

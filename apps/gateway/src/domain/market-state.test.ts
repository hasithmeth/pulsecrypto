import { describe, expect, it } from 'vitest';
import { type DayStats, MarketState } from './market-state';

const stats = (overrides: Partial<DayStats> = {}): DayStats => ({
  eventTime: 1_000,
  lastPrice: 100,
  changePct: 1.5,
  high: 110,
  low: 90,
  volume: 5_000,
  ...overrides,
});

const book = (lastUpdateId: number, bid = 100) => ({
  lastUpdateId,
  receivedAt: lastUpdateId,
  bids: [[bid, 1]] as [number, number][],
  asks: [[bid + 1, 1]] as [number, number][],
});

describe('MarketState', () => {
  it('withholds the ticker until 24h statistics are known', () => {
    const state = new MarketState(['BTCUSDT']);
    state.applyTrade('BTCUSDT', 101, 900);
    expect(state.ticker('BTCUSDT')).toBeUndefined();

    state.applyDayStats('BTCUSDT', stats({ eventTime: 800 }));
    expect(state.ticker('BTCUSDT')).toMatchObject({ price: 101, ts: 900 });
  });

  it('keeps only the latest value however many updates arrive', () => {
    const state = new MarketState(['BTCUSDT']);
    state.applyDayStats('BTCUSDT', stats());
    for (let i = 1; i <= 10_000; i += 1) {
      state.applyTrade('BTCUSDT', 100 + i, 1_000 + i);
      state.applyBook('BTCUSDT', book(i, 100 + i));
    }

    expect(state.ticker('BTCUSDT')?.price).toBe(10_100);
    expect(state.book('BTCUSDT')?.snapshot.lastUpdateId).toBe(10_000);
    expect(state.book('BTCUSDT')?.seq).toBe(10_000);
  });

  it('prefers the most recent price across the trade and ticker streams', () => {
    const state = new MarketState(['BTCUSDT']);
    state.applyTrade('BTCUSDT', 105, 2_000);
    state.applyDayStats('BTCUSDT', stats({ eventTime: 1_500, lastPrice: 100 }));
    expect(state.ticker('BTCUSDT')?.price).toBe(105);

    state.applyDayStats('BTCUSDT', stats({ eventTime: 2_500, lastPrice: 107 }));
    expect(state.ticker('BTCUSDT')?.price).toBe(107);
  });

  it('drops book snapshots that arrive out of order', () => {
    const state = new MarketState(['BTCUSDT']);
    state.applyBook('BTCUSDT', book(10));
    state.applyBook('BTCUSDT', book(9));
    expect(state.book('BTCUSDT')).toMatchObject({ seq: 1, snapshot: { lastUpdateId: 10 } });
  });

  it('ignores pairs it was not configured for', () => {
    const state = new MarketState(['BTCUSDT']);
    state.applyBook('ETHUSDT', book(1));
    expect(state.book('ETHUSDT')).toBeUndefined();
  });
});

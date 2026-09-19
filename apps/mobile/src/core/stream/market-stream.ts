import { gateway } from '@/core/config/gateway';
import { useConnectionStore } from './connection-store';
import { FrameCoalescer } from './frame-coalescer';
import { useMarketStore } from './market-store';
import { MarketStreamClient } from './market-stream-client';

export const frameCoalescer = new FrameCoalescer((batch) => {
  useMarketStore.getState().applyBatch(batch, Date.now());
});

export const marketStream = new MarketStreamClient({
  url: gateway.streamUrl,
  onMarket: (message) => {
    frameCoalescer.push(message);
  },
  onConnection: (snapshot) => {
    useConnectionStore.setState(snapshot);
  },
});

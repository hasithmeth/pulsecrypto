import type { PairSymbol } from '@pulsecrypto/contracts';
import { useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import { marketStream } from './market-stream';

/** Streams a pair's order book only while the calling screen is focused. */
export function useBookSubscription(pair: PairSymbol): void {
  useFocusEffect(useCallback(() => marketStream.subscribeBook(pair), [pair]));
}

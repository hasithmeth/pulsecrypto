import type { PairMeta } from '@pulsecrypto/contracts';
import { memo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useIsStreamLive } from '@/core/stream/connection-store';
import { useTicker } from '@/core/stream/market-store';
import { useFavouritesStore, useIsFavourite } from '@/features/favourites/favourites-store';
import { formatDecimal, formatPercent } from '@/lib/format';
import { AppText } from '@/ui/app-text';
import { FlashingPrice } from '@/ui/flashing-price';
import { IconButton } from '@/ui/icon-button';
import { colors, radius, spacing, withAlpha } from '@/ui/theme';

interface MarketRowProps {
  readonly pair: PairMeta;
  readonly onPress: (pair: PairMeta) => void;
}

/**
 * Each row subscribes to its own ticker, so a BTC tick re-renders the BTC row
 * and nothing else; the list itself only re-renders when its contents change.
 */
export const MarketRow = memo(function MarketRow({ pair, onPress }: MarketRowProps) {
  const ticker = useTicker(pair.symbol);
  const isFavourite = useIsFavourite(pair.symbol);
  const toggleFavourite = useFavouritesStore((state) => state.toggle);
  const isLive = useIsStreamLive() && ticker !== undefined;

  const change = ticker?.change24hPct;
  const rising = (change ?? 0) >= 0;
  const changeTone = change === undefined ? 'textMuted' : rising ? 'positive' : 'negative';
  const price = ticker ? formatDecimal(ticker.price, pair.priceDecimals) : '--';
  const changeText = change === undefined ? '--' : `${rising ? '▲' : '▼'} ${formatPercent(change)}`;

  return (
    <Pressable
      onPress={() => {
        onPress(pair);
      }}
      accessibilityRole="button"
      accessibilityLabel={`${pair.displayName}, ${price} ${pair.quote}, ${rising ? 'up' : 'down'} ${formatPercent(change ?? 0)} in 24 hours`}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      <IconButton
        icon={isFavourite ? 'star' : 'star-outline'}
        label={
          isFavourite
            ? `Remove ${pair.displayName} from favourites`
            : `Add ${pair.displayName} to favourites`
        }
        color={isFavourite ? 'positive' : 'textMuted'}
        selected={isFavourite}
        onPress={() => {
          toggleFavourite(pair.symbol);
        }}
      />

      <View style={styles.identity}>
        <View style={styles.symbol}>
          <AppText variant="mono">{pair.base}</AppText>
          <AppText variant="mono" color="textMuted">
            {' '}
            / {pair.quote}
          </AppText>
        </View>
        <AppText variant="caption" color="textSecondary" numberOfLines={1}>
          {pair.displayName}
        </AppText>
      </View>

      <FlashingPrice value={ticker?.price} text={price} style={styles.price} />

      <View style={[styles.change, { backgroundColor: withAlpha(colors[changeTone], 0.1) }]}>
        <AppText variant="mono" color={changeTone} numberOfLines={1}>
          {changeText}
        </AppText>
      </View>

      <View
        style={[styles.liveDot, { backgroundColor: isLive ? colors.positive : colors.textMuted }]}
        accessibilityLabel={isLive ? 'Live' : 'Not updating'}
      />
    </Pressable>
  );
});

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 64,
    paddingLeft: spacing.sm,
    paddingRight: spacing.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.outline,
  },
  pressed: { backgroundColor: colors.surface },
  identity: { flex: 1, gap: 2 },
  symbol: { flexDirection: 'row' },
  price: { textAlign: 'right' },
  change: {
    width: 92,
    alignItems: 'center',
    paddingVertical: spacing.xs,
    borderRadius: radius.sm,
  },
  liveDot: { width: 8, height: 8, borderRadius: radius.pill },
});

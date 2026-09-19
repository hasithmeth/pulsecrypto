import type { PairMeta } from '@pulsecrypto/contracts';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useBook, useTicker } from '@/core/stream/market-store';
import { formatClock, formatCompact, formatDecimal, formatPercent } from '@/lib/format';
import { AppText } from '@/ui/app-text';
import { FlashingPrice } from '@/ui/flashing-price';
import { colors, spacing } from '@/ui/theme';

export function PriceTickerCard({ pair }: { pair: PairMeta }) {
  const ticker = useTicker(pair.symbol);
  const book = useBook(pair.symbol);
  const rising = (ticker?.change24hPct ?? 0) >= 0;
  const tone = ticker ? (rising ? 'positive' : 'negative') : 'textMuted';
  const money = (value: number | null | undefined): string =>
    value === null || value === undefined ? '--' : `$${formatDecimal(value, pair.priceDecimals)}`;

  return (
    <View style={styles.card}>
      <View style={styles.price}>
        <AppText variant="label" color="textSecondary">
          LAST PRICE
        </AppText>
        <View style={styles.priceRow}>
          <FlashingPrice
            value={ticker?.price}
            text={money(ticker?.price)}
            variant="display"
            restingColor={tone}
          />
          <AppText variant="mono" color={tone} numberOfLines={1}>
            {ticker ? `${rising ? '▲' : '▼'} ${formatPercent(ticker.change24hPct)}` : '--'}
          </AppText>
        </View>
      </View>

      {/* The design's stats row is a horizontal scroller. The first three cells are
          the designed ones; the rest carry values the brief requires and sit off-screen. */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.stats}
        accessibilityLabel="Market statistics"
      >
        <Stat label="24H HIGH" value={money(ticker?.high24h ?? pair.high24h)} />
        <Stat label="24H LOW" value={money(ticker?.low24h ?? pair.low24h)} />
        <Stat
          label="MARKET CAP"
          value={ticker ? formatCompact(ticker.price * pair.circulatingSupply) : '--'}
        />
        <Stat label="SPREAD" value={book ? formatDecimal(book.spread, pair.priceDecimals) : '--'} />
        <Stat label="BUY PRESSURE" value={book ? `${book.buyPressure.toFixed(1)}%` : '--'} />
        <Stat label="SELL PRESSURE" value={book ? `${book.sellPressure.toFixed(1)}%` : '--'} />
        <Stat label="LAST UPDATED" value={book ? formatClock(book.ts, true) : '--'} />
      </ScrollView>
    </View>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View>
      <AppText variant="label" color="textSecondary">
        {label}
      </AppText>
      <AppText variant="mono" numberOfLines={1}>
        {value}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    paddingTop: spacing.lg,
    paddingBottom: spacing.lg,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.outline,
  },
  price: { paddingHorizontal: spacing.lg, paddingTop: 8.5, gap: spacing.xs },
  // Fixed to the design's 39pt row: Android's baseline alignment would otherwise shrink it.
  priceRow: { height: 39, flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm },
  stats: { flexDirection: 'row', gap: spacing.xl, paddingHorizontal: spacing.lg },
});

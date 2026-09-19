import type { PairMeta } from '@pulsecrypto/contracts';
import { StyleSheet, View } from 'react-native';
import { useTicker } from '@/core/stream/market-store';
import { formatCompact, formatDecimal, formatPercent } from '@/lib/format';
import { AppText } from '@/ui/app-text';
import { FlashingPrice } from '@/ui/flashing-price';
import { colors, spacing } from '@/ui/theme';

export function PriceTickerCard({ pair }: { pair: PairMeta }) {
  const ticker = useTicker(pair.symbol);
  const rising = (ticker?.change24hPct ?? 0) >= 0;
  const tone = ticker ? (rising ? 'positive' : 'negative') : 'textMuted';
  const money = (value: number | null | undefined): string =>
    value === null || value === undefined ? '--' : `$${formatDecimal(value, pair.priceDecimals)}`;

  return (
    <View style={styles.card}>
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
        <AppText variant="mono" color={tone} style={styles.change} numberOfLines={1}>
          {ticker ? `${rising ? '▲' : '▼'} ${formatPercent(ticker.change24hPct)}` : '--'}
        </AppText>
      </View>

      <View style={styles.stats}>
        <Stat label="24H HIGH" value={money(ticker?.high24h ?? pair.high24h)} />
        <Stat label="24H LOW" value={money(ticker?.low24h ?? pair.low24h)} />
        <Stat
          label={`24H VOL (${pair.base})`}
          value={formatCompact(ticker?.volume24h ?? pair.volume24h ?? Number.NaN)}
        />
      </View>
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
    padding: spacing.lg,
    gap: spacing.xs,
    backgroundColor: colors.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.outline,
  },
  priceRow: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm },
  change: { paddingBottom: 6 },
  stats: { flexDirection: 'row', gap: spacing.xl, marginTop: spacing.sm },
});

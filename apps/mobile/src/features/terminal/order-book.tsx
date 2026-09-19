import type { PairMeta, PriceLevel } from '@pulsecrypto/contracts';
import { StyleSheet, View } from 'react-native';
import { useBook } from '@/core/stream/market-store';
import { formatDecimal } from '@/lib/format';
import { AppText } from '@/ui/app-text';
import { colors, spacing, withAlpha } from '@/ui/theme';
import { OrderBookRow, type BookSide } from './order-book-row';

const VISIBLE_LEVELS = 10;
const SLOTS = Array.from({ length: VISIBLE_LEVELS }, (_, index) => index);
const NO_LEVELS: readonly PriceLevel[] = [];

const largestQuantity = (levels: readonly PriceLevel[]): number =>
  levels.reduce((max, [, quantity]) => Math.max(max, quantity), 0);

export function OrderBook({ pair }: { pair: PairMeta }) {
  const book = useBook(pair.symbol);
  const bids = book?.bids.slice(0, VISIBLE_LEVELS) ?? NO_LEVELS;
  const asks = book?.asks.slice(0, VISIBLE_LEVELS) ?? NO_LEVELS;
  const scale = Math.max(largestQuantity(bids), largestQuantity(asks));

  return (
    <View style={styles.book}>
      <BookSection side="bid" title="Bids" levels={bids} scale={scale} pair={pair} />
      <BookSection side="ask" title="Asks" levels={asks} scale={scale} pair={pair} />
    </View>
  );
}

interface BookSectionProps {
  readonly side: BookSide;
  readonly title: string;
  readonly levels: readonly PriceLevel[];
  readonly scale: number;
  readonly pair: PairMeta;
}

function BookSection({ side, title, levels, scale, pair }: BookSectionProps) {
  return (
    <View style={styles.section} accessibilityLabel={`${title} order book`}>
      <View style={styles.header}>
        <AppText variant="label" color="textSecondary">
          PRICE ({pair.quote})
        </AppText>
        <AppText variant="label" color="textSecondary">
          AMOUNT ({pair.base})
        </AppText>
        <AppText variant="label" color="textSecondary">
          TOTAL
        </AppText>
      </View>

      {/* Rows are keyed by rank, not price, so a level's bar animates to its new size instead of remounting. */}
      {SLOTS.map((slot) => {
        const level = levels[slot];
        if (!level)
          return (
            <OrderBookRow key={slot} side={side} price="--" quantity="--" total="--" depth={0} />
          );
        const [price, quantity] = level;
        return (
          <OrderBookRow
            key={slot}
            side={side}
            price={formatDecimal(price, pair.priceDecimals)}
            quantity={formatDecimal(quantity, pair.quantityDecimals)}
            total={formatDecimal(price * quantity, 2)}
            depth={scale > 0 ? Math.round((quantity / scale) * 1_000) / 1_000 : 0}
          />
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  book: { backgroundColor: colors.background },
  section: {
    padding: spacing.xs,
    paddingBottom: spacing.xs - 1,
    borderBottomWidth: 1,
    borderBottomColor: colors.outline,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    backgroundColor: withAlpha(colors.surfaceOverlay, 0.5),
    borderBottomWidth: 1,
    borderBottomColor: colors.outline,
  },
});

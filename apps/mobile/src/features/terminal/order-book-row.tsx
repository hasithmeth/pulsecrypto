import { memo, useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { AppText } from '@/ui/app-text';
import { colors, layout, spacing, withAlpha } from '@/ui/theme';

export type BookSide = 'bid' | 'ask';

interface OrderBookRowProps {
  readonly side: BookSide;
  readonly price: string;
  readonly quantity: string;
  readonly total: string;
  /** Share of the largest visible level, 0 to 1. */
  readonly depth: number;
}

const DEPTH_ANIMATION = { duration: 180, easing: Easing.out(Easing.quad) } as const;

/**
 * Props are preformatted primitives, so memo skips every row whose level did not
 * change in a tick. The depth bar animates with a scale transform on the UI
 * thread: no layout pass, and no dependence on how busy the JS thread is.
 */
export const OrderBookRow = memo(function OrderBookRow({
  side,
  price,
  quantity,
  total,
  depth,
}: OrderBookRowProps) {
  const scale = useSharedValue(depth);

  useEffect(() => {
    scale.set(withTiming(depth, DEPTH_ANIMATION));
  }, [depth, scale]);

  const barStyle = useAnimatedStyle(() => ({ transform: [{ scaleX: scale.get() }] }));

  return (
    <View style={styles.row}>
      <Animated.View
        style={[styles.bar, side === 'bid' ? styles.bidBar : styles.askBar, barStyle]}
      />
      <AppText
        variant="mono"
        color={side === 'bid' ? 'positive' : 'negative'}
        style={styles.price}
        numberOfLines={1}
      >
        {price}
      </AppText>
      <AppText variant="mono" style={styles.quantity} numberOfLines={1}>
        {quantity}
      </AppText>
      <AppText variant="mono" color="textSecondary" style={styles.total} numberOfLines={1}>
        {total}
      </AppText>
    </View>
  );
});

const styles = StyleSheet.create({
  row: {
    height: layout.bookRowHeight,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
  },
  bar: { position: 'absolute', inset: 0 },
  bidBar: { backgroundColor: withAlpha(colors.positive, 0.1), transformOrigin: 'right' },
  askBar: { backgroundColor: withAlpha(colors.negative, 0.1), transformOrigin: 'left' },
  price: { flex: 1 },
  quantity: { flex: 1, textAlign: 'center' },
  total: { flex: 1, textAlign: 'right' },
});

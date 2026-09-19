import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useConnectionStore } from '@/core/stream/connection-store';
import { marketStream } from '@/core/stream/market-stream';
import { useBookSubscription } from '@/core/stream/use-book-subscription';
import { usePairMeta, usePairsMetaRefresh } from '@/features/markets/use-pairs-meta';
import { useUserSettingsStore } from '@/features/settings/user-settings-store';
import { AppHeader } from '@/ui/app-header';
import { AppText } from '@/ui/app-text';
import { Icon } from '@/ui/icon';
import { colors, radius, refreshIndicator, spacing } from '@/ui/theme';
import { DepthChart } from './depth-chart';
import { OrderBook } from './order-book';
import { PriceTickerCard } from './price-ticker-card';

export function TerminalScreen() {
  const symbol = useUserSettingsStore((state) => state.selectedPair);
  const pair = usePairMeta(symbol);
  const paused = useConnectionStore((state) => state.paused);
  const { refreshing, refresh } = usePairsMetaRefresh();

  useBookSubscription(symbol);

  return (
    <View style={styles.screen}>
      <AppHeader
        variant="terminal"
        title={pair ? `${pair.base}/${pair.quote}` : symbol}
        trailing={
          <Pressable
            onPress={() => {
              marketStream.setPaused(!paused);
            }}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={paused ? 'Resume live updates' : 'Pause live updates'}
            accessibilityState={{ selected: !paused }}
            style={styles.streamToggle}
          >
            <Icon name="sensors" color={paused ? 'textMuted' : 'positive'} />
          </Pressable>
        }
      />

      {pair ? (
        <ScrollView
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={refresh} {...refreshIndicator} />
          }
        >
          <PriceTickerCard pair={pair} />
          <OrderBook pair={pair} />
          <DepthChart pair={pair} />
        </ScrollView>
      ) : (
        <View style={styles.placeholder}>
          <ActivityIndicator color={colors.positive} />
          <AppText color="textSecondary">Waiting for market metadata…</AppText>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  streamToggle: { paddingTop: 8, paddingBottom: 14, paddingHorizontal: 8, borderRadius: radius.lg },
  placeholder: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md },
});

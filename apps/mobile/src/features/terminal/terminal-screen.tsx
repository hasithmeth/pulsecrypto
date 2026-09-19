import { useRouter } from 'expo-router';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';
import { useBookSubscription } from '@/core/stream/use-book-subscription';
import { useFavouritesStore, useIsFavourite } from '@/features/favourites/favourites-store';
import { usePairMeta } from '@/features/markets/use-pairs-meta';
import { usePreferencesStore } from '@/features/preferences/preferences-store';
import { AppText } from '@/ui/app-text';
import { ConnectionBanner } from '@/ui/connection-banner';
import { ConnectionIndicator } from '@/ui/connection-indicator';
import { IconButton } from '@/ui/icon-button';
import { ScreenHeader } from '@/ui/screen-header';
import { colors, spacing } from '@/ui/theme';
import { DepthChart } from './depth-chart';
import { MarketPressure } from './market-pressure';
import { OrderBook } from './order-book';
import { PriceTickerCard } from './price-ticker-card';

export function TerminalScreen() {
  const router = useRouter();
  const symbol = usePreferencesStore((state) => state.selectedPair);
  const pair = usePairMeta(symbol);
  const isFavourite = useIsFavourite(symbol);
  const toggleFavourite = useFavouritesStore((state) => state.toggle);

  useBookSubscription(symbol);

  return (
    <View style={styles.screen}>
      <ScreenHeader
        title={pair ? `${pair.base}/${pair.quote}` : symbol}
        leading={
          <IconButton
            icon="swap-horizontal"
            label="Choose another trading pair"
            onPress={() => {
              router.navigate('/');
            }}
          />
        }
        trailing={
          <IconButton
            icon={isFavourite ? 'star' : 'star-outline'}
            label={isFavourite ? 'Remove from favourites' : 'Add to favourites'}
            selected={isFavourite}
            onPress={() => {
              toggleFavourite(symbol);
            }}
          />
        }
      >
        <ConnectionIndicator />
      </ScreenHeader>
      <ConnectionBanner />

      {pair ? (
        <ScrollView contentContainerStyle={styles.content}>
          <PriceTickerCard pair={pair} />
          <MarketPressure pair={pair} />
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
  content: { paddingBottom: spacing.xl },
  placeholder: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md },
});

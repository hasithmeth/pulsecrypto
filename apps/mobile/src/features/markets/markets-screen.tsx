import type { PairMeta } from '@pulsecrypto/contracts';
import { useRouter } from 'expo-router';
import { useDeferredValue, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  View,
} from 'react-native';
import { ApiError } from '@/core/api/http-client';
import { useUserSettingsStore } from '@/features/settings/user-settings-store';
import { AppHeader } from '@/ui/app-header';
import { AppText } from '@/ui/app-text';
import { colors, refreshIndicator, spacing } from '@/ui/theme';
import { FilterChips } from './filter-chips';
import { filterPairs, type MarketFilter } from './filter-pairs';
import { MarketRow } from './market-row';
import { SearchField } from './search-field';
import { usePairsMeta, usePairsMetaRefresh } from './use-pairs-meta';

const keyExtractor = (pair: PairMeta): string => pair.symbol;

export function MarketsScreen() {
  const router = useRouter();
  const { data: pairs, isPending, error } = usePairsMeta();
  const { refreshing, refresh } = usePairsMetaRefresh();
  const favourites = useUserSettingsStore((state) => state.favourites);
  const selectPair = useUserSettingsStore((state) => state.selectPair);

  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<MarketFilter>('all');
  const visiblePairs = filterPairs(pairs ?? [], useDeferredValue(query), filter, favourites);

  const openPair = (pair: PairMeta): void => {
    selectPair(pair.symbol);
    router.navigate('/');
  };

  return (
    <View style={styles.screen}>
      <AppHeader variant="pill" title="Markets" />

      <View style={styles.controls}>
        <SearchField value={query} onChangeText={setQuery} />
        <FilterChips value={filter} onChange={setFilter} />
      </View>

      <FlatList
        data={visiblePairs}
        keyExtractor={keyExtractor}
        renderItem={({ item }) => <MarketRow pair={item} onPress={openPair} />}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={refresh} {...refreshIndicator} />
        }
        ListEmptyComponent={
          <EmptyState
            loading={isPending}
            error={pairs ? null : error}
            filter={filter}
            hasQuery={query.trim().length > 0}
            onRetry={refresh}
          />
        }
      />
    </View>
  );
}

interface EmptyStateProps {
  readonly loading: boolean;
  readonly error: Error | null;
  readonly filter: MarketFilter;
  readonly hasQuery: boolean;
  readonly onRetry: () => void;
}

function EmptyState({ loading, error, filter, hasQuery, onRetry }: EmptyStateProps) {
  if (loading) return <ActivityIndicator color={colors.positive} style={styles.empty} />;

  if (error) {
    return (
      <View style={styles.empty}>
        <AppText variant="cardTitle">Markets unavailable</AppText>
        <AppText color="textSecondary" style={styles.centered}>
          {error instanceof ApiError ? error.message : 'Something went wrong.'} The app will retry
          automatically once the gateway is reachable.
        </AppText>
        <Pressable onPress={onRetry} accessibilityRole="button" style={styles.retry}>
          <AppText variant="mono" color="header">
            Retry
          </AppText>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.empty}>
      <AppText color="textSecondary" style={styles.centered}>
        {hasQuery
          ? 'No trading pairs match your search.'
          : filter === 'favourites'
            ? 'Tap the star on a pair to add it to your favourites.'
            : 'No trading pairs available.'}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  controls: { padding: spacing.lg, gap: spacing.md },
  listContent: { flexGrow: 1 },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    padding: spacing.xxl,
  },
  centered: { textAlign: 'center' },
  retry: {
    marginTop: spacing.sm,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.sm,
    backgroundColor: colors.textSecondary,
  },
});

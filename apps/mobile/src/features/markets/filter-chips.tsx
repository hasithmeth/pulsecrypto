import { Pressable, StyleSheet, View } from 'react-native';
import { AppText } from '@/ui/app-text';
import { colors, spacing } from '@/ui/theme';
import type { MarketFilter } from './filter-pairs';

const OPTIONS: readonly { value: MarketFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'favourites', label: 'Favourites' },
];

interface FilterChipsProps {
  readonly value: MarketFilter;
  readonly onChange: (value: MarketFilter) => void;
}

export function FilterChips({ value, onChange }: FilterChipsProps) {
  return (
    <View style={styles.row} accessibilityRole="tablist">
      {OPTIONS.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            onPress={() => {
              onChange(option.value);
            }}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            style={[styles.chip, selected && styles.selected]}
          >
            <AppText variant="mono" color={selected ? 'header' : 'textSecondary'}>
              {option.label}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: spacing.sm },
  chip: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surfaceMuted,
  },
  selected: { backgroundColor: colors.textSecondary },
});

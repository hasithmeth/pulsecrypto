import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText } from './app-text';
import { colors, layout, spacing } from './theme';

interface ScreenHeaderProps {
  readonly title: string;
  readonly leading?: ReactNode;
  readonly trailing?: ReactNode;
  readonly children?: ReactNode;
}

export function ScreenHeader({ title, leading, trailing, children }: ScreenHeaderProps) {
  const { top } = useSafeAreaInsets();
  return (
    <View style={[styles.container, { paddingTop: top }]}>
      <View style={styles.bar}>
        <View style={styles.start}>
          {leading}
          <AppText variant="heading" accessibilityRole="header" numberOfLines={1}>
            {title}
          </AppText>
          {children}
        </View>
        {trailing}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.header,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.outline,
  },
  bar: {
    height: layout.headerHeight,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
  },
  start: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexShrink: 1 },
});

import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { colors, radius, spacing, withAlpha } from './theme';

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: withAlpha(colors.surfaceMuted, 0.4),
    borderColor: colors.surfaceMuted,
    borderWidth: 1,
    borderRadius: radius.md,
    // Figma strokes sit inside the box: its 25pt inset is a 1pt border plus 24pt of padding.
    padding: 24,
    gap: spacing.xl,
  },
});

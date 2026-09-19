import { StyleSheet, View } from 'react-native';
import { AppText } from './app-text';
import { colors, radius, spacing } from './theme';
import { useConnectionStatus } from './use-connection-status';

export function ConnectionIndicator({ variant = 'inline' }: { variant?: 'inline' | 'pill' }) {
  const { label, tone } = useConnectionStatus();
  return (
    <View
      style={[styles.row, variant === 'pill' && styles.pill]}
      accessibilityRole="text"
      accessibilityLabel={`Connection status: ${label.toLowerCase()}`}
    >
      <View style={[styles.dot, { backgroundColor: colors[tone] }]} />
      <AppText variant="label" color={tone}>
        {label}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  pill: {
    backgroundColor: colors.surfaceRaised,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  dot: { width: 8, height: 8, borderRadius: radius.pill },
});

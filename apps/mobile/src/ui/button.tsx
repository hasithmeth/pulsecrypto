import { ActivityIndicator, Pressable, StyleSheet } from 'react-native';
import { AppText } from './app-text';
import { colors, spacing } from './theme';

interface ButtonProps {
  readonly label: string;
  readonly onPress: () => void;
  readonly variant?: 'primary' | 'outlined';
  readonly loading?: boolean;
  readonly disabled?: boolean;
}

/** Follows the button styles on the design-system sheet: square corners, monospace label. */
export function Button({
  label,
  onPress,
  variant = 'primary',
  loading = false,
  disabled = false,
}: ButtonProps) {
  const inactive = disabled || loading;
  const primary = variant === 'primary';
  return (
    <Pressable
      onPress={onPress}
      disabled={inactive}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: inactive, busy: loading }}
      style={({ pressed }) => [
        styles.button,
        primary ? styles.primary : styles.outlined,
        (pressed || inactive) && styles.dimmed,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={primary ? colors.header : colors.textPrimary} />
      ) : (
        <AppText variant="monoLg" color={primary ? 'header' : 'textPrimary'}>
          {label}
        </AppText>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  primary: { backgroundColor: colors.textSecondary },
  outlined: { borderWidth: 1, borderColor: colors.textSecondary },
  dimmed: { opacity: 0.6 },
});

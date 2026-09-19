import { StyleSheet, View } from 'react-native';
import { AppText } from './app-text';
import { Button } from './button';
import { colors, spacing } from './theme';

interface ErrorScreenProps {
  readonly error: Error;
  readonly onRetry: () => void;
  readonly showDetails?: boolean;
}

/** The last-resort screen. It depends on nothing but the theme, so it cannot fail the way the app just did. */
export function ErrorScreen({ error, onRetry, showDetails = __DEV__ }: ErrorScreenProps) {
  return (
    <View style={styles.screen} accessibilityRole="alert">
      <View style={styles.copy}>
        <AppText variant="label" color="negative">
          UNEXPECTED ERROR
        </AppText>
        <AppText variant="screenTitle" accessibilityRole="header">
          Something went wrong
        </AppText>
        <AppText color="textSecondary">
          PulseCrypto hit a problem it could not recover from. Trying again restarts the app and
          reconnects the live stream. Your account and settings are not affected.
        </AppText>
      </View>

      {showDetails ? (
        <View style={styles.details}>
          <AppText variant="caption" color="textMuted" numberOfLines={6}>
            {error.message}
          </AppText>
        </View>
      ) : null}

      <Button label="Try again" onPress={onRetry} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    justifyContent: 'center',
    gap: spacing.xl,
    padding: spacing.xl,
    backgroundColor: colors.backgroundDeep,
  },
  copy: { gap: spacing.sm },
  details: {
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.outline,
    backgroundColor: colors.surface,
  },
});

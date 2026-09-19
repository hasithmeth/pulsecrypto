import { MaterialCommunityIcons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';
import { useConnectionStore } from '@/core/stream/connection-store';
import { useMarketStore } from '@/core/stream/market-store';
import { formatClock } from '@/lib/format';
import { AppText } from './app-text';
import { colors, spacing, withAlpha } from './theme';

const MESSAGES = {
  connecting: 'Connecting to the gateway…',
  reconnecting: 'Connection lost. Reconnecting…',
  offline: 'No network connection',
  feedDown: 'Gateway connected, waiting for the exchange feed…',
} as const;

/** Explains why data has stopped moving, and how old the numbers on screen are. */
export function ConnectionBanner() {
  const message = useConnectionStore(({ phase, upstream }) => {
    if (phase === 'idle') return null;
    if (phase === 'open') return upstream === 'live' ? null : MESSAGES.feedDown;
    return MESSAGES[phase];
  });
  const attempt = useConnectionStore((state) => state.attempt);
  const lastFrameAt = useMarketStore((state) => (message ? state.lastFrameAt : null));

  if (!message) return null;

  const detail = [
    attempt > 1 ? `attempt ${attempt}` : null,
    lastFrameAt ? `showing data from ${formatClock(lastFrameAt)}` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <View style={styles.banner} accessibilityRole="alert" accessibilityLiveRegion="polite">
      <MaterialCommunityIcons name="wifi-alert" size={16} color={colors.accent} />
      <View style={styles.text}>
        <AppText variant="caption" color="accent">
          {message}
        </AppText>
        {detail ? (
          <AppText variant="label" color="textSecondary">
            {detail}
          </AppText>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    backgroundColor: withAlpha(colors.accent, 0.1),
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.outline,
  },
  text: { flex: 1, gap: 2 },
});

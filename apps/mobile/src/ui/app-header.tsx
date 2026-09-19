import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText } from './app-text';
import { useDrawerStore } from './drawer-store';
import { Icon } from './icon';
import { colors, layout, radius, spacing } from './theme';
import { useConnectionStatus } from './use-connection-status';

interface AppHeaderProps {
  readonly title: string;
  /** `terminal` puts the status beside the title and takes a trailing action; `pill` shows it on the right. */
  readonly variant: 'terminal' | 'pill';
  readonly trailing?: ReactNode;
}

export function AppHeader({ title, variant, trailing }: AppHeaderProps) {
  const { top } = useSafeAreaInsets();
  const openDrawer = useDrawerStore((state) => state.open);
  const isTerminal = variant === 'terminal';

  return (
    <View style={[styles.container, { paddingTop: top }]}>
      <View style={styles.bar}>
        <View style={styles.start}>
          <Pressable
            onPress={openDrawer}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Open menu"
            style={styles.menu}
          >
            <Icon name="menu" color="positive" />
          </Pressable>
          <AppText variant="headerTitle" accessibilityRole="header" numberOfLines={1}>
            {title}
          </AppText>
          {isTerminal ? <StatusLabel /> : null}
        </View>
        {isTerminal ? trailing : <StatusPill />}
      </View>
    </View>
  );
}

function StatusLabel() {
  const { label, tone } = useConnectionStatus();
  return (
    <View
      style={styles.statusLabel}
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

function StatusPill() {
  const { label, pillLabel, tone } = useConnectionStatus();
  return (
    <View
      style={styles.pill}
      accessibilityRole="text"
      accessibilityLabel={`Connection status: ${label.toLowerCase()}`}
    >
      <Icon name="sensorsSmall" color={tone} />
      <AppText variant="mono" color={tone}>
        {pillLabel}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.header,
    borderBottomWidth: 1,
    borderBottomColor: colors.outline,
  },
  bar: {
    height: layout.headerHeight - 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
  },
  start: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexShrink: 1 },
  // Figma's two headers disagree on the menu button (34pt with 8pt padding on the
  // Terminal, 26pt with 4pt on Settings), which would make the icon jump between
  // tabs. The Terminal's metrics are used everywhere; the title lands on the same
  // x in both designs either way.
  menu: { paddingTop: 8, paddingBottom: 14, paddingHorizontal: 8, borderRadius: radius.lg },
  statusLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingLeft: spacing.sm,
  },
  dot: { width: 8, height: 8, borderRadius: radius.lg },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceRaised,
  },
});

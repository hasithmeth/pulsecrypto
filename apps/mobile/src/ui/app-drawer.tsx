import { useEffect } from 'react';
import { BackHandler, Pressable, StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';
import { useAuthStore } from '@/features/auth/auth-store';
import { AppText } from './app-text';
import { useDrawerStore } from './drawer-store';
import { Icon, type IconName } from './icon';
import { colors, layout, radius, spacing, withAlpha } from './theme';

const WIDTH = layout.drawerWidth;
const TRANSITION = { duration: 240 } as const;
const CLOSE_DISTANCE = WIDTH / 3;
const CLOSE_VELOCITY = -500;

/**
 * The design lists these destinations but draws no screens for them, so they
 * are presented exactly as designed (Trade History in its highlighted state)
 * and announced as unavailable rather than linking to invented screens.
 */
const SECTIONS: readonly {
  title: string;
  items: readonly { label: string; icon: IconName; highlighted?: boolean }[];
}[] = [
  {
    title: 'ACCOUNT',
    items: [
      { label: 'API Keys', icon: 'key' },
      { label: 'Security', icon: 'shield' },
    ],
  },
  {
    title: 'TRADING',
    items: [
      { label: 'Trade History', icon: 'history', highlighted: true },
      { label: 'Support', icon: 'support' },
    ],
  },
];

export function AppDrawer() {
  const insets = useSafeAreaInsets();
  const isOpen = useDrawerStore((state) => state.isOpen);
  const close = useDrawerStore((state) => state.close);
  const user = useAuthStore((state) => state.user);
  const signOut = useAuthStore((state) => state.signOut);
  const progress = useSharedValue(0);
  const dragX = useSharedValue(0);

  useEffect(() => {
    dragX.set(0);
    progress.set(withTiming(isOpen ? 1 : 0, TRANSITION));
  }, [isOpen, progress, dragX]);

  useEffect(() => {
    if (!isOpen) return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      close();
      return true;
    });
    return () => {
      subscription.remove();
    };
  }, [isOpen, close]);

  const swipeToClose = Gesture.Pan()
    .activeOffsetX(-12)
    .onUpdate((event) => {
      dragX.set(Math.min(0, event.translationX));
    })
    .onEnd((event) => {
      if (event.translationX < -CLOSE_DISTANCE || event.velocityX < CLOSE_VELOCITY)
        scheduleOnRN(close);
      else dragX.set(withTiming(0, TRANSITION));
    });

  const scrimStyle = useAnimatedStyle(() => ({ opacity: progress.get() * 0.6 }));
  const panelStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: interpolate(progress.get(), [0, 1], [-WIDTH, 0]) + dragX.get() }],
  }));

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents={isOpen ? 'auto' : 'none'}>
      <Animated.View style={[styles.scrim, scrimStyle]}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={close}
          accessibilityLabel="Close menu"
        />
      </Animated.View>

      <GestureDetector gesture={swipeToClose}>
        <Animated.View
          style={[styles.panel, panelStyle]}
          accessibilityViewIsModal={isOpen}
          importantForAccessibility={isOpen ? 'yes' : 'no-hide-descendants'}
        >
          <View style={[styles.profile, { paddingTop: insets.top + spacing.xl }]}>
            <View style={styles.avatar}>
              <Icon name="account" color="onPositive" />
            </View>
            <View>
              <AppText variant="cardTitle" numberOfLines={1} style={styles.name}>
                {user?.displayName ?? ''}
              </AppText>
              <AppText variant="caption" color="textSecondary">
                Tier 3 Verified •{' '}
                <AppText variant="caption" color="positive">
                  ID: {user?.publicId ?? ''}
                </AppText>
              </AppText>
            </View>
          </View>

          <View style={styles.nav}>
            {SECTIONS.map((section, index) => (
              <View key={section.title}>
                <AppText
                  variant="label"
                  color="textSecondary"
                  style={[styles.sectionTitle, index > 0 && styles.sectionTitleSpaced]}
                >
                  {section.title}
                </AppText>
                {section.items.map((item, itemIndex) => (
                  <View
                    key={item.label}
                    style={[
                      styles.item,
                      index === 0 && itemIndex === 0 && styles.itemFirst,
                      item.highlighted && styles.itemHighlighted,
                    ]}
                    accessible
                    accessibilityRole="menuitem"
                    accessibilityLabel={item.label}
                    accessibilityState={{ disabled: true }}
                  >
                    <Icon
                      name={item.icon}
                      color={item.highlighted ? 'onPositive' : 'textSecondary'}
                    />
                    <AppText
                      variant="label"
                      color={item.highlighted ? 'onPositive' : 'textSecondary'}
                    >
                      {item.label}
                    </AppText>
                  </View>
                ))}
              </View>
            ))}
          </View>

          <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.lg }]}>
            {/* Disabled while closed, so an off-screen drawer can never sign the user out. */}
            <Pressable
              disabled={!isOpen}
              onPress={() => {
                close();
                void signOut();
              }}
              accessibilityRole="button"
              accessibilityLabel="Sign out"
              style={({ pressed }) => [styles.signOut, pressed && styles.signOutPressed]}
            >
              <Icon name="logout" color="textPrimary" />
              <AppText variant="label">Sign Out</AppText>
            </Pressable>
          </View>
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  scrim: { ...StyleSheet.absoluteFill, backgroundColor: '#000000' },
  panel: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    width: WIDTH,
    backgroundColor: colors.surfaceRaised,
    shadowColor: '#000000',
    shadowOpacity: 0.1,
    shadowRadius: 25,
    shadowOffset: { width: 0, height: 20 },
    elevation: 16,
  },
  profile: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xl,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.outline,
  },
  avatar: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.lg,
    backgroundColor: colors.positiveStrong,
  },
  name: { marginBottom: -1, maxWidth: WIDTH - 48 - spacing.lg - spacing.xl * 2 },
  nav: { flex: 1, alignItems: 'center', paddingVertical: spacing.lg },
  sectionTitle: {
    width: WIDTH,
    paddingHorizontal: spacing.lg,
    paddingTop: 8.5,
    paddingBottom: 4.5,
    opacity: 0.5,
  },
  sectionTitleSpaced: { paddingTop: 32.5, paddingBottom: 12.5 },
  item: {
    alignSelf: 'center',
    width: WIDTH - spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.sm,
    borderRadius: radius.lg,
  },
  itemFirst: { paddingTop: spacing.lg },
  itemHighlighted: { backgroundColor: colors.positiveStrong },
  footer: {
    paddingTop: spacing.lg,
    paddingHorizontal: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.outline,
  },
  signOut: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    borderRadius: radius.sm,
    backgroundColor: withAlpha(colors.surfaceBright, 0.5),
  },
  signOutPressed: { backgroundColor: colors.surfaceBright },
});

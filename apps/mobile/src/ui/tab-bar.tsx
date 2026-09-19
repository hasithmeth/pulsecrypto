import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { Tabs } from 'expo-router';
import type { ComponentProps } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText } from './app-text';
import { colors, layout, radius, spacing, withAlpha } from './theme';

type IconName = ComponentProps<typeof MaterialCommunityIcons>['name'];
type TabBarProps = Parameters<NonNullable<ComponentProps<typeof Tabs>['tabBar']>>[0];

const ICONS: Readonly<Record<string, IconName>> = {
  index: 'chart-line',
  terminal: 'console',
  telemetry: 'speedometer',
};

export function TabBar({ state, descriptors, navigation }: TabBarProps) {
  const { bottom } = useSafeAreaInsets();

  return (
    <View style={[styles.bar, { paddingBottom: bottom, height: layout.tabBarHeight + bottom }]}>
      {state.routes.map((route, index) => {
        const focused = state.index === index;
        const title = descriptors[route.key]?.options.title ?? route.name;
        const tone = focused ? 'positive' : 'textSecondary';

        const onPress = (): void => {
          const event = navigation.emit({
            type: 'tabPress',
            target: route.key,
            canPreventDefault: true,
          });
          if (!focused && !event.defaultPrevented) navigation.navigate(route.name, route.params);
        };

        return (
          <Pressable
            key={route.key}
            onPress={onPress}
            accessibilityRole="tab"
            accessibilityLabel={title}
            accessibilityState={{ selected: focused }}
            style={styles.slot}
          >
            <View style={[styles.item, focused && styles.itemFocused]}>
              <MaterialCommunityIcons
                name={ICONS[route.name] ?? 'circle-outline'}
                size={20}
                color={colors[tone]}
              />
              <AppText variant="label" color={tone}>
                {title}
              </AppText>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.outline,
  },
  slot: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  item: {
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xs,
    borderRadius: radius.lg,
  },
  itemFocused: { backgroundColor: withAlpha(colors.positiveStrong, 0.1) },
});

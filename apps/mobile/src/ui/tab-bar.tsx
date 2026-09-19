import type { Tabs } from 'expo-router';
import type { ComponentProps } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText } from './app-text';
import { Icon, type IconName } from './icon';
import { colors, layout, radius, withAlpha } from './theme';

type TabBarProps = Parameters<NonNullable<ComponentProps<typeof Tabs>['tabBar']>>[0];

const ICONS: Readonly<Record<string, IconName>> = {
  index: 'terminal',
  markets: 'markets',
  telemetry: 'telemetry',
  settings: 'settings',
};

const ACTIVE_SCALE = 1.1;

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
            hitSlop={8}
            accessibilityRole="tab"
            accessibilityLabel={title}
            accessibilityState={{ selected: focused }}
            style={[styles.item, focused && styles.itemFocused]}
          >
            <Icon name={ICONS[route.name] ?? 'terminal'} color={tone} />
            <AppText variant="label" color={tone}>
              {title}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 15,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.outline,
  },
  item: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingVertical: 4,
    borderRadius: radius.lg,
  },
  itemFocused: {
    backgroundColor: withAlpha(colors.positiveStrong, 0.1),
    transform: [{ scale: ACTIVE_SCALE }],
  },
});

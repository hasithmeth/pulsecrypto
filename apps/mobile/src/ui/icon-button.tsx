import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { colors, radius, type ColorToken } from './theme';

interface IconButtonProps {
  readonly icon: ComponentProps<typeof MaterialCommunityIcons>['name'];
  readonly label: string;
  readonly onPress: () => void;
  readonly color?: ColorToken;
  readonly size?: number;
  readonly selected?: boolean;
}

export function IconButton({
  icon,
  label,
  onPress,
  color = 'positive',
  size = 22,
  selected,
}: IconButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={10}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={selected === undefined ? undefined : { selected }}
      style={({ pressed }) => [styles.button, pressed && styles.pressed]}
    >
      <MaterialCommunityIcons name={icon} size={size} color={colors[color]} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.lg,
  },
  pressed: { backgroundColor: colors.surfaceBright },
});

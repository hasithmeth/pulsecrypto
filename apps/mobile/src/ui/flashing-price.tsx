import { useEffect, useRef } from 'react';
import type { StyleProp, TextStyle } from 'react-native';
import Animated, {
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { colors, typography, type ColorToken, type TypographyVariant } from './theme';

interface FlashingPriceProps {
  readonly value: number | undefined;
  readonly text: string;
  readonly variant?: TypographyVariant;
  readonly restingColor?: ColorToken;
  readonly style?: StyleProp<TextStyle>;
}

const FLASH_DURATION_MS = 650;

/**
 * Flashes green on an uptick and red on a downtick. React only re-renders for
 * the new text; the fade runs on the UI thread, so a busy JS thread cannot make
 * the highlight stutter.
 */
export function FlashingPrice({
  value,
  text,
  variant = 'mono',
  restingColor = 'textPrimary',
  style,
}: FlashingPriceProps) {
  const intensity = useSharedValue(0);
  const direction = useSharedValue(0);
  const previous = useRef(value);

  useEffect(() => {
    const last = previous.current;
    previous.current = value;
    if (last === undefined || value === undefined || value === last) return;

    direction.set(value > last ? 1 : -1);
    intensity.set(1);
    intensity.set(withTiming(0, { duration: FLASH_DURATION_MS }));
  }, [value, direction, intensity]);

  const resting = colors[restingColor];
  const animatedStyle = useAnimatedStyle(() => ({
    color: interpolateColor(
      intensity.get(),
      [0, 1],
      [resting, direction.get() >= 0 ? colors.positive : colors.negative],
    ),
  }));

  return (
    <Animated.Text style={[typography[variant], animatedStyle, style]} numberOfLines={1}>
      {text}
    </Animated.Text>
  );
}

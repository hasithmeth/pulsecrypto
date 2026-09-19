import { useEffect } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import Animated, {
  interpolate,
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { colors } from './theme';

interface ToggleProps {
  readonly value: boolean;
  readonly onChange: (value: boolean) => void;
  readonly label: string;
}

const TRACK_WIDTH = 44;
const TRACK_HEIGHT = 24;
const THUMB_SIZE = 20;
const INSET = 2;
const OFF_BORDER = '#D1D5DB';

export function Toggle({ value, onChange, label }: ToggleProps) {
  const progress = useSharedValue(value ? 1 : 0);

  useEffect(() => {
    progress.set(withTiming(value ? 1 : 0, { duration: 160 }));
  }, [value, progress]);

  const trackStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(
      progress.get(),
      [0, 1],
      [colors.surfaceBright, colors.positive],
    ),
  }));
  const thumbStyle = useAnimatedStyle(() => ({
    borderColor: interpolateColor(progress.get(), [0, 1], [OFF_BORDER, '#FFFFFF']),
    transform: [
      {
        translateX: interpolate(progress.get(), [0, 1], [0, TRACK_WIDTH - THUMB_SIZE - INSET * 2]),
      },
    ],
  }));

  return (
    <Pressable
      onPress={() => {
        onChange(!value);
      }}
      hitSlop={10}
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityState={{ checked: value }}
    >
      <Animated.View style={[styles.track, trackStyle]}>
        <Animated.View style={[styles.thumb, thumbStyle]} />
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  track: { width: TRACK_WIDTH, height: TRACK_HEIGHT, borderRadius: TRACK_HEIGHT / 2 },
  thumb: {
    position: 'absolute',
    top: INSET,
    left: INSET,
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: THUMB_SIZE / 2,
    borderWidth: 1,
    backgroundColor: '#FFFFFF',
  },
});

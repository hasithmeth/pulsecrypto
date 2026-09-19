import { useState } from 'react';
import { StyleSheet, View, type AccessibilityActionEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { colors, radius } from './theme';

interface SliderProps {
  readonly value: number;
  readonly minimum: number;
  readonly maximum: number;
  readonly step: number;
  readonly label: string;
  /** Fires continuously while dragging, for live feedback. */
  readonly onChange?: (value: number) => void;
  /** Fires once when the gesture ends. */
  readonly onCommit: (value: number) => void;
}

const THUMB_SIZE = 16;
const TRACK_HEIGHT = 4;
const TOUCH_HEIGHT = 32;

export function Slider({ value, minimum, maximum, step, label, onChange, onCommit }: SliderProps) {
  const [width, setWidth] = useState(0);
  const [dragging, setDragging] = useState<number | null>(null);
  const travel = Math.max(0, width - THUMB_SIZE);
  const shown = dragging ?? value;
  const ratio = maximum > minimum ? (shown - minimum) / (maximum - minimum) : 0;

  const toValue = (x: number): number => {
    const raw = minimum + (travel > 0 ? (x - THUMB_SIZE / 2) / travel : 0) * (maximum - minimum);
    return Math.min(maximum, Math.max(minimum, Math.round(raw / step) * step));
  };

  const move = (x: number): void => {
    const next = toValue(x);
    setDragging(next);
    onChange?.(next);
  };
  const release = (x: number): void => {
    setDragging(null);
    onCommit(toValue(x));
  };

  // The gesture runs on the JS thread on purpose: a settings slider moves rarely,
  // and keeping it off worklets keeps the value maths in one ordinary function.
  const gesture = Gesture.Pan()
    .runOnJS(true)
    .minDistance(0)
    .onBegin((event) => {
      move(event.x);
    })
    .onUpdate((event) => {
      move(event.x);
    })
    .onEnd((event) => {
      release(event.x);
    })
    .onFinalize((_event, success) => {
      if (!success) setDragging(null);
    });

  const onAccessibilityAction = ({ nativeEvent }: AccessibilityActionEvent): void => {
    const delta = nativeEvent.actionName === 'increment' ? step : -step;
    onCommit(Math.min(maximum, Math.max(minimum, value + delta)));
  };

  return (
    <GestureDetector gesture={gesture}>
      <View
        style={styles.touchArea}
        onLayout={(event) => {
          setWidth(event.nativeEvent.layout.width);
        }}
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={label}
        accessibilityValue={{ min: minimum, max: maximum, now: shown }}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={onAccessibilityAction}
      >
        <View style={styles.track} />
        <View style={[styles.thumb, { left: ratio * travel }]} />
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  touchArea: { height: TOUCH_HEIGHT, justifyContent: 'center' },
  track: { height: TRACK_HEIGHT, borderRadius: radius.sm, backgroundColor: colors.surfaceBright },
  thumb: {
    position: 'absolute',
    top: (TOUCH_HEIGHT - THUMB_SIZE) / 2,
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: THUMB_SIZE / 2,
    backgroundColor: colors.positive,
    shadowColor: colors.positive,
    shadowOpacity: 0.5,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 0 },
    elevation: 6,
  },
});

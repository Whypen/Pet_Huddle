import { useMemo, useRef, useState } from "react";
import { PanResponder, StyleSheet, Text, View, type GestureResponderEvent, type LayoutChangeEvent, type PanResponderGestureState } from "react-native";
import { huddleColors, huddleSpacing } from "../theme/huddleDesignTokens";

type RangeProps = {
  min: number;
  max: number;
  values: [number, number];
  suffix?: string;
  step?: number;
  onChange: (values: [number, number]) => void;
};

type SingleProps = {
  min: number;
  max: number;
  value: number;
  suffix?: string;
  step?: number;
  showValue?: boolean;
  thumbSize?: number;
  onChange: (value: number) => void;
};

const THUMB = 28;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const normalizeStep = (step?: number) => (typeof step === "number" && Number.isFinite(step) && step > 0 ? step : 1);

const roundToStep = (value: number, min: number, max: number, step?: number) => {
  const normalizedStep = normalizeStep(step);
  const stepped = Math.round((value - min) / normalizedStep) * normalizedStep + min;
  const precision = normalizedStep < 1 ? 100 : 1;
  return clamp(Math.round(stepped * precision) / precision, min, max);
};

const valueFromX = (x: number, width: number, min: number, max: number, step?: number) => {
  if (width <= 0) return min;
  const ratio = clamp(x / width, 0, 1);
  return roundToStep(min + ratio * (max - min), min, max, step);
};

const xFromValue = (value: number, width: number, min: number, max: number) => {
  if (max <= min || width <= 0) return 0;
  return ((clamp(value, min, max) - min) / (max - min)) * width;
};

export function HuddleRangeControl({ min, max, values, suffix = "", step = 1, onChange }: RangeProps) {
  const [width, setWidth] = useState(0);
  const [trackX, setTrackX] = useState(0);
  const trackRef = useRef<View | null>(null);
  const [low, high] = values;

  const lowX = xFromValue(low, width, min, max);
  const highX = xFromValue(high, width, min, max);

  const measureTrack = () => {
    trackRef.current?.measureInWindow((x, _y, measuredWidth) => {
      setTrackX(x);
      if (measuredWidth > 0) setWidth(measuredWidth);
    });
  };

  const valueFromPageX = (pageX: number) => valueFromX(pageX - trackX, width, min, max, step);

  const updateLow = (pageX: number) => {
    const next = clamp(valueFromPageX(pageX), min, high);
    onChange([next, high]);
  };

  const updateHigh = (pageX: number) => {
    const next = clamp(valueFromPageX(pageX), low, max);
    onChange([low, next]);
  };

  const lowPan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (event: GestureResponderEvent) => updateLow(event.nativeEvent.pageX),
        onPanResponderMove: (_event: GestureResponderEvent, gesture: PanResponderGestureState) => updateLow(gesture.moveX),
      }),
    [high, max, min, onChange, step, trackX, width],
  );

  const highPan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (event: GestureResponderEvent) => updateHigh(event.nativeEvent.pageX),
        onPanResponderMove: (_event: GestureResponderEvent, gesture: PanResponderGestureState) => updateHigh(gesture.moveX),
      }),
    [low, max, min, onChange, step, trackX, width],
  );

  return (
    <View style={styles.wrap}>
      <Text style={styles.value}>
        {low}{suffix} – {high}{suffix}
      </Text>
      <View
        ref={trackRef}
        style={styles.trackWrap}
        onLayout={(event: LayoutChangeEvent) => {
          setWidth(event.nativeEvent.layout.width);
          requestAnimationFrame(measureTrack);
        }}
      >
        <View style={styles.track} />
        <View style={[styles.activeTrack, { left: lowX, width: Math.max(0, highX - lowX) }]} />
        <View {...lowPan.panHandlers} style={[styles.thumb, { left: lowX - THUMB / 2 }]} />
        <View {...highPan.panHandlers} style={[styles.thumb, { left: highX - THUMB / 2 }]} />
      </View>
    </View>
  );
}

export function HuddleSingleRangeControl({ min, max, value, suffix = "", step = 1, showValue = true, thumbSize = THUMB, onChange }: SingleProps) {
  const [width, setWidth] = useState(0);
  const [trackX, setTrackX] = useState(0);
  const trackRef = useRef<View | null>(null);
  const x = xFromValue(value, width, min, max);

  const measureTrack = () => {
    trackRef.current?.measureInWindow((trackLeft, _y, measuredWidth) => {
      setTrackX(trackLeft);
      if (measuredWidth > 0) setWidth(measuredWidth);
    });
  };

  const updateValueFromLocalX = (localX: number) => {
    onChange(valueFromX(localX, width, min, max, step));
  };

  const pan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onStartShouldSetPanResponderCapture: () => true,
        onMoveShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponderCapture: () => true,
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: (event: GestureResponderEvent) => updateValueFromLocalX(event.nativeEvent.locationX),
        onPanResponderMove: (event: GestureResponderEvent) => updateValueFromLocalX(event.nativeEvent.locationX),
      }),
    [max, min, onChange, step, width],
  );

  return (
    <View style={styles.wrap}>
      {showValue ? <Text style={styles.value}>{value}{suffix}</Text> : null}
      <View
        {...pan.panHandlers}
        ref={trackRef}
        style={styles.trackWrap}
        onLayout={(event: LayoutChangeEvent) => {
          setWidth(event.nativeEvent.layout.width);
          requestAnimationFrame(measureTrack);
        }}
      >
        <View style={styles.track} />
        <View style={[styles.activeTrack, { left: 0, width: x }]} />
        <View
          pointerEvents="none"
          style={[
            styles.thumb,
            {
              left: x - thumbSize / 2,
              width: thumbSize,
              height: thumbSize,
              borderRadius: thumbSize / 2,
              borderWidth: thumbSize <= 18 ? 2 : 3,
              top: (36 - thumbSize) / 2,
            },
          ]}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: huddleSpacing.x3,
    paddingVertical: huddleSpacing.x2,
  },
  value: {
    color: huddleColors.text,
    fontFamily: "Urbanist-700",
    fontSize: 14,
  },
  trackWrap: {
    height: 36,
    justifyContent: "center",
  },
  track: {
    height: 5,
    borderRadius: 999,
    backgroundColor: huddleColors.glassControl,
  },
  activeTrack: {
    position: "absolute",
    height: 5,
    borderRadius: 999,
    backgroundColor: huddleColors.blue,
  },
  thumb: {
    position: "absolute",
    top: 4,
    width: THUMB,
    height: THUMB,
    borderRadius: THUMB / 2,
    backgroundColor: "#FFFFFF",
    borderWidth: 3,
    borderColor: huddleColors.blue,
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
  },
});

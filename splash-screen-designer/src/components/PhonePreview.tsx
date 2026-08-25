import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Image, Animated, Easing } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { SplashConfig } from '../types';

const ICON_MAP: Record<string, keyof typeof Ionicons.glyphMap> = {
  rocket: 'rocket',
  leaf: 'leaf',
  coffee: 'cafe',
  bolt: 'flash',
  shield: 'shield-checkmark',
  star: 'star',
  heart: 'heart',
  cloud: 'cloud',
};

function gradientPoints(direction: SplashConfig['gradientDirection']) {
  switch (direction) {
    case 'bottom-top':
      return { start: { x: 0, y: 1 }, end: { x: 0, y: 0 } };
    case 'left-right':
      return { start: { x: 0, y: 0 }, end: { x: 1, y: 0 } };
    case 'diagonal':
      return { start: { x: 0, y: 0 }, end: { x: 1, y: 1 } };
    case 'top-bottom':
    default:
      return { start: { x: 0, y: 0 }, end: { x: 0, y: 1 } };
  }
}

function Spinner({ style, color }: { style: SplashConfig['spinner']; color: string }) {
  const spin = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (style === 'ring') {
      Animated.loop(
        Animated.timing(spin, {
          toValue: 1,
          duration: 900,
          easing: Easing.linear,
          useNativeDriver: true,
        })
      ).start();
    }
  }, [style]);

  if (style === 'none') return null;

  if (style === 'dots') {
    return (
      <View style={styles.dotsRow}>
        {[0, 1, 2].map((i) => (
          <View key={i} style={[styles.dot, { backgroundColor: color, opacity: 0.4 + i * 0.3 }]} />
        ))}
      </View>
    );
  }

  if (style === 'bar') {
    return (
      <View style={styles.barTrack}>
        <View style={[styles.barFill, { backgroundColor: color }]} />
      </View>
    );
  }

  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  return (
    <Animated.View
      style={[
        styles.ring,
        { borderTopColor: color, transform: [{ rotate }] },
      ]}
    />
  );
}

export default function PhonePreview({ config }: { config: SplashConfig }) {
  const { start, end } = gradientPoints(config.gradientDirection);
  const iconName = config.icon.kind === 'preset' ? ICON_MAP[config.icon.name] : null;

  const Background = ({ children }: { children: React.ReactNode }) =>
    config.backgroundMode === 'gradient' ? (
      <LinearGradient
        colors={config.gradientColors}
        start={start}
        end={end}
        style={styles.screen}
      >
        {children}
      </LinearGradient>
    ) : (
      <View style={[styles.screen, { backgroundColor: config.backgroundColor }]}>{children}</View>
    );

  return (
    <View style={styles.phoneFrame}>
      <View style={styles.notch} />
      <Background>
        <View style={styles.content}>
          {config.icon.kind === 'custom' ? (
            <Image
              source={{ uri: config.icon.uri }}
              style={{ width: config.iconSize, height: config.iconSize, borderRadius: config.cornerRadius }}
              resizeMode="cover"
            />
          ) : (
            <Ionicons name={iconName!} size={config.iconSize} color={config.accentColor} />
          )}

          {config.showBrandDivider && (
            <View style={[styles.divider, { backgroundColor: config.accentColor }]} />
          )}

          <Text style={[styles.title, { color: config.titleColor, fontWeight: config.titleWeight as any }]}>
            {config.appTitle || 'Mi App'}
          </Text>
          <Text style={[styles.subtitle, { color: config.subtitleColor }]}>
            {config.subtitle}
          </Text>

          <View style={styles.spinnerWrap}>
            <Spinner style={config.spinner} color={config.accentColor} />
          </View>
        </View>
      </Background>
    </View>
  );
}

const styles = StyleSheet.create({
  phoneFrame: {
    width: 260,
    height: 540,
    borderRadius: 36,
    borderWidth: 8,
    borderColor: '#1F2937',
    overflow: 'hidden',
    backgroundColor: '#000',
    alignSelf: 'center',
  },
  notch: {
    position: 'absolute',
    top: 10,
    left: '50%',
    marginLeft: -30,
    width: 60,
    height: 5,
    borderRadius: 3,
    backgroundColor: '#E5E7EB',
    zIndex: 10,
  },
  screen: { flex: 1 },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  divider: { width: 36, height: 3, borderRadius: 2, marginTop: 14, marginBottom: 2 },
  title: { fontSize: 22, marginTop: 16 },
  subtitle: { fontSize: 14, marginTop: 6 },
  spinnerWrap: { marginTop: 26, height: 20, justifyContent: 'center' },
  dotsRow: { flexDirection: 'row', gap: 8 },
  dot: { width: 8, height: 8, borderRadius: 4, marginHorizontal: 4 },
  barTrack: { width: 80, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.15)', overflow: 'hidden' },
  barFill: { width: '55%', height: '100%', borderRadius: 2 },
  ring: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.2)',
  },
});

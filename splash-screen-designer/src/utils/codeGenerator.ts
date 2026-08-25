import { SplashConfig } from '../types';

const ICON_MAP: Record<string, string> = {
  rocket: 'rocket',
  leaf: 'leaf',
  coffee: 'cafe',
  bolt: 'flash',
  shield: 'shield-checkmark',
  star: 'star',
  heart: 'heart',
  cloud: 'cloud',
};

function gradientPointsLiteral(direction: SplashConfig['gradientDirection']) {
  switch (direction) {
    case 'bottom-top':
      return { start: '{ x: 0, y: 1 }', end: '{ x: 0, y: 0 }' };
    case 'left-right':
      return { start: '{ x: 0, y: 0 }', end: '{ x: 1, y: 0 }' };
    case 'diagonal':
      return { start: '{ x: 0, y: 0 }', end: '{ x: 1, y: 1 }' };
    case 'top-bottom':
    default:
      return { start: '{ x: 0, y: 0 }', end: '{ x: 0, y: 1 }' };
  }
}

/**
 * Generates the full source of a drop-in SplashScreen.tsx component,
 * ready to paste into any React Native / Expo project.
 */
export function generateSplashTSX(config: SplashConfig): string {
  const isGradient = config.backgroundMode === 'gradient';
  const iconIsCustom = config.icon.kind === 'custom';
  const iconGlyph = config.icon.kind === 'preset' ? ICON_MAP[config.icon.name] : 'rocket';
  const { start, end } = gradientPointsLiteral(config.gradientDirection);

  const imports = [
    `import React from 'react';`,
    `import { View, Text, StyleSheet, Image${config.spinner === 'dots' ? '' : ''} } from 'react-native';`,
    isGradient ? `import { LinearGradient } from 'expo-linear-gradient';` : null,
    !iconIsCustom ? `import { Ionicons } from '@expo/vector-icons';` : null,
    config.spinner !== 'none' ? `import LoadingIndicator from './LoadingIndicator';` : null,
  ]
    .filter(Boolean)
    .join('\n');

  const iconBlock = iconIsCustom
    ? `        <Image
          source={require('${config.icon.kind === 'custom' ? './assets/splash-icon.png' : ''}')}
          style={styles.icon}
          resizeMode="cover"
        />`
    : `        <Ionicons name="${iconGlyph}" size={${config.iconSize}} color="${config.accentColor}" />`;

  const dividerBlock = config.showBrandDivider
    ? `        <View style={styles.divider} />\n`
    : '';

  const bodyContent = `      <View style={styles.content}>
${iconBlock}
${dividerBlock}        <Text style={styles.title}>${JSON.stringify(config.appTitle)}</Text>
        <Text style={styles.subtitle}>${JSON.stringify(config.subtitle)}</Text>
${config.spinner !== 'none' ? `        <View style={styles.spinnerWrap}>\n          <LoadingIndicator style="${config.spinner}" color="${config.accentColor}" />\n        </View>\n` : ''}      </View>`;

  const wrapper = isGradient
    ? `    <LinearGradient
      colors={['${config.gradientColors[0]}', '${config.gradientColors[1]}']}
      start={${start}}
      end={${end}}
      style={styles.screen}
    >
${bodyContent}
    </LinearGradient>`
    : `    <View style={styles.screen}>
${bodyContent}
    </View>`;

  return `${imports}

export default function SplashScreen() {
  return (
${wrapper}
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    ${isGradient ? '' : `backgroundColor: '${config.backgroundColor}',`}
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  icon: {
    width: ${config.iconSize},
    height: ${config.iconSize},
    borderRadius: ${config.cornerRadius},
  },
  divider: {
    width: 36,
    height: 3,
    borderRadius: 2,
    backgroundColor: '${config.accentColor}',
    marginTop: 14,
    marginBottom: 2,
  },
  title: {
    fontSize: 22,
    fontWeight: '${config.titleWeight}',
    color: '${config.titleColor}',
    marginTop: 16,
  },
  subtitle: {
    fontSize: 14,
    color: '${config.subtitleColor}',
    marginTop: 6,
  },
  spinnerWrap: {
    marginTop: 26,
    height: 20,
    justifyContent: 'center',
  },
});
`;
}

/**
 * Generates the companion LoadingIndicator.tsx, only needed when
 * a spinner style other than "none" was selected.
 */
export function generateLoadingIndicatorTSX(): string {
  return `import React, { useEffect, useRef } from 'react';
import { View, Animated, Easing, StyleSheet } from 'react-native';

type SpinnerStyle = 'dots' | 'ring' | 'bar' | 'none';

export default function LoadingIndicator({
  style,
  color,
}: {
  style: SpinnerStyle;
  color: string;
}) {
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
  return <Animated.View style={[styles.ring, { borderTopColor: color, transform: [{ rotate }] }]} />;
}

const styles = StyleSheet.create({
  dotsRow: { flexDirection: 'row' },
  dot: { width: 8, height: 8, borderRadius: 4, marginHorizontal: 4 },
  barTrack: {
    width: 80,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.15)',
    overflow: 'hidden',
  },
  barFill: { width: '55%', height: '100%', borderRadius: 2 },
  ring: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.2)',
  },
});
`;
}

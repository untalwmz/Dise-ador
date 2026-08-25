export type BackgroundMode = 'solid' | 'gradient';

export type GradientDirection =
  | 'top-bottom'
  | 'bottom-top'
  | 'left-right'
  | 'diagonal';

export type SpinnerStyle = 'dots' | 'ring' | 'bar' | 'none';

export type IconSource =
  | { kind: 'preset'; name: PresetIconName }
  | { kind: 'custom'; uri: string };

export type PresetIconName =
  | 'rocket'
  | 'leaf'
  | 'coffee'
  | 'bolt'
  | 'shield'
  | 'star'
  | 'heart'
  | 'cloud';

export type FontWeight = '400' | '500' | '600' | '700' | '800';

export interface SplashConfig {
  appTitle: string;
  subtitle: string;

  backgroundMode: BackgroundMode;
  backgroundColor: string;
  gradientColors: [string, string];
  gradientDirection: GradientDirection;

  accentColor: string;
  titleColor: string;
  subtitleColor: string;
  titleWeight: FontWeight;

  icon: IconSource;
  iconSize: number;

  spinner: SpinnerStyle;

  cornerRadius: number;
  showBrandDivider: boolean;
}

export const DEFAULT_CONFIG: SplashConfig = {
  appTitle: 'Mi App',
  subtitle: 'Cargando...',
  backgroundMode: 'solid',
  backgroundColor: '#0B0F19',
  gradientColors: ['#0B0F19', '#152238'],
  gradientDirection: 'top-bottom',
  accentColor: '#38BDF8',
  titleColor: '#F8FAFC',
  subtitleColor: '#94A3B8',
  titleWeight: '700',
  icon: { kind: 'preset', name: 'rocket' },
  iconSize: 64,
  spinner: 'dots',
  cornerRadius: 0,
  showBrandDivider: false,
};

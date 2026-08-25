import { PresetIconName, GradientDirection, SpinnerStyle } from '../types';

export const SWATCHES: string[] = [
  '#0B0F19',
  '#111827',
  '#1E293B',
  '#152238',
  '#0F172A',
  '#38BDF8',
  '#818CF8',
  '#A78BFA',
  '#F472B6',
  '#FB7185',
  '#FBBF24',
  '#34D399',
  '#F8FAFC',
  '#94A3B8',
];

export const GRADIENT_PRESETS: { label: string; colors: [string, string] }[] = [
  { label: 'Noche profunda', colors: ['#0B0F19', '#1E293B'] },
  { label: 'Café / Finca', colors: ['#241608', '#6B3F17'] },
  { label: 'Aurora', colors: ['#312E81', '#0EA5E9'] },
  { label: 'Atardecer', colors: ['#7C2D12', '#F59E0B'] },
  { label: 'Bosque', colors: ['#022C22', '#059669'] },
  { label: 'Fucsia', colors: ['#4C0519', '#EC4899'] },
];

export const ICON_NAMES: PresetIconName[] = [
  'rocket',
  'leaf',
  'coffee',
  'bolt',
  'shield',
  'star',
  'heart',
  'cloud',
];

export const GRADIENT_DIRECTIONS: { label: string; value: GradientDirection }[] = [
  { label: 'Arriba → Abajo', value: 'top-bottom' },
  { label: 'Abajo → Arriba', value: 'bottom-top' },
  { label: 'Izq → Der', value: 'left-right' },
  { label: 'Diagonal', value: 'diagonal' },
];

export const SPINNER_STYLES: { label: string; value: SpinnerStyle }[] = [
  { label: 'Puntos', value: 'dots' },
  { label: 'Anillo', value: 'ring' },
  { label: 'Barra', value: 'bar' },
  { label: 'Ninguno', value: 'none' },
];

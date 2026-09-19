import type { TextStyle } from 'react-native';

export const colors = {
  background: '#0B1420',
  backgroundDeep: '#0B0E14',
  header: '#060E1B',
  surface: '#141C28',
  surfaceRaised: '#18202D',
  surfaceMuted: '#1E2633',
  surfaceOverlay: '#222A37',
  surfaceBright: '#2D3543',
  outline: '#45474B',
  textPrimary: '#DBE3F4',
  textSecondary: '#C6C6CB',
  textMuted: '#909095',
  positive: '#3FE092',
  positiveStrong: '#00C479',
  onPositive: '#004A2A',
  negative: '#EA295B',
  accent: '#FFB2BA',
} as const;

export type ColorToken = keyof typeof colors;

export const withAlpha = (hex: string, alpha: number): string => {
  const channel = (offset: number): number => parseInt(hex.slice(offset, offset + 2), 16);
  return `rgba(${channel(1)}, ${channel(3)}, ${channel(5)}, ${alpha})`;
};

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;

export const radius = { xs: 2, sm: 4, md: 8, lg: 12, pill: 999 } as const;

export const layout = { headerHeight: 56, tabBarHeight: 64, bookRowHeight: 32 } as const;

export const fonts = {
  headline: 'HankenGrotesk_400Regular',
  body: 'Inter_400Regular',
  mono: 'JetBrainsMono_500Medium',
  monoRegular: 'JetBrainsMono_400Regular',
} as const;

const tabular: TextStyle = { fontVariant: ['tabular-nums'] };

export const typography = {
  display: {
    fontFamily: fonts.headline,
    fontSize: 32,
    lineHeight: 38,
    letterSpacing: -0.64,
    ...tabular,
  },
  title: { fontFamily: fonts.headline, fontSize: 24, lineHeight: 31 },
  heading: { fontFamily: fonts.headline, fontSize: 20, lineHeight: 28 },
  body: { fontFamily: fonts.body, fontSize: 14, lineHeight: 21 },
  caption: { fontFamily: fonts.body, fontSize: 12, lineHeight: 17 },
  label: { fontFamily: fonts.body, fontSize: 11, lineHeight: 14, letterSpacing: 0.55 },
  monoDisplay: { fontFamily: fonts.mono, fontSize: 32, lineHeight: 38, letterSpacing: -0.64 },
  monoLg: { fontFamily: fonts.mono, fontSize: 16, lineHeight: 20 },
  mono: { fontFamily: fonts.mono, fontSize: 14, lineHeight: 18 },
  monoSm: { fontFamily: fonts.monoRegular, fontSize: 10, lineHeight: 12 },
} as const satisfies Record<string, TextStyle>;

export type TypographyVariant = keyof typeof typography;

import { Platform, type TextStyle } from 'react-native';

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

export const layout = {
  headerHeight: 56,
  tabBarHeight: 64,
  bookRowHeight: 32,
  drawerWidth: 320,
} as const;

export const fonts = {
  headlineSemiBold: 'HankenGrotesk_600SemiBold',
  headlineBold: 'HankenGrotesk_700Bold',
  body: 'Inter_400Regular',
  bodyBold: 'Inter_700Bold',
  monoRegular: 'JetBrainsMono_400Regular',
  mono: 'JetBrainsMono_500Medium',
  monoBold: 'JetBrainsMono_700Bold',
} as const;

/** Natural line height as a multiple of font size, read from each font's hhea table. */
const NATURAL_LINE = { inter: 1.21, hanken: 1.303, jetbrains: 1.32 } as const;

/**
 * The design often sets a line height at or below the font size (labels 11/11,
 * numbers 14/14), which the two platforms treat differently.
 *
 * Android honours the tight box once its default font padding is switched off.
 * iOS centres glyphs only when the line box is at least the font's natural
 * height; in a shorter box all the overflow goes upward, so text rides up into
 * whatever sits above it. There the text keeps its natural line box and negative
 * margins shrink its layout footprint back to the design's, which leaves the
 * glyphs centred in exactly the space Figma gives them.
 */
function line(fontSize: number, lineHeight: number, naturalRatio: number): TextStyle {
  const natural = Math.ceil(fontSize * naturalRatio);
  if (Platform.OS !== 'ios' || lineHeight >= natural)
    return { lineHeight, includeFontPadding: false };
  return { lineHeight: natural, marginVertical: (lineHeight - natural) / 2 };
}

/** Sizes, weights, line heights and tracking are taken verbatim from the Figma text styles. */
export const typography = {
  display: {
    fontFamily: fonts.headlineBold,
    fontSize: 32,
    letterSpacing: -0.64,
    fontVariant: ['tabular-nums'],
    ...line(32, 38.4, NATURAL_LINE.hanken),
  },
  screenTitle: {
    fontFamily: fonts.headlineSemiBold,
    fontSize: 24,
    ...line(24, 31.2, NATURAL_LINE.hanken),
  },
  headerTitle: {
    fontFamily: fonts.headlineBold,
    fontSize: 20,
    ...line(20, 28, NATURAL_LINE.hanken),
  },
  cardTitle: {
    fontFamily: fonts.headlineSemiBold,
    fontSize: 20,
    ...line(20, 28, NATURAL_LINE.hanken),
  },
  body: { fontFamily: fonts.body, fontSize: 14, ...line(14, 21, NATURAL_LINE.inter) },
  caption: { fontFamily: fonts.body, fontSize: 12, ...line(12, 16.8, NATURAL_LINE.inter) },
  label: {
    fontFamily: fonts.bodyBold,
    fontSize: 11,
    letterSpacing: 0.55,
    ...line(11, 11, NATURAL_LINE.inter),
  },
  monoDisplay: {
    fontFamily: fonts.monoBold,
    fontSize: 32,
    letterSpacing: -0.64,
    ...line(32, 38.4, NATURAL_LINE.jetbrains),
  },
  /** The gauge's number: same face as monoDisplay on the design's 32pt line. */
  monoDisplayTight: {
    fontFamily: fonts.monoBold,
    fontSize: 32,
    letterSpacing: -0.64,
    ...line(32, 32, NATURAL_LINE.jetbrains),
  },
  monoLg: { fontFamily: fonts.mono, fontSize: 16, ...line(16, 16, NATURAL_LINE.jetbrains) },
  mono: { fontFamily: fonts.mono, fontSize: 14, ...line(14, 14, NATURAL_LINE.jetbrains) },
  monoSm: { fontFamily: fonts.monoRegular, fontSize: 10, ...line(10, 10, NATURAL_LINE.jetbrains) },
} as const satisfies Record<string, TextStyle>;

export type TypographyVariant = keyof typeof typography;

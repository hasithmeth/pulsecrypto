import { Text, type TextProps } from 'react-native';
import { colors, typography, type ColorToken, type TypographyVariant } from './theme';

export interface AppTextProps extends TextProps {
  readonly variant?: TypographyVariant;
  readonly color?: ColorToken;
}

export function AppText({ variant = 'body', color = 'textPrimary', style, ...rest }: AppTextProps) {
  return <Text {...rest} style={[typography[variant], { color: colors[color] }, style]} />;
}

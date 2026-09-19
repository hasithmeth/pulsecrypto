import { StyleSheet, TextInput, View, type TextInputProps } from 'react-native';
import { AppText } from './app-text';
import { colors, spacing, typography } from './theme';

interface TextFieldProps extends Omit<TextInputProps, 'style' | 'placeholderTextColor'> {
  readonly label: string;
  readonly error?: string;
}

/** Same surface, border and monospace input as the design system's search field. */
export function TextField({ label, error, ...input }: TextFieldProps) {
  return (
    <View style={styles.field}>
      <AppText variant="label" color="textSecondary">
        {label.toUpperCase()}
      </AppText>
      <TextInput
        {...input}
        accessibilityLabel={label}
        placeholderTextColor={colors.textMuted}
        selectionColor={colors.positive}
        style={[styles.input, error ? styles.inputError : null]}
      />
      {error ? (
        <AppText variant="caption" color="negative" accessibilityLiveRegion="polite">
          {error}
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  field: { gap: spacing.sm },
  input: {
    ...typography.mono,
    lineHeight: undefined,
    height: 48,
    paddingHorizontal: spacing.lg,
    paddingVertical: 0,
    color: colors.textPrimary,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.outline,
  },
  inputError: { borderColor: colors.negative },
});

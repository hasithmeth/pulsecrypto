import { MaterialCommunityIcons } from '@expo/vector-icons';
import { StyleSheet, TextInput, View } from 'react-native';
import { IconButton } from '@/ui/icon-button';
import { colors, spacing, typography } from '@/ui/theme';

interface SearchFieldProps {
  readonly value: string;
  readonly onChangeText: (value: string) => void;
}

export function SearchField({ value, onChangeText }: SearchFieldProps) {
  return (
    <View style={styles.field}>
      <MaterialCommunityIcons name="magnify" size={20} color={colors.textSecondary} />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder="Search"
        placeholderTextColor={colors.textMuted}
        selectionColor={colors.positive}
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="search"
        clearButtonMode="never"
        accessibilityLabel="Search trading pairs"
        style={styles.input}
      />
      {value.length > 0 ? (
        <IconButton
          icon="close-circle"
          label="Clear search"
          color="textMuted"
          size={18}
          onPress={() => {
            onChangeText('');
          }}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    height: 48,
    paddingLeft: spacing.lg,
    paddingRight: spacing.xs,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.outline,
  },
  input: { ...typography.mono, flex: 1, color: colors.textPrimary, paddingVertical: 0 },
});

import { LoginRequestSchema, SignupRequestSchema } from '@pulsecrypto/contracts';
import { Link } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ApiError } from '@/core/api/http-client';
import { AppText } from '@/ui/app-text';
import { Button } from '@/ui/button';
import { Icon } from '@/ui/icon';
import { TextField } from '@/ui/text-field';
import { colors, radius, spacing } from '@/ui/theme';
import { useAuthStore } from './auth-store';

type Mode = 'signIn' | 'signUp';
type Field = 'displayName' | 'email' | 'password';
type FieldErrors = Partial<Record<Field, string>>;

const COPY = {
  signIn: {
    title: 'Sign in',
    subtitle: 'Your watchlist and stream settings follow your account.',
    submit: 'Sign in',
    switchPrompt: 'New to PulseCrypto?',
    switchLabel: 'Create an account',
    switchHref: '/sign-up',
  },
  signUp: {
    title: 'Create account',
    subtitle: 'Favourites, selected pair and throttling are saved per user.',
    submit: 'Create account',
    switchPrompt: 'Already have an account?',
    switchLabel: 'Sign in',
    switchHref: '/sign-in',
  },
} as const;

const MESSAGES: Readonly<Record<Field, string>> = {
  displayName: 'Use 2 to 40 characters',
  email: 'Enter a valid email address',
  password: 'Use at least 8 characters',
};

export function AuthScreen({ mode }: { mode: Mode }) {
  const insets = useSafeAreaInsets();
  const signIn = useAuthStore((state) => state.signIn);
  const signUp = useAuthStore((state) => state.signUp);
  const [values, setValues] = useState({ displayName: '', email: '', password: '' });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const copy = COPY[mode];

  const change = (field: Field) => (text: string) => {
    setValues((current) => ({ ...current, [field]: text }));
    setErrors((current) => ({ ...current, [field]: undefined }));
    setFormError(null);
  };

  const submit = async (): Promise<void> => {
    const parsed =
      mode === 'signUp'
        ? SignupRequestSchema.safeParse(values)
        : LoginRequestSchema.safeParse(values);
    if (!parsed.success) {
      const invalid = new Set(parsed.error.issues.map((issue) => issue.path[0] as Field));
      setErrors(Object.fromEntries([...invalid].map((field) => [field, MESSAGES[field]])));
      return;
    }

    setSubmitting(true);
    try {
      if (mode === 'signUp') await signUp(SignupRequestSchema.parse(values));
      else await signIn(parsed.data);
    } catch (error) {
      if (error instanceof ApiError && error.code === 'email_taken')
        setErrors({ email: error.message });
      else
        setFormError(
          error instanceof ApiError ? error.message : 'Something went wrong. Try again.',
        );
      setSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + spacing.xxl, paddingBottom: insets.bottom + spacing.xl },
        ]}
      >
        <View style={styles.brand}>
          <View style={styles.logo}>
            <Icon name="terminal" color="onPositive" />
          </View>
          <AppText variant="headerTitle">PulseCrypto</AppText>
        </View>

        <View style={styles.intro}>
          <AppText variant="screenTitle" accessibilityRole="header">
            {copy.title}
          </AppText>
          <AppText color="textSecondary">{copy.subtitle}</AppText>
        </View>

        <View style={styles.form}>
          {mode === 'signUp' ? (
            <TextField
              label="Display name"
              value={values.displayName}
              onChangeText={change('displayName')}
              error={errors.displayName}
              autoCapitalize="words"
              autoComplete="name"
              textContentType="name"
              returnKeyType="next"
            />
          ) : null}
          <TextField
            label="Email"
            value={values.email}
            onChangeText={change('email')}
            error={errors.email}
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="email"
            textContentType="emailAddress"
            keyboardType="email-address"
            returnKeyType="next"
          />
          <TextField
            label="Password"
            value={values.password}
            onChangeText={change('password')}
            error={errors.password}
            secureTextEntry
            autoCapitalize="none"
            autoComplete={mode === 'signUp' ? 'new-password' : 'current-password'}
            textContentType={mode === 'signUp' ? 'newPassword' : 'password'}
            returnKeyType="go"
            onSubmitEditing={() => void submit()}
          />
          {formError ? (
            <AppText variant="caption" color="negative" accessibilityRole="alert">
              {formError}
            </AppText>
          ) : null}
          <Button label={copy.submit} onPress={() => void submit()} loading={submitting} />
        </View>

        <View style={styles.switch}>
          <AppText variant="caption" color="textSecondary">
            {copy.switchPrompt}
          </AppText>
          <Link href={copy.switchHref} replace accessibilityRole="link">
            <AppText variant="caption" color="positive">
              {copy.switchLabel}
            </AppText>
          </Link>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.backgroundDeep },
  content: { flexGrow: 1, paddingHorizontal: spacing.xl, gap: spacing.xxl },
  brand: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  logo: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.lg,
    backgroundColor: colors.positiveStrong,
  },
  intro: { gap: spacing.sm },
  form: { gap: spacing.xl },
  switch: { flexDirection: 'row', justifyContent: 'center', gap: spacing.xs },
});

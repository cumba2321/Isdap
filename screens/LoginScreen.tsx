import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StatusBar as RNStatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import AuthHeader from '../components/AuthHeader';
import { styles } from '../styles';
import { AuthResult } from '../types';

type LoginScreenProps = {
  onSignIn: () => Promise<AuthResult>;
  onNavigateSignUp: () => void;
};

export default function LoginScreen({ onSignIn, onNavigateSignUp }: LoginScreenProps) {
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSignIn = async () => {
    setIsSubmitting(true);
    setError(null);
    try {
      const result = await onSignIn();
      if (!result.success) setError(result.error);
    } catch {
      setError('Unable to sign in right now. Check your connection and try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.safeArea}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <RNStatusBar barStyle="dark-content" />
      <ScrollView contentContainerStyle={screenStyles.scroll} keyboardShouldPersistTaps="handled">
        <AuthHeader />
        <View style={styles.authCard}>
          <Text style={styles.authCardTitle}>Sign in</Text>
          <Text style={styles.authCardSubtitle}>
            Sign in securely with the Google account linked to your IsdaApp account. No PIN or email code is needed.
          </Text>

          {error ? (
            <View style={screenStyles.errorBox} accessibilityRole="alert">
              <Text style={screenStyles.errorText}>{error}</Text>
            </View>
          ) : null}

          <Pressable
            onPress={handleSignIn}
            disabled={isSubmitting}
            style={({ pressed }) => [
              styles.primaryButton,
              screenStyles.mainButton,
              isSubmitting && styles.primaryButtonDisabled,
              pressed && styles.tabButtonPressed,
            ]}
            accessibilityRole="button"
          >
            <Text style={styles.primaryButtonText}>
              {isSubmitting ? 'Signing in…' : 'Continue with Google'}
            </Text>
          </Pressable>

          <Pressable
            onPress={onNavigateSignUp}
            style={({ pressed }) => [styles.secondaryButton, screenStyles.footerLink, pressed && styles.tabButtonPressed]}
          >
            <Text style={styles.secondaryButtonText}>Don’t have an account? Sign up</Text>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const screenStyles = StyleSheet.create({
  scroll: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 20,
    paddingVertical: 32,
  },
  mainButton: {
    marginTop: 16,
  },
  errorBox: {
    backgroundColor: '#FCEBEC',
    borderColor: '#C84F5B44',
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  errorText: {
    color: '#9D3944',
    fontSize: 12,
    lineHeight: 17,
  },
  footerLink: {
    marginTop: 16,
  },
});

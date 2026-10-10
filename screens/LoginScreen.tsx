import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StatusBar as RNStatusBar,
<<<<<<< HEAD
  Text,
  TextInput,
=======
  StyleSheet,
  Text,
>>>>>>> origin/main
  View,
} from 'react-native';
import AuthHeader from '../components/AuthHeader';
import { styles } from '../styles';
import { AuthResult } from '../types';

type LoginScreenProps = {
<<<<<<< HEAD
  onSignIn: (pin: string) => Promise<AuthResult>;
  onNavigateSignUp: () => void;
  onNavigateResetPin: () => void;
};

export default function LoginScreen({
  onSignIn,
  onNavigateSignUp,
  onNavigateResetPin,
}: LoginScreenProps) {
  const [pin, setPin] = useState('');
=======
  onSignIn: () => Promise<AuthResult>;
  onNavigateSignUp: () => void;
};

export default function LoginScreen({ onSignIn, onNavigateSignUp }: LoginScreenProps) {
>>>>>>> origin/main
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSignIn = async () => {
<<<<<<< HEAD
    if (!/^\d{4}$/.test(pin)) {
      setError('Enter your 4-digit PIN.');
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await onSignIn(pin);
      if (!result.success) {
        setError(result.error);
        return;
      }
      setError(null);
=======
    setIsSubmitting(true);
    setError(null);
    try {
      const result = await onSignIn();
      if (!result.success) setError(result.error);
>>>>>>> origin/main
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
<<<<<<< HEAD
      <RNStatusBar barStyle="light-content" />
      <ScrollView contentContainerStyle={styles.authScroll} keyboardShouldPersistTaps="handled">
        <AuthHeader />

        <View style={styles.authCard}>
          <Text style={styles.authCardTitle}>Sign In</Text>
          <Text style={styles.authCardSubtitle}>Continue with Google and enter your 4-digit PIN</Text>

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>4-DIGIT PIN</Text>
            <View style={styles.inputRow}>
              <TextInput
                value={pin}
                onChangeText={(value) => setPin(value.replace(/\D/g, '').slice(0, 4))}
                placeholder="Enter your PIN"
                placeholderTextColor="#4f6b6d"
                keyboardType="number-pad"
                secureTextEntry
                maxLength={4}
                style={styles.textInput}
              />
            </View>
            {error ? <Text style={styles.fieldErrorText}>{error}</Text> : null}
          </View>
=======
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
>>>>>>> origin/main

          <Pressable
            onPress={handleSignIn}
            disabled={isSubmitting}
            style={({ pressed }) => [
              styles.primaryButton,
<<<<<<< HEAD
              isSubmitting && styles.primaryButtonDisabled,
              pressed && styles.tabButtonPressed,
            ]}
          >
            <Text style={styles.primaryButtonText}>
              {isSubmitting ? 'Signing In...' : 'Continue with Google'}
            </Text>
          </Pressable>

          <Pressable
            onPress={onNavigateResetPin}
            style={({ pressed }) => [styles.authLinkRow, pressed && styles.tabButtonPressed]}
          >
            <Text style={styles.authLinkText}>
              Forgot PIN? <Text style={styles.authLinkAccent}>Verify with Google</Text>
=======
              screenStyles.mainButton,
              isSubmitting && styles.primaryButtonDisabled,
              pressed && styles.tabButtonPressed,
            ]}
            accessibilityRole="button"
          >
            <Text style={styles.primaryButtonText}>
              {isSubmitting ? 'Signing in…' : 'Continue with Google'}
>>>>>>> origin/main
            </Text>
          </Pressable>

          <Pressable
            onPress={onNavigateSignUp}
<<<<<<< HEAD
            style={({ pressed }) => [styles.secondaryButton, pressed && styles.tabButtonPressed]}
          >
            <Text style={styles.secondaryButtonText}>Don't have an account? Sign Up</Text>
=======
            style={({ pressed }) => [styles.secondaryButton, screenStyles.footerLink, pressed && styles.tabButtonPressed]}
          >
            <Text style={styles.secondaryButtonText}>Don’t have an account? Sign up</Text>
>>>>>>> origin/main
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
<<<<<<< HEAD
=======

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
>>>>>>> origin/main

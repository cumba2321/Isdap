import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StatusBar as RNStatusBar,
  Text,
  TextInput,
  View,
} from 'react-native';
import AuthHeader from '../components/AuthHeader';
import { styles } from '../styles';
import { AuthResult } from '../types';

type LoginScreenProps = {
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
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSignIn = async () => {
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

          <Pressable
            onPress={handleSignIn}
            disabled={isSubmitting}
            style={({ pressed }) => [
              styles.primaryButton,
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
            </Text>
          </Pressable>

          <Pressable
            onPress={onNavigateSignUp}
            style={({ pressed }) => [styles.secondaryButton, pressed && styles.tabButtonPressed]}
          >
            <Text style={styles.secondaryButtonText}>Don't have an account? Sign Up</Text>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

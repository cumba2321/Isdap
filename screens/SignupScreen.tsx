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
import { AuthResult, GoogleIdentityResult } from '../types';

type SignupScreenProps = {
  onGoogleSignUp: () => Promise<GoogleIdentityResult>;
  onSignUp: (pin: string) => Promise<AuthResult>;
  onNavigateSignIn: () => void;
};

export default function SignupScreen({
  onGoogleSignUp,
  onSignUp,
  onNavigateSignIn,
}: SignupScreenProps) {
  const [email, setEmail] = useState('');
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleGoogleSignUp = async () => {
    setIsSubmitting(true);
    try {
      const result = await onGoogleSignUp();
      if (!result.success) {
        setError(result.error);
        return;
      }
      if (email && email !== result.email) {
        setPin('');
        setConfirmPin('');
      }
      setEmail(result.email);
      setError(null);
    } catch {
      setError('Unable to verify your Google account right now. Try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSignUp = async () => {
    if (!email) {
      setError('Verify your Google account before creating a PIN.');
      return;
    }
    if (!/^\d{4}$/.test(pin)) {
      setError('Create a 4-digit PIN.');
      return;
    }
    if (pin !== confirmPin) {
      setError('PINs do not match.');
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await onSignUp(pin);
      if (!result.success) {
        setError(result.error);
        return;
      }
      setError(null);
    } catch {
      setError('Unable to create your account right now. Check your connection and try again.');
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
        <AuthHeader tagline="IoT Water Quality Monitoring System" />

        <View style={styles.authCard}>
          <Text style={styles.authCardTitle}>Sign Up</Text>
          <Text style={styles.authCardSubtitle}>Use Google to verify your email and create a PIN</Text>

          <Pressable
            onPress={handleGoogleSignUp}
            disabled={isSubmitting}
            style={({ pressed }) => [
              styles.primaryButton,
              isSubmitting && styles.primaryButtonDisabled,
              pressed && styles.tabButtonPressed,
            ]}
          >
            <Text style={styles.primaryButtonText}>
              {isSubmitting ? 'Opening Google...' : email ? 'Choose a different Google account' : 'Continue with Google'}
            </Text>
          </Pressable>

          {email ? (
            <>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>GOOGLE ACCOUNT</Text>
                <View style={styles.inputRow}>
                  <Text style={styles.textInput}>{email}</Text>
                </View>
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>CREATE 4-DIGIT PIN</Text>
                <View style={styles.inputRow}>
                  <TextInput
                    value={pin}
                    onChangeText={(value) => setPin(value.replace(/\D/g, '').slice(0, 4))}
                    placeholder="Choose a 4-digit PIN"
                    placeholderTextColor="#4f6b6d"
                    keyboardType="number-pad"
                    secureTextEntry
                    maxLength={4}
                    style={styles.textInput}
                  />
                </View>
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>CONFIRM PIN</Text>
                <View style={styles.inputRow}>
                  <TextInput
                    value={confirmPin}
                    onChangeText={(value) => setConfirmPin(value.replace(/\D/g, '').slice(0, 4))}
                    placeholder="Enter the PIN again"
                    placeholderTextColor="#4f6b6d"
                    keyboardType="number-pad"
                    secureTextEntry
                    maxLength={4}
                    style={styles.textInput}
                  />
                </View>
              </View>
            </>
          ) : null}

          {error ? <Text style={styles.fieldErrorText}>{error}</Text> : null}

          {email ? (
            <Pressable
              onPress={handleSignUp}
              disabled={isSubmitting}
              style={({ pressed }) => [
                styles.primaryButton,
                isSubmitting && styles.primaryButtonDisabled,
                pressed && styles.tabButtonPressed,
              ]}
            >
              <Text style={styles.primaryButtonText}>
                {isSubmitting ? 'Creating Account...' : 'Create Account'}
              </Text>
            </Pressable>
          ) : null}

          <Pressable
            onPress={onNavigateSignIn}
            style={({ pressed }) => [styles.authLinkRow, pressed && styles.tabButtonPressed]}
          >
            <Text style={styles.authLinkText}>
              Already have an account? <Text style={styles.authLinkAccent}>Sign In</Text>
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

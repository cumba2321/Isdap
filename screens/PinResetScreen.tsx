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

type PinResetScreenProps = {
  onVerifyWithGoogle: () => Promise<GoogleIdentityResult>;
  onResetPin: (pin: string) => Promise<AuthResult>;
  onNavigateSignIn: () => void;
};

export default function PinResetScreen({
  onVerifyWithGoogle,
  onResetPin,
  onNavigateSignIn,
}: PinResetScreenProps) {
  const [email, setEmail] = useState('');
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleVerifyWithGoogle = async () => {
    setIsSubmitting(true);
    try {
      const result = await onVerifyWithGoogle();
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

  const handleResetPin = async () => {
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
      const result = await onResetPin(pin);
      if (!result.success) {
        setError(result.error);
        return;
      }
      setError(null);
    } catch {
      setError('Unable to update your PIN right now. Check your connection and try again.');
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
          <Text style={styles.authCardTitle}>Reset PIN</Text>
          <Text style={styles.authCardSubtitle}>Verify your Google account to choose a new PIN</Text>

          <Pressable
            onPress={handleVerifyWithGoogle}
            disabled={isSubmitting}
            style={({ pressed }) => [
              styles.primaryButton,
              isSubmitting && styles.primaryButtonDisabled,
              pressed && styles.tabButtonPressed,
            ]}
          >
            <Text style={styles.primaryButtonText}>
              {isSubmitting ? 'Verifying...' : email ? 'Verify a different Google account' : 'Verify with Google'}
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
                <Text style={styles.inputLabel}>NEW 4-DIGIT PIN</Text>
                <View style={styles.inputRow}>
                  <TextInput
                    value={pin}
                    onChangeText={(value) => setPin(value.replace(/\D/g, '').slice(0, 4))}
                    placeholder="Choose a new 4-digit PIN"
                    placeholderTextColor="#4f6b6d"
                    keyboardType="number-pad"
                    secureTextEntry
                    maxLength={4}
                    style={styles.textInput}
                  />
                </View>
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>CONFIRM NEW PIN</Text>
                <View style={styles.inputRow}>
                  <TextInput
                    value={confirmPin}
                    onChangeText={(value) => setConfirmPin(value.replace(/\D/g, '').slice(0, 4))}
                    placeholder="Enter the new PIN again"
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
              onPress={handleResetPin}
              disabled={isSubmitting}
              style={({ pressed }) => [
                styles.primaryButton,
                isSubmitting && styles.primaryButtonDisabled,
                pressed && styles.tabButtonPressed,
              ]}
            >
              <Text style={styles.primaryButtonText}>
                {isSubmitting ? 'Updating PIN...' : 'Save New PIN'}
              </Text>
            </Pressable>
          ) : null}

          <Pressable
            onPress={onNavigateSignIn}
            style={({ pressed }) => [styles.authLinkRow, pressed && styles.tabButtonPressed]}
          >
            <Text style={styles.authLinkText}>
              Remember your PIN? <Text style={styles.authLinkAccent}>Sign In</Text>
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

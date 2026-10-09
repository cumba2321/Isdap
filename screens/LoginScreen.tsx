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
import { styles } from '../styles';
import AuthHeader from '../components/AuthHeader';
import { AuthResult } from '../types';
 
type LoginScreenProps = {
  onSignIn: (farmId: string, password: string, pin: string) => Promise<AuthResult>;
  onNavigateSignUp: () => void;
};
 
export default function LoginScreen({ onSignIn, onNavigateSignUp }: LoginScreenProps) {
  const [farmId, setFarmId] = useState('');
  const [password, setPassword] = useState('');
  const [pin, setPin] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
 
  const handleSignIn = async () => {
    if (!farmId.trim() || !password.trim()) {
      setError('Enter your farm ID and password to continue.');
      return;
    }
    if (!/^\d{4}$/.test(pin)) {
      setError('Enter a 4-digit PIN.');
      return;
    }
    setIsSubmitting(true);
    try {
      const result = await onSignIn(farmId.trim(), password, pin);
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
          <Text style={styles.authCardSubtitle}>Enter your credentials and 4-digit PIN</Text>
 
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>FARM ID / USERNAME</Text>
            <View style={styles.inputRow}>
              <TextInput
                value={farmId}
                onChangeText={setFarmId}
                placeholder="e.g. pond_farm_01"
                placeholderTextColor="#4f6b6d"
                autoCapitalize="none"
                autoCorrect={false}
                style={styles.textInput}
              />
            </View>
          </View>
 
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>4-DIGIT PIN</Text>
            <View style={styles.inputRow}>
              <TextInput
                value={pin}
                onChangeText={(value) => setPin(value.replace(/\D/g, '').slice(0, 4))}
                placeholder="Enter or create your PIN"
                placeholderTextColor="#4f6b6d"
                keyboardType="number-pad"
                secureTextEntry
                maxLength={4}
                autoCapitalize="none"
                style={styles.textInput}
              />
            </View>
            {error ? <Text style={styles.fieldErrorText}>{error}</Text> : null}
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>PASSWORD</Text>
            <View style={styles.inputRow}>
              <TextInput
                value={password}
                onChangeText={setPassword}
                placeholder="Enter your password"
                placeholderTextColor="#4f6b6d"
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                style={styles.textInput}
              />
              <Pressable onPress={() => setShowPassword((prev) => !prev)} style={styles.showToggle}>
                <Text style={styles.showToggleText}>{showPassword ? 'Hide' : 'Show'}</Text>
              </Pressable>
            </View>
          </View>
 
          <Pressable
            onPress={handleSignIn}
            disabled={isSubmitting}
            style={({ pressed }) => [styles.primaryButton, isSubmitting && styles.primaryButtonDisabled, pressed && styles.tabButtonPressed]}
          >
            <Text style={styles.primaryButtonText}>{isSubmitting ? 'Signing In...' : 'Sign In'}</Text>
          </Pressable>
 
          <View style={styles.authLinkRow}>
            <Text style={styles.authLinkText}>Forgot password?</Text>
          </View>
 
          <Pressable
            onPress={onNavigateSignUp}
            style={({ pressed }) => [styles.secondaryButton, pressed && styles.tabButtonPressed]}
          >
            <Text style={styles.secondaryButtonText}>Don't have an account? Sign Up</Text>
          </Pressable>
        </View>
 
        <View style={styles.authLinkRow}>
          <Text style={styles.authLinkText}>Demo: pond_farm_01 / password123 / PIN 1234</Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
 
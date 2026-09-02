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
 
type SignupScreenProps = {
  onSignUp: (farmId: string, email: string, password: string) => AuthResult;
  onNavigateSignIn: () => void;
};
 
export default function SignupScreen({ onSignUp, onNavigateSignIn }: SignupScreenProps) {
  const [farmId, setFarmId] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
 
  const handleSignUp = () => {
    if (!farmId.trim() || !email.trim() || !password.trim() || !confirmPassword.trim()) {
      setError('Fill in every field to create your account.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    const result = onSignUp(farmId.trim(), email.trim(), password);
    if (!result.success) {
      setError(result.error);
      return;
    }
    setError(null);
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
          <Text style={styles.authCardSubtitle}>Create your farm account to get started</Text>
 
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
            <Text style={styles.inputLabel}>EMAIL</Text>
            <View style={styles.inputRow}>
              <TextInput
                value={email}
                onChangeText={setEmail}
                placeholder="Enter your email"
                placeholderTextColor="#4f6b6d"
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                style={styles.textInput}
              />
            </View>
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
 
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>CONFIRM PASSWORD</Text>
            <View style={styles.inputRow}>
              <TextInput
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                placeholder="Confirm your password"
                placeholderTextColor="#4f6b6d"
                secureTextEntry={!showConfirmPassword}
                autoCapitalize="none"
                style={styles.textInput}
              />
              <Pressable onPress={() => setShowConfirmPassword((prev) => !prev)} style={styles.showToggle}>
                <Text style={styles.showToggleText}>{showConfirmPassword ? 'Hide' : 'Show'}</Text>
              </Pressable>
            </View>
            {error ? <Text style={styles.fieldErrorText}>{error}</Text> : null}
          </View>
 
          <Pressable
            onPress={handleSignUp}
            style={({ pressed }) => [styles.primaryButton, pressed && styles.tabButtonPressed]}
          >
            <Text style={styles.primaryButtonText}>Sign Up</Text>
          </Pressable>
 
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
 
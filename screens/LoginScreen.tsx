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
  onSignIn: (farmId: string, password: string) => AuthResult;
  onNavigateSignUp: () => void;
};
 
export default function LoginScreen({ onSignIn, onNavigateSignUp }: LoginScreenProps) {
  const [farmId, setFarmId] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
 
  const handleSignIn = () => {
  console.log('LOGIN: pressed', farmId, password);
  if (!farmId.trim() || !password.trim()) {
    console.log('LOGIN: validation failed');
    setError('Enter your farm ID and password to continue.');
    return;
  }
      const result = onSignIn(farmId.trim(), password);
      console.log('LOGIN: result', result);
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
        <AuthHeader />
 
        <View style={styles.authCard}>
          <Text style={styles.authCardTitle}>Sign In</Text>
          <Text style={styles.authCardSubtitle}>Enter your farm credentials to continue</Text>
 
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
            {error ? <Text style={styles.fieldErrorText}>{error}</Text> : null}
          </View>
 
          <Pressable
            onPress={handleSignIn}
            style={({ pressed }) => [styles.primaryButton, pressed && styles.tabButtonPressed]}
          >
            <Text style={styles.primaryButtonText}>Sign In</Text>
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
          <Text style={styles.authLinkText}>Demo login: pond_farm_01 / password123</Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
 
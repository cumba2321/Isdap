import { useState } from 'react';
import { GoogleSigninButton } from '@react-native-google-signin/google-signin';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StatusBar as RNStatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import AuthHeader from '../components/AuthHeader';
import PasswordVisibilityIcon from '../components/PasswordVisibilityIcon';
import { styles } from '../styles';
import { AuthResult } from '../types';

type LoginScreenProps = {
  onVerifyGoogle: () => Promise<AuthResult>;
  onCompleteSignIn: (password: string) => Promise<AuthResult>;
  onNavigateSignUp: () => void;
};

export default function LoginScreen({
  onVerifyGoogle,
  onCompleteSignIn,
  onNavigateSignUp,
}: LoginScreenProps) {
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [googleVerified, setGoogleVerified] = useState(false);
  const [password, setPassword] = useState('');
  const [passwordVisible, setPasswordVisible] = useState(false);

  const handleVerifyGoogle = async () => {
    setIsSubmitting(true);
    setError(null);
    try {
      const result = await onVerifyGoogle();
      if (result.success) setGoogleVerified(true);
      else setError(result.error);
    } catch {
      setError('Unable to verify your Google account right now. Check your connection and try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSignIn = async () => {
    if (password.length < 6) {
      setError('Enter a password with at least 6 characters.');
      return;
    }
    setIsSubmitting(true);
    setError(null);
    try {
      const result = await onCompleteSignIn(password);
      if (!result.success) setError(result.error);
    } catch {
      setError('Unable to verify your password right now. Check your connection and try again.');
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
        <View style={[styles.authCard, screenStyles.authCard]}>
          <Text style={styles.authCardTitle}>Sign in</Text>
          <Text style={[styles.authCardSubtitle, screenStyles.cardSubtitle]}>
            Sign in with your Google account and the password you created for IsdaApp.
          </Text>

          {googleVerified ? (
            <View style={screenStyles.passwordStep}>
              <Text style={screenStyles.inputLabel}>PASSWORD</Text>
              <View style={screenStyles.passwordRow}>
                <TextInput
                  value={password}
                  onChangeText={setPassword}
                  placeholder="Enter your password"
                  placeholderTextColor="#8A9BA0"
                  autoCapitalize="none"
                  autoCorrect={false}
                  secureTextEntry={!passwordVisible}
                  textContentType="password"
                  returnKeyType="done"
                  onSubmitEditing={handleSignIn}
                  style={[screenStyles.passwordInput, screenStyles.passwordTextInput]}
                  accessibilityLabel="IsdaApp password"
                />
                <Pressable
                  onPress={() => setPasswordVisible((visible) => !visible)}
                  style={screenStyles.passwordVisibilityButton}
                  accessibilityRole="button"
                  accessibilityLabel={passwordVisible ? 'Hide password' : 'Show password'}
                >
                  <PasswordVisibilityIcon visible={passwordVisible} />
                </Pressable>
              </View>
            </View>
          ) : null}

          {error ? (
            <View style={screenStyles.errorBox} accessibilityRole="alert">
              <Text style={screenStyles.errorText}>{error}</Text>
            </View>
          ) : null}

          {googleVerified ? (
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
                {isSubmitting ? 'Checking password...' : 'SIGN IN'}
              </Text>
            </Pressable>
          ) : (
            <View style={[styles.authGoogleButtonFrame, screenStyles.mainButton]}>
              <GoogleSigninButton
                onPress={handleVerifyGoogle}
                disabled={isSubmitting}
                size={GoogleSigninButton.Size.Standard}
                color={GoogleSigninButton.Color.Light}
                style={styles.authGoogleButton}
                accessibilityLabel={isSubmitting ? 'Verifying Google account' : 'Continue with Google'}
              />
            </View>
          )}

          <Pressable
            onPress={onNavigateSignUp}
            style={({ pressed }) => [styles.secondaryButton, screenStyles.footerLink, pressed && styles.tabButtonPressed]}
          >
            <Text style={styles.secondaryButtonText}>Don't have an account? Sign up</Text>
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
    paddingHorizontal: 18,
    paddingVertical: 28,
  },
  authCard: { alignSelf: 'center' },
  cardSubtitle: { marginBottom: 8 },
  mainButton: {
    marginTop: 12,
  },
  passwordStep: { marginTop: 18 },
  inputLabel: { color: '#60777E', fontSize: 10, fontWeight: '800', letterSpacing: 0.8, marginBottom: 5 },
  passwordRow: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: '#D5E0E3',
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    paddingRight: 8,
  },
  passwordInput: { color: '#172B33', fontSize: 15, minHeight: 48, paddingHorizontal: 12, paddingVertical: 10 },
  passwordTextInput: { flex: 1, minWidth: 0 },
  passwordVisibilityButton: { paddingHorizontal: 9, paddingVertical: 10 },
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
    marginTop: 12,
  },
});

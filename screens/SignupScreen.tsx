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

type SignupScreenProps = {
  onSignUp: (onStepChange: (step: number) => void) => Promise<AuthResult>;
  onNavigateSignIn: () => void;
};

export default function SignupScreen({ onSignUp, onNavigateSignIn }: SignupScreenProps) {
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeStep, setActiveStep] = useState(0);

  const handleSignUp = async () => {
    setIsSubmitting(true);
    setError(null);
    setActiveStep(0);
    try {
      const result = await onSignUp(setActiveStep);
      if (!result.success) setError(result.error);
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
      <RNStatusBar barStyle="dark-content" />
      <ScrollView contentContainerStyle={screenStyles.scroll} keyboardShouldPersistTaps="handled">
        <AuthHeader tagline="IoT Water Quality Monitoring System" />
        <View style={styles.authCard}>
          <Text style={styles.authCardTitle}>Create your account</Text>
          <Text style={styles.authCardSubtitle}>
            Use Google to verify your email and create your IsdaApp account. No PIN or email code is needed.
          </Text>

          <View
            style={screenStyles.stepper}
            accessibilityRole="progressbar"
            accessibilityValue={{ min: 1, max: 2, now: activeStep + 1 }}
            accessibilityLabel={`Account creation, step ${activeStep + 1} of 2`}
          >
            <View style={[screenStyles.connector, activeStep > 0 && screenStyles.connectorComplete]} />
            <View style={screenStyles.step}>
              <View style={[screenStyles.stepIcon, activeStep === 0 && screenStyles.stepIconActive]}>
                {activeStep > 0 ? (
                  <Text style={screenStyles.stepCheck}>✓</Text>
                ) : (
                  <View style={[screenStyles.stepDot, screenStyles.stepDotActive]} />
                )}
              </View>
              <Text style={[screenStyles.stepLabel, activeStep === 0 && screenStyles.stepLabelActive]}>
                Verify with Google
              </Text>
            </View>
            <View style={screenStyles.step}>
              <View style={[screenStyles.stepIcon, activeStep === 1 && screenStyles.stepIconActive]}>
                <View
                  style={[
                    screenStyles.stepDot,
                    activeStep === 1 && screenStyles.stepDotActive,
                  ]}
                />
              </View>
              <Text style={[screenStyles.stepLabel, activeStep === 1 && screenStyles.stepLabelActive]}>
                Create account
              </Text>
            </View>
          </View>

          {error ? (
            <View style={screenStyles.errorBox} accessibilityRole="alert">
              <Text style={screenStyles.errorText}>{error}</Text>
            </View>
          ) : null}

          <Pressable
            onPress={handleSignUp}
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
              {isSubmitting
                ? activeStep === 0
                  ? 'Verifying with Google…'
                  : 'Creating account…'
                : 'Continue with Google'}
            </Text>
          </Pressable>

          <Pressable
            onPress={onNavigateSignIn}
            style={({ pressed }) => [styles.authLinkRow, screenStyles.footerLink, pressed && styles.tabButtonPressed]}
          >
            <Text style={styles.authLinkText}>
              Already have an account? <Text style={styles.authLinkAccent}>Sign in</Text>
            </Text>
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
  stepper: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
    marginTop: 22,
    position: 'relative',
  },
  connector: {
    backgroundColor: '#CAD9DE',
    height: 3,
    left: '25%',
    position: 'absolute',
    right: '25%',
    top: 13,
  },
  connectorComplete: {
    backgroundColor: '#078A95',
  },
  step: {
    alignItems: 'center',
    flex: 1,
    gap: 8,
  },
  stepIcon: {
    alignItems: 'center',
    backgroundColor: '#CAD9DE',
    borderColor: '#CAD9DE',
    borderRadius: 14,
    borderWidth: 2,
    height: 28,
    justifyContent: 'center',
    width: 28,
    zIndex: 1,
  },
  stepIconActive: {
    backgroundColor: '#F5F8FA',
    borderColor: '#078A95',
  },
  stepDot: {
    backgroundColor: '#60777E',
    borderRadius: 4,
    height: 8,
    width: 8,
  },
  stepDotActive: {
    backgroundColor: '#078A95',
  },
  stepCheck: {
    color: '#078A95',
    fontSize: 15,
    fontWeight: '800',
  },
  stepLabel: {
    color: '#6A8188',
    fontSize: 11,
    fontWeight: '600',
    textAlign: 'center',
  },
  stepLabelActive: {
    color: '#172B33',
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
    marginTop: 22,
  },
});

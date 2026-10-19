import { useState } from 'react';
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
import CountryPicker, { Country, CountryCode } from 'react-native-country-picker-modal';
import { AsYouType, parsePhoneNumberFromString } from 'libphonenumber-js';
import { SafeAreaView } from 'react-native-safe-area-context';
import AuthHeader from '../components/AuthHeader';
import { styles } from '../styles';
import { AuthResult } from '../types';

type SignupProfile = {
  firstName: string;
  lastName: string;
  countryCode: string;
  countryName: string;
  countryCallingCode: string;
  phoneNumber: string;
};
type GoogleVerificationResult =
  | { status: 'verified' }
  | { status: 'existing' }
  | { status: 'error'; error: string };

type SignupScreenProps = {
  onVerifyGoogle: () => Promise<GoogleVerificationResult>;
  onCreateAccount: (profile: SignupProfile) => Promise<AuthResult>;
  onNavigateSignIn: () => void;
};

export default function SignupScreen({ onVerifyGoogle, onCreateAccount, onNavigateSignIn }: SignupScreenProps) {
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeStep, setActiveStep] = useState(0);
  const [isGoogleVerified, setIsGoogleVerified] = useState(false);
  const [existingAccountFound, setExistingAccountFound] = useState(false);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [countryCode, setCountryCode] = useState<CountryCode>('PH');
  const [countryName, setCountryName] = useState('Philippines');
  const [callingCode, setCallingCode] = useState('63');
  const [phoneError, setPhoneError] = useState<string | null>(null);

  const handleGoogleVerification = async () => {
    setIsSubmitting(true);
    setError(null);
    try {
      const result = await onVerifyGoogle();
      if (result.status === 'error') {
        setError(result.error);
      } else if (result.status === 'existing') {
        setExistingAccountFound(true);
      } else {
        setIsGoogleVerified(true);
        setActiveStep(1);
      }
    } catch {
      setError('Unable to verify your Google account right now. Check your connection and try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCreateAccount = async () => {
    const firstNameValue = firstName.trim();
    const lastNameValue = lastName.trim();
    if (!firstNameValue || !lastNameValue) {
      setError('Enter your first name and last name to continue.');
      return;
    }
    let normalizedPhone = '';
    if (phoneNumber.trim()) {
      const parsedPhone = callingCode
        ? parsePhoneNumberFromString(phoneNumber, { defaultCallingCode: callingCode })
        : undefined;
      if (!parsedPhone?.isValid() || (parsedPhone.country && parsedPhone.country !== countryCode)) {
        setPhoneError('Enter a valid phone number for the selected country.');
        return;
      }
      normalizedPhone = parsedPhone.number;
    }

    setIsSubmitting(true);
    setError(null);
    setPhoneError(null);
    try {
      const result = await onCreateAccount({
        firstName: firstNameValue,
        lastName: lastNameValue,
        countryCode,
        countryName,
        countryCallingCode: callingCode,
        phoneNumber: normalizedPhone,
      });
      if (!result.success) setError(result.error);
    } catch {
      setError('Unable to create your account right now. Check your connection and try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePhoneChange = (value: string) => {
    const formatted = callingCode
      ? new AsYouType({ defaultCallingCode: callingCode }).input(value)
      : value.replace(/[^\d+]/g, '');
    setPhoneNumber(formatted);
    setPhoneError(null);
  };

  const handleCountrySelect = (country: Country) => {
    const parsedPhone = callingCode
      ? parsePhoneNumberFromString(phoneNumber, { defaultCallingCode: callingCode })
      : undefined;
    setCountryCode(country.cca2);
    setCountryName(typeof country.name === 'string' ? country.name : country.name.common);
    setCallingCode(country.callingCode[0] ?? '');
    setPhoneError(null);
    if (phoneNumber) {
      const nationalNumber = parsedPhone?.nationalNumber ?? phoneNumber.replace(/\D/g, '');
      setPhoneNumber(country.callingCode[0]
        ? new AsYouType({ defaultCallingCode: country.callingCode[0] }).input(nationalNumber)
        : nationalNumber);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'right', 'bottom', 'left']}>
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
            Verify your Google account first. If it is new to IsdaApp, you can then enter your details.
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
                  <Text style={screenStyles.stepCheck}>OK</Text>
                ) : (
                  <View style={[screenStyles.stepDot, screenStyles.stepDotActive]} />
                )}
              </View>
              <Text style={[screenStyles.stepLabel, activeStep === 0 && screenStyles.stepLabelActive]}>
                Verify Google
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
                Your details
              </Text>
            </View>
          </View>

          {existingAccountFound ? (
            <View style={screenStyles.existingAccountBox}>
              <Text style={screenStyles.existingAccountText}>
                This Google account is already registered with IsdaApp. Sign in to continue.
              </Text>
              <Pressable
                onPress={onNavigateSignIn}
                style={({ pressed }) => [screenStyles.existingAccountButton, pressed && styles.tabButtonPressed]}
                accessibilityRole="button"
              >
                <Text style={styles.primaryButtonText}>GO TO SIGN IN</Text>
              </Pressable>
            </View>
          ) : null}

          {isGoogleVerified ? (
            <>
              <View style={screenStyles.verifiedBox}>
                <Text style={screenStyles.verifiedText}>Google account verified. Complete your profile to continue.</Text>
              </View>
              <View style={screenStyles.field}>
                <Text style={screenStyles.inputLabel}>FIRST NAME</Text>
                <TextInput
                  value={firstName}
                  onChangeText={setFirstName}
                  placeholder="First name"
                  placeholderTextColor="#8A9BA0"
                  autoCapitalize="words"
                  autoCorrect={false}
                  textContentType="givenName"
                  returnKeyType="next"
                  style={screenStyles.input}
                  accessibilityLabel="First name"
                />
              </View>
              <View style={screenStyles.field}>
                <Text style={screenStyles.inputLabel}>LAST NAME</Text>
                <TextInput
                  value={lastName}
                  onChangeText={setLastName}
                  placeholder="Last name"
                  placeholderTextColor="#8A9BA0"
                  autoCapitalize="words"
                  autoCorrect={false}
                  textContentType="familyName"
                  returnKeyType="next"
                  style={screenStyles.input}
                  accessibilityLabel="Last name"
                />
              </View>
              <View style={screenStyles.field}>
                <Text style={screenStyles.inputLabel}>COUNTRY</Text>
                <View style={screenStyles.countryRow}>
                  <CountryPicker
                    countryCode={countryCode}
                    withFilter
                    withFlag
                    withCountryNameButton
                    onSelect={handleCountrySelect}
                    containerButtonStyle={screenStyles.countryPickerButton}
                  />
                </View>
              </View>
              <View style={screenStyles.field}>
                <Text style={screenStyles.inputLabel}>PHONE NUMBER (OPTIONAL)</Text>
                <View style={[screenStyles.phoneRow, phoneError ? screenStyles.inputInvalid : null]}>
                  <Text style={screenStyles.phoneCallingCode}>+{callingCode}</Text>
                  <TextInput
                    value={phoneNumber}
                    onChangeText={handlePhoneChange}
                    placeholder="Phone number"
                    placeholderTextColor="#8A9BA0"
                    keyboardType="phone-pad"
                    textContentType="telephoneNumber"
                    returnKeyType="done"
                    style={[screenStyles.input, screenStyles.phoneInput]}
                    accessibilityLabel="Phone number"
                  />
                </View>
                <Text style={screenStyles.phoneHelp}>Optional. Used for SMS alerts if your pond reaches a critical condition. Saved in international format.</Text>
                {phoneError ? <Text style={screenStyles.errorText}>{phoneError}</Text> : null}
              </View>
            </>
          ) : null}

          {error ? (
            <View style={screenStyles.errorBox} accessibilityRole="alert">
              <Text style={screenStyles.errorText}>{error}</Text>
            </View>
          ) : null}

          <Pressable
            onPress={isGoogleVerified ? handleCreateAccount : handleGoogleVerification}
            disabled={isSubmitting || existingAccountFound}
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
                ? isGoogleVerified ? 'Creating account...' : 'Verifying Google account...'
                : isGoogleVerified ? 'CREATE ACCOUNT' : 'VERIFY WITH GOOGLE'}
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
    </SafeAreaView>
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
  field: { marginBottom: 11 },
  inputLabel: { color: '#60777E', fontSize: 10, fontWeight: '800', letterSpacing: 0.8, marginBottom: 5 },
  input: {
    backgroundColor: '#FFFFFF',
    borderColor: '#D5E0E3',
    borderRadius: 12,
    borderWidth: 1,
    color: '#172B33',
    fontSize: 15,
    minHeight: 48,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  phoneRow: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: '#D5E0E3',
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    minHeight: 50,
    paddingHorizontal: 8,
  },
  countryRow: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: '#D5E0E3',
    borderRadius: 12,
    borderWidth: 1,
    justifyContent: 'flex-start',
    minHeight: 50,
    paddingHorizontal: 12,
  },
  countryPickerButton: { alignSelf: 'stretch', justifyContent: 'flex-start', paddingVertical: 10 },
  phoneCallingCode: { borderRightColor: '#D5E0E3', borderRightWidth: 1, color: '#334B53', fontSize: 15, fontWeight: '700', paddingHorizontal: 7, paddingVertical: 8 },
  phoneInput: { borderColor: 'transparent', borderWidth: 0, flex: 1, minWidth: 0, paddingHorizontal: 8 },
  inputInvalid: { borderColor: '#C84F5B' },
  phoneHelp: { color: '#71858B', fontSize: 10, lineHeight: 15, marginTop: 5 },
  verifiedBox: { backgroundColor: '#EFF8F3', borderRadius: 11, marginBottom: 14, padding: 11 },
  verifiedText: { color: '#176A50', fontSize: 11, fontWeight: '700', lineHeight: 16 },
  existingAccountBox: { backgroundColor: '#FFF8E8', borderRadius: 12, marginTop: 12, padding: 12 },
  existingAccountText: { color: '#805909', fontSize: 12, lineHeight: 17 },
  existingAccountButton: {
    alignItems: 'center',
    backgroundColor: '#173C45',
    borderRadius: 11,
    justifyContent: 'center',
    marginTop: 10,
    minHeight: 44,
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

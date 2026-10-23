import { StatusBar } from 'expo-status-bar';
import * as Notifications from 'expo-notifications';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import {
  deleteUser,
  EmailAuthProvider,
  GoogleAuthProvider,
  linkWithCredential,
  onAuthStateChanged,
  reauthenticateWithCredential,
  signInWithCredential,
  signOut,
} from 'firebase/auth';
import { endAt, get, limitToLast, onValue, orderByChild, push, query, ref, remove, runTransaction, set, startAt, update } from 'firebase/database';
import { useEffect, useMemo, useRef, useState } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { ActivityIndicator, Alert, Platform, Vibration, View } from 'react-native';

import TabBar from './components/TabBar';
import { auth, db as database, GOOGLE_WEB_CLIENT_ID } from './firebaseConfig';
import { demoReading, formatValue, metrics } from './metrics';
import AlertScreen from './screens/AlertScreen';
import CalibrationHomeScreen from './screens/CalibrationHomeScreen';
import DashboardScreen from './screens/DashboardScreen';
import HistoryScreen from './screens/HistoryScreen';
import LoginScreen from './screens/LoginScreen';
import SettingsScreen from './screens/SettingsScreen';
import SignupScreen from './screens/SignupScreen';
import { styles } from './styles';
import {
  Account,
  ActiveAlert,
  AuthResult,
  CalibrationMethod,
  CalibrationPoint,
  CalibratableMetricKey,
  DeviceSerialLog,
  ManagedDevice,
  MetricKey,
  NotificationPreferences,
  PondReading,
  SensorCalibration,
  SensorCalibrations,
  SensorLog,
  SensorVoltages,
  TabKey,
} from './types';

const ACCOUNTS_PATH = 'IsdaApp/accounts';
const DEVICE_CLAIMS_PATH = 'deviceClaims';
const DEVICES_PATH = 'devices';
const HISTORY_PAGE_SIZE = 100;

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

type AuthScreen = 'login' | 'signup';

type StoredAccount = Account & {
  preferences?: NotificationPreferences;
  clearedAlertsAt?: number;
  dismissedAlerts?: Record<string, Partial<Record<MetricKey, number>>>;
  devices?: Record<string, { name: string }>;
  selectedDeviceId?: string | null;
  sensorCalibrations?: Record<string, SensorCalibrations>;
};

const CALIBRATABLE_METRICS: CalibratableMetricKey[] = ['ph', 'tds', 'ec', 'turbidity', 'do'];
const EMPTY_SENSOR_CALIBRATIONS: SensorCalibrations = {};

function applySensorCalibrations(
  reading: PondReading,
  calibrations: SensorCalibrations,
): PondReading {
  const adjusted = { ...reading };
  adjusted.temp = reading.temp + (calibrations.temperature?.offset ?? 0);
  CALIBRATABLE_METRICS.forEach((key) => {
    const calibration = calibrations[key];
    if (!calibration) return;
    adjusted[key] = calibration.points?.length
      ? reading[key] * calibration.adjustment + (calibration.offset ?? 0)
      : key === 'ph'
        ? reading[key] + calibration.adjustment
        : reading[key] * calibration.adjustment;
  });
  return adjusted;
}

const DEFAULT_PREFERENCES: NotificationPreferences = {
  pushNotifications: true,
  alertNotifications: true,
  warningNotifications: true,
  smsNotifications: false,
  smsCritical: true,
  smsWarning: false,
  autoRefresh: true,
  soundAlerts: true,
};

GoogleSignin.configure({ webClientId: GOOGLE_WEB_CLIENT_ID });

function AppContent() {
  const [deviceReading, setDeviceReading] = useState<PondReading>(demoReading);
  const [sensorVoltages, setSensorVoltages] = useState<SensorVoltages>({});
  const [voltageUpdatedAt, setVoltageUpdatedAt] = useState<number | null>(null);
  const [isLive, setIsLive] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(new Date());
  const [activeTab, setActiveTab] = useState<TabKey>('dashboard');
  const [hasUnreadAlerts, setHasUnreadAlerts] = useState(false);
  const [showCalibrationScreen, setShowCalibrationScreen] = useState(false);
  const [focusSmsSettings, setFocusSmsSettings] = useState(false);
  const [alertDetectedAt, setAlertDetectedAt] = useState<Partial<Record<MetricKey, Date>>>({});
  const [farmId, setFarmId] = useState<string | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);
  const [authScreen, setAuthScreen] = useState<AuthScreen>('login');
  const [currentAccount, setCurrentAccount] = useState<StoredAccount | null>(null);
  const [preferences, setPreferences] = useState<NotificationPreferences>(DEFAULT_PREFERENCES);
  const [clearedAlertsAt, setClearedAlertsAt] = useState<number | null>(null);
  const [alertsClearing, setAlertsClearing] = useState(false);
  const [historyLogs, setHistoryLogs] = useState<SensorLog[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyLoadingMore, setHistoryLoadingMore] = useState(false);
  const [historyHasMore, setHistoryHasMore] = useState(false);
  const [historyClearing, setHistoryClearing] = useState(false);
  const [deviceSerialLogs, setDeviceSerialLogs] = useState<DeviceSerialLog[]>([]);
  const [pushPermissionGranted, setPushPermissionGranted] = useState(false);
  const hasRestoredInitialAuth = useRef(false);
  const pendingSignupUid = useRef<string | null>(null);

  const isAuthenticated = farmId !== null;
  const managedDevices: ManagedDevice[] = Object.entries(currentAccount?.devices ?? {}).map(
    ([deviceId, device]) => ({ deviceId, name: device.name || deviceId }),
  );
  const selectedDevice = managedDevices.find((device) => device.deviceId === selectedDeviceId) ?? null;
  const sensorCalibrations = selectedDeviceId
    ? currentAccount?.sensorCalibrations?.[selectedDeviceId] ?? EMPTY_SENSOR_CALIBRATIONS
    : EMPTY_SENSOR_CALIBRATIONS;
  const reading = useMemo(
    () => applySensorCalibrations(deviceReading, sensorCalibrations),
    [deviceReading, sensorCalibrations],
  );

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (!hasRestoredInitialAuth.current) {
        hasRestoredInitialAuth.current = true;
        void (async () => {
          if (!user) {
            setFarmId(null);
            setAuthReady(true);
            return;
          }
          try {
            const accountSnapshot = await get(ref(database, `${ACCOUNTS_PATH}/${user.uid}`));
            if (accountSnapshot.exists()) {
              setAuthScreen('login');
              setFarmId(null);
            } else {
              pendingSignupUid.current = user.uid;
              setAuthScreen('signup');
              setFarmId(null);
            }
          } catch {
            Alert.alert('Account unavailable', 'Could not verify your account. Check your connection and try again.');
            setFarmId(null);
          } finally {
            setAuthReady(true);
          }
        })();
        return;
      }
      if (!user) setFarmId(null);
    });
    return unsubscribe;
  }, []);

  // Each account is stored under its Firebase Auth UID, so account reads stay
  // scoped to the Google account that authenticated.
  useEffect(() => {
    if (!farmId) {
      setCurrentAccount(null);
      return;
    }
    const unsubscribe = onValue(
      ref(database, `${ACCOUNTS_PATH}/${farmId}`),
      (snapshot) => {
        const account = snapshot.val() as StoredAccount | null;
        if (!account) {
          setCurrentAccount(null);
          return;
        }
        const googleName = auth.currentUser?.displayName?.trim().split(/\s+/) ?? [];
        setCurrentAccount({
          ...account,
          firstName: account.firstName?.trim() || googleName[0] || '',
          lastName: account.lastName?.trim() || googleName.slice(1).join(' '),
        });
      },
      () => Alert.alert('Account unavailable', 'Could not load account settings. Check your connection and database rules.'),
    );
    return unsubscribe;
  }, [farmId]);

  // Sync local preferences whenever this account record changes.
  useEffect(() => {
    setPreferences({ ...DEFAULT_PREFERENCES, ...currentAccount?.preferences, smsWarning: false });
    setClearedAlertsAt(currentAccount?.clearedAlertsAt ?? null);
    const devices = currentAccount?.devices ?? {};
    const savedSelection = currentAccount?.selectedDeviceId;
    setSelectedDeviceId(savedSelection && devices[savedSelection] ? savedSelection : null);
  }, [currentAccount]);

  const authenticateWithGoogle = async () => {
    const response = await GoogleSignin.signIn();
    if (response.type === 'cancelled') {
      throw new Error('Google sign-in was cancelled.');
    }
    if (!response.data.idToken) {
      throw new Error('Google did not return an ID token. Check the Google sign-in configuration.');
    }
    const credential = GoogleAuthProvider.credential(response.data.idToken);
    const { user } = await signInWithCredential(auth, credential);
    if (!user.email) {
      throw new Error('The selected Google account does not have an email address.');
    }
    if (!user.providerData.some((provider) => provider.providerId === GoogleAuthProvider.PROVIDER_ID)) {
      throw new Error('Google did not verify this account. Choose a Google account and try again.');
    }
    return user;
  };

  const handleVerifyGoogleForSignUp = async (): Promise<
    | { status: 'verified' }
    | { status: 'existing' }
    | { status: 'error'; error: string }
  > => {
    try {
      const user = await authenticateWithGoogle();
      const accountSnapshot = await get(ref(database, `${ACCOUNTS_PATH}/${user.uid}`));
      if (accountSnapshot.exists()) {
        pendingSignupUid.current = null;
        return { status: 'existing' };
      }
      pendingSignupUid.current = user.uid;
      return { status: 'verified' };
    } catch (error) {
      return {
        status: 'error',
        error: error instanceof Error ? error.message : 'Google account verification failed. Please try again.',
      };
    }
  };

  const handleCreateAccount = async (
    profile: {
      firstName: string;
      lastName: string;
      countryCode: string;
      countryName: string;
      countryCallingCode: string;
      phoneNumber: string;
    },
    password: string,
  ): Promise<AuthResult> => {
    try {
      const user = auth.currentUser;
      if (!user || pendingSignupUid.current !== user.uid) {
        return { success: false, error: 'Verify your Google account again before creating your account.' };
      }
      const email = user.email?.trim().toLowerCase();
      if (!email) {
        return { success: false, error: 'The selected Google account does not have an email address.' };
      }
      if (password.length < 6) {
        return { success: false, error: 'Password must be at least 6 characters.' };
      }
      await linkWithCredential(user, EmailAuthProvider.credential(email, password));
      const account: StoredAccount = {
        authUid: user.uid,
        email,
        firstName: profile.firstName,
        lastName: profile.lastName,
        countryCode: profile.countryCode,
        countryName: profile.countryName,
        countryCallingCode: profile.countryCallingCode,
        phoneNumber: profile.phoneNumber,
        preferences: DEFAULT_PREFERENCES,
      };
      const accountRef = ref(database, `${ACCOUNTS_PATH}/${user.uid}`);
      const result = await runTransaction(accountRef, (current) => current ? undefined : account);
      const storedAccount = result.snapshot.val() as StoredAccount | null;
      if (!result.committed || !storedAccount) {
        pendingSignupUid.current = null;
        return { success: false, error: 'This Google account already has an app account. Sign in instead.' };
      }
      pendingSignupUid.current = null;
      setCurrentAccount(storedAccount);
      setFarmId(user.uid);
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Account creation failed. Please try again.',
      };
    }
  };

  const handleLeaveSignUp = async () => {
    if (pendingSignupUid.current !== null) {
      try {
        await signOut(auth);
        await GoogleSignin.signOut();
      } catch {
        Alert.alert('Sign out failed', 'Could not clear the verified Google session. Please try again.');
        return;
      }
      pendingSignupUid.current = null;
    }
    setAuthScreen('login');
  };

  const handleVerifyGoogleForSignIn = async (): Promise<AuthResult> => {
    try {
      const user = await authenticateWithGoogle();
      const accountSnapshot = await get(ref(database, `${ACCOUNTS_PATH}/${user.uid}`));
      if (!accountSnapshot.exists()) {
        return { success: false, error: 'No account is registered for this Google account. Please sign up first.' };
      }
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Google sign-in failed. Please try again.',
      };
    }
  };

  const handleCompleteSignIn = async (password: string): Promise<AuthResult> => {
    try {
      const user = auth.currentUser;
      const email = user?.email?.trim().toLowerCase();
      if (!user || !email) {
        return { success: false, error: 'Verify your Google account again before entering your password.' };
      }

      const passwordCredential = EmailAuthProvider.credential(email, password);
      const hasPasswordProvider = user.providerData.some(
        (provider) => provider.providerId === EmailAuthProvider.PROVIDER_ID,
      );
      if (hasPasswordProvider) {
        await reauthenticateWithCredential(user, passwordCredential);
      } else {
        await linkWithCredential(user, passwordCredential);
      }

      const accountRef = ref(database, `${ACCOUNTS_PATH}/${user.uid}`);
      const accountSnapshot = await get(accountRef);
      const account = accountSnapshot.val() as (StoredAccount & { pin?: string | null }) | null;
      if (!account) {
        return { success: false, error: 'No account is registered for this Google account. Please sign up first.' };
      }

      if (Object.prototype.hasOwnProperty.call(account, 'pin')) await update(accountRef, { pin: null });
      const googleName = user.displayName?.trim().split(/\s+/) ?? [];
      const firstName = account.firstName?.trim() || googleName[0] || '';
      const lastName = account.lastName?.trim() || googleName.slice(1).join(' ');
      if (firstName !== account.firstName || lastName !== account.lastName) {
        await update(accountRef, { firstName, lastName });
      }

      const accountWithoutPin = { ...account, firstName, lastName };
      delete accountWithoutPin.pin;
      setCurrentAccount(accountWithoutPin);
      setFarmId(user.uid);
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Password verification failed. Please try again.',
      };
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      await GoogleSignin.signOut();
      setCurrentAccount(null);
      setFarmId(null);
      setSelectedDeviceId(null);
      setShowCalibrationScreen(false);
      setAuthScreen('login');
      setActiveTab('dashboard');
    } catch {
      Alert.alert('Sign out failed', 'Could not sign out of Google right now. Check your connection and try again.');
    }
  };

  const handleDeleteAccount = async (): Promise<AuthResult> => {
    const user = auth.currentUser;
    if (!farmId || !user || user.uid !== farmId) {
      return { success: false, error: 'Your session has expired. Sign in again before deleting your account.' };
    }

    let accountDataRemoved = false;
    try {
      await GoogleSignin.signOut();
      const response = await GoogleSignin.signIn();
      if (response.type === 'cancelled') {
        return { success: false, error: 'Account deletion was cancelled.' };
      }
      if (!response.data.idToken) {
        return { success: false, error: 'Google did not return an ID token. Sign in again and retry.' };
      }
      if (response.data.user.email?.toLowerCase() !== user.email?.toLowerCase()) {
        return { success: false, error: 'Sign in with the same Google account currently used by IsdaApp.' };
      }

      const credential = GoogleAuthProvider.credential(response.data.idToken);
      await reauthenticateWithCredential(user, credential);
      await GoogleSignin.signOut();

      const changes: Record<string, null | string | boolean> = {
        [`${ACCOUNTS_PATH}/${farmId}`]: null,
      };
      Object.keys(currentAccount?.devices ?? {}).forEach((deviceId) => {
        changes[`${DEVICE_CLAIMS_PATH}/${deviceId}`] = null;
        changes[`deviceConfig/${deviceId}/alertNumber`] = '';
        changes[`deviceConfig/${deviceId}/smsEnabled`] = false;
        changes[`deviceConfig/${deviceId}/smsCritical`] = false;
        changes[`deviceConfig/${deviceId}/smsWarning`] = false;
      });
      await update(ref(database), changes);
      accountDataRemoved = true;
      await deleteUser(user);
      setCurrentAccount(null);
      setFarmId(null);
      setSelectedDeviceId(null);
      setShowCalibrationScreen(false);
      setAuthScreen('login');
      setActiveTab('dashboard');
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: accountDataRemoved
          ? 'Your account data and device links were removed, but Firebase could not finish deleting your sign-in account. Please contact support.'
          : error instanceof Error
            ? error.message
            : 'Could not delete your account. Check your connection and try again.',
      };
    }
  };

  const handleUpdateAccountProfile = async (profile: {
    firstName: string;
    lastName: string;
    countryCode: string;
    countryName: string;
    countryCallingCode: string;
    phoneNumber: string;
  }): Promise<AuthResult> => {
    if (!farmId) return { success: false, error: 'You are not signed in.' };
    if (!profile.firstName.trim() || !profile.lastName.trim()) {
      return { success: false, error: 'First name and last name are required.' };
    }
    const normalizedPhone = profile.phoneNumber.trim();
    if (normalizedPhone && !/^\+[1-9]\d{7,14}$/.test(normalizedPhone)) {
      return { success: false, error: 'Enter a valid international phone number, or leave it blank.' };
    }
    const nextPreferences = normalizedPhone || !preferences.smsNotifications
      ? preferences
      : { ...preferences, smsNotifications: false };
    try {
      const changes: Record<string, string | boolean | NotificationPreferences> = {
        [`${ACCOUNTS_PATH}/${farmId}/firstName`]: profile.firstName.trim(),
        [`${ACCOUNTS_PATH}/${farmId}/lastName`]: profile.lastName.trim(),
        [`${ACCOUNTS_PATH}/${farmId}/countryCode`]: profile.countryCode,
        [`${ACCOUNTS_PATH}/${farmId}/countryName`]: profile.countryName,
        [`${ACCOUNTS_PATH}/${farmId}/countryCallingCode`]: profile.countryCallingCode,
        [`${ACCOUNTS_PATH}/${farmId}/phoneNumber`]: normalizedPhone,
      };
      if (nextPreferences !== preferences) {
        changes[`${ACCOUNTS_PATH}/${farmId}/preferences`] = nextPreferences;
      }
      managedDevices.forEach(({ deviceId }) => {
        const configPath = `deviceConfig/${deviceId}`;
        changes[`${configPath}/alertNumber`] = nextPreferences.smsNotifications ? normalizedPhone : '';
        changes[`${configPath}/smsEnabled`] = nextPreferences.smsNotifications;
        changes[`${configPath}/smsCritical`] = nextPreferences.smsCritical;
        changes[`${configPath}/smsWarning`] = false;
      });
      await update(ref(database), changes);
      setCurrentAccount((previous) => previous
        ? {
          ...previous,
          firstName: profile.firstName.trim(),
          lastName: profile.lastName.trim(),
          countryCode: profile.countryCode,
          countryName: profile.countryName,
          countryCallingCode: profile.countryCallingCode,
          phoneNumber: normalizedPhone,
          preferences: nextPreferences,
        }
        : previous);
      setPreferences(nextPreferences);
      return { success: true };
    } catch {
      return { success: false, error: 'Could not save your farm profile. Check your connection and database rules.' };
    }
  };

  const handleSaveSensorCalibration = async (
    key: CalibratableMetricKey,
    method: CalibrationMethod,
    points: CalibrationPoint[],
  ): Promise<AuthResult> => {
    if (!farmId || !selectedDeviceId) {
      return { success: false, error: 'Select a linked pond before calibrating its sensors.' };
    }
    const allowedMethods: Record<CalibratableMetricKey, CalibrationMethod[]> = {
      ph: ['two-point', 'three-point'],
      tds: ['one-point', 'two-point'],
      ec: ['two-point'],
      turbidity: ['one-point', 'two-point'],
      do: ['do-air', 'do-air-zero'],
    };
    const expectedPoints = method === 'three-point' ? 3
      : method === 'two-point' || method === 'do-air-zero' ? 2 : 1;
    if (!allowedMethods[key].includes(method) || points.length !== expectedPoints ||
      points.some((point) =>
        !Number.isFinite(point.referenceValue) ||
        !Number.isFinite(point.measuredValue) ||
        !Number.isFinite(point.voltage))) {
      return { success: false, error: 'Calibration points or method are invalid for this sensor.' };
    }
    if (points.some((point) => point.referenceValue < 0 || point.measuredValue < 0)) {
      return { success: false, error: 'Calibration references and readings cannot be negative.' };
    }
    if (key === 'ph' && points.some((point) => point.referenceValue > 14)) {
      return { success: false, error: 'pH reference points must be between 0 and 14.' };
    }
    if (key === 'tds' && points.some((point) => point.referenceValue > 1000)) {
      return { success: false, error: 'TDS calibration standards cannot exceed 1000 ppm.' };
    }
    const [firstPoint, secondPoint] = points;
    if (points.length === 1 && (firstPoint.referenceValue <= 0 || firstPoint.measuredValue <= 0)) {
      return { success: false, error: 'One-point calibration requires positive reference and sensor readings.' };
    }
    if (key === 'do' && method === 'do-air-zero' && secondPoint.referenceValue !== 0) {
      return { success: false, error: 'The second DO reference must be 0 mg/L for zero-oxygen calibration.' };
    }
    if (key === 'do' && method === 'do-air-zero' && firstPoint.referenceValue === 0) {
      return { success: false, error: 'The first DO reference must be the air calibration point.' };
    }
    if ((key === 'tds' || key === 'turbidity') && method === 'two-point' &&
      secondPoint.referenceValue === 0) {
      return { success: false, error: 'Use the zero/low standard as the first two-point reference.' };
    }
    if (secondPoint && points.some((point) => point.referenceValue === 0) &&
      !((key === 'do' && method === 'do-air-zero') ||
        ((key === 'tds' || key === 'turbidity') && method === 'two-point'))) {
      return { success: false, error: 'A zero reference is only supported for DO air/zero, TDS, or turbidity two-point calibration.' };
    }
    if (points.some((point) => point.measuredValue === 0 &&
      !(point.referenceValue === 0 && secondPoint &&
        ((key === 'do' && method === 'do-air-zero') ||
          ((key === 'tds' || key === 'turbidity') && method === 'two-point'))))) {
      return { success: false, error: 'A zero sensor reading is only valid at a supported zero-reference point.' };
    }
    if (points.some((point, index) => points.slice(index + 1).some((otherPoint) =>
      Math.abs(otherPoint.referenceValue - point.referenceValue) < 0.000001 ||
      Math.abs(otherPoint.measuredValue - point.measuredValue) < 0.000001))) {
      return { success: false, error: 'Multi-point calibration needs distinct reference values and sensor readings.' };
    }
    let adjustment: number;
    let offset: number;
    if (points.length === 1) {
      adjustment = firstPoint.referenceValue / firstPoint.measuredValue;
      offset = 0;
    } else {
      const meanMeasured = points.reduce((sum, point) => sum + point.measuredValue, 0) / points.length;
      const meanReference = points.reduce((sum, point) => sum + point.referenceValue, 0) / points.length;
      const measuredVariance = points.reduce(
        (sum, point) => sum + (point.measuredValue - meanMeasured) ** 2,
        0,
      );
      const covariance = points.reduce(
        (sum, point) => sum + (point.measuredValue - meanMeasured) * (point.referenceValue - meanReference),
        0,
      );
      adjustment = covariance / measuredVariance;
      offset = meanReference - adjustment * meanMeasured;
    }
    if (!Number.isFinite(adjustment) || adjustment <= 0 || !Number.isFinite(offset)) {
      return { success: false, error: 'Calibration points do not produce a valid sensor correction. Check both standards and readings.' };
    }
    const calibration: SensorCalibration = {
      referenceValue: firstPoint.referenceValue,
      measuredValue: firstPoint.measuredValue,
      adjustment,
      calibratedAt: Date.now(),
      method,
      points,
      offset,
    };
    try {
      await update(
        ref(database, `${ACCOUNTS_PATH}/${farmId}/sensorCalibrations/${selectedDeviceId}`),
        { [key]: calibration },
      );
      setCurrentAccount((previous) => previous
        ? {
            ...previous,
            sensorCalibrations: {
              ...previous.sensorCalibrations,
              [selectedDeviceId]: {
                ...previous.sensorCalibrations?.[selectedDeviceId],
                [key]: calibration,
              },
            },
          }
        : previous);
      return { success: true };
    } catch {
      return {
        success: false,
        error: 'Could not save the calibration to your account. Check your connection and Firebase rules.',
      };
    }
  };

  const handleClearSensorCalibration = async (
    key: CalibratableMetricKey,
  ): Promise<AuthResult> => {
    if (!farmId || !selectedDeviceId) {
      return { success: false, error: 'Select a linked pond before changing its sensor calibration.' };
    }
    try {
      await update(
        ref(database, `${ACCOUNTS_PATH}/${farmId}/sensorCalibrations/${selectedDeviceId}`),
        { [key]: null },
      );
      setCurrentAccount((previous) => {
        if (!previous) return previous;
        const nextDeviceCalibrations = { ...previous.sensorCalibrations?.[selectedDeviceId] };
        delete nextDeviceCalibrations[key];
        const nextCalibrations = { ...previous.sensorCalibrations };
        if (Object.keys(nextDeviceCalibrations).length > 0) {
          nextCalibrations[selectedDeviceId] = nextDeviceCalibrations;
        } else {
          delete nextCalibrations[selectedDeviceId];
        }
        return { ...previous, sensorCalibrations: nextCalibrations };
      });
      return { success: true };
    } catch {
      return {
        success: false,
        error: 'Could not remove the app adjustment. Check your connection and Firebase rules.',
      };
    }
  };

  const handleSaveTemperatureCalibration = async (
    referenceValue: number,
    measuredValue: number,
  ): Promise<AuthResult> => {
    if (!farmId || !selectedDeviceId) {
      return { success: false, error: 'Select a linked pond before calibrating its temperature sensor.' };
    }
    if (
      !Number.isFinite(referenceValue) ||
      !Number.isFinite(measuredValue) ||
      referenceValue < -55 ||
      referenceValue > 125 ||
      measuredValue < -55 ||
      measuredValue > 125
    ) {
      return { success: false, error: 'Temperature readings must be between -55 and 125 °C.' };
    }

    const calibration = {
      referenceValue,
      measuredValue,
      offset: referenceValue - measuredValue,
      calibratedAt: Date.now(),
    };
    try {
      await update(
        ref(database, `${ACCOUNTS_PATH}/${farmId}/sensorCalibrations/${selectedDeviceId}`),
        { temperature: calibration },
      );
      setCurrentAccount((previous) => previous
        ? {
            ...previous,
            sensorCalibrations: {
              ...previous.sensorCalibrations,
              [selectedDeviceId]: {
                ...previous.sensorCalibrations?.[selectedDeviceId],
                temperature: calibration,
              },
            },
          }
        : previous);
      return { success: true };
    } catch {
      return {
        success: false,
        error: 'Could not save the temperature calibration. Check your connection and Firebase rules.',
      };
    }
  };

  const handleClearTemperatureCalibration = async (): Promise<AuthResult> => {
    if (!farmId || !selectedDeviceId) {
      return { success: false, error: 'Select a linked pond before changing its temperature calibration.' };
    }
    try {
      await update(
        ref(database, `${ACCOUNTS_PATH}/${farmId}/sensorCalibrations/${selectedDeviceId}`),
        { temperature: null },
      );
      setCurrentAccount((previous) => {
        if (!previous) return previous;
        const nextDeviceCalibrations = { ...previous.sensorCalibrations?.[selectedDeviceId] };
        delete nextDeviceCalibrations.temperature;
        const nextCalibrations = { ...previous.sensorCalibrations };
        if (Object.keys(nextDeviceCalibrations).length > 0) {
          nextCalibrations[selectedDeviceId] = nextDeviceCalibrations;
        } else {
          delete nextCalibrations[selectedDeviceId];
        }
        return { ...previous, sensorCalibrations: nextCalibrations };
      });
      return { success: true };
    } catch {
      return {
        success: false,
        error: 'Could not remove the temperature adjustment. Check your connection and Firebase rules.',
      };
    }
  };

  const handleClaimDevice = async (deviceIdInput: string, claimCodeInput: string, nameInput: string): Promise<AuthResult> => {
    if (!farmId) return { success: false, error: 'Sign in before linking a device.' };
    const deviceId = deviceIdInput.trim();
    const claimCode = claimCodeInput;
    const name = nameInput.trim() || deviceId;
    if (!/^[A-Za-z0-9_-]{3,64}$/.test(deviceId)) {
      return { success: false, error: 'Enter a valid device ID (3–64 letters, numbers, hyphens, or underscores).' };
    }
    if (claimCode.length === 0 || claimCode.length > 128) {
      return { success: false, error: 'Enter the exact private claim code (1–128 characters). Any characters are allowed.' };
    }

    const claimRef = ref(database, `${DEVICE_CLAIMS_PATH}/${deviceId}`);
    try {
      const result = await runTransaction(claimRef, (current) => {
        if (current !== null) return;
        return { ownerUid: farmId, claimCode };
      });
      if (!result.committed) {
        return { success: false, error: 'This device is already linked to another account.' };
      }

      try {
        const nextDevices = { ...(currentAccount?.devices ?? {}), [deviceId]: { name } };
        const configPath = `deviceConfig/${deviceId}`;
        await update(ref(database), {
          [`${ACCOUNTS_PATH}/${farmId}/devices`]: nextDevices,
          [`${ACCOUNTS_PATH}/${farmId}/selectedDeviceId`]: deviceId,
          [`${configPath}/alertNumber`]: preferences.smsNotifications && currentAccount?.phoneNumber
            ? currentAccount.phoneNumber
            : '',
          [`${configPath}/smsEnabled`]: preferences.smsNotifications && Boolean(currentAccount?.phoneNumber),
          [`${configPath}/smsCritical`]: preferences.smsCritical,
          [`${configPath}/smsWarning`]: false,
        });
        setCurrentAccount((previous) => previous
          ? { ...previous, devices: nextDevices, selectedDeviceId: deviceId }
          : previous);
        setSelectedDeviceId(deviceId);
        setActiveTab('dashboard');
        return { success: true };
      } catch (error) {
        try {
          await runTransaction(claimRef, (current) => current?.ownerUid === farmId ? null : undefined);
        } catch {
          return {
            success: false,
            error: 'The device was claimed, but its account link could not be saved or rolled back. Check your connection and Firebase rules before retrying.',
          };
        }
        throw error;
      }
    } catch (error) {
      const details = error instanceof Error ? error.message : '';
      const mayAlreadyBeClaimed = /permission denied|permission_denied/i.test(details);
      return {
        success: false,
        error: details
          ? `Could not link device. ${mayAlreadyBeClaimed ? 'It may already be linked to another account, or the Firebase rules may not be configured yet. ' : ''}Check the ID, claim code, Firebase rules, and device provisioning. (${details})`
          : 'Could not link device. Check the ID, claim code, connection, and Firebase rules.',
      };
    }
  };

  const handleUpdateDeviceName = async (deviceId: string, nameInput: string): Promise<AuthResult> => {
    if (!farmId || !currentAccount?.devices?.[deviceId]) {
      return { success: false, error: 'This device is not linked to your account.' };
    }
    const name = nameInput.trim();
    if (!name || name.length > 64) {
      return { success: false, error: 'Enter a pond name between 1 and 64 characters.' };
    }
    try {
      await update(ref(database, `${ACCOUNTS_PATH}/${farmId}/devices/${deviceId}`), { name });
      setCurrentAccount((previous) => previous
        ? {
          ...previous,
          devices: {
            ...previous.devices,
            [deviceId]: { ...previous.devices?.[deviceId], name },
          },
        }
        : previous);
      return { success: true };
    } catch {
      return { success: false, error: 'Could not update this pond name. Check your connection and try again.' };
    }
  };

  const handleGetDeviceClaimCode = async (
    deviceId: string,
  ): Promise<{ success: true; claimCode: string } | { success: false; error: string }> => {
    if (!farmId || !currentAccount?.devices?.[deviceId]) {
      return { success: false, error: 'This device is not linked to your account.' };
    }
    try {
      const claimSnapshot = await get(ref(database, `${DEVICE_CLAIMS_PATH}/${deviceId}`));
      const claim = claimSnapshot.val() as { ownerUid?: string; claimCode?: string } | null;
      if (claim?.ownerUid !== farmId || typeof claim.claimCode !== 'string' || !claim.claimCode) {
        return { success: false, error: 'The private claim code is unavailable for this linked device.' };
      }
      return { success: true, claimCode: claim.claimCode };
    } catch {
      return { success: false, error: 'Could not load device information. Check your connection and database permissions.' };
    }
  };

  const handleSelectDevice = async (deviceId: string): Promise<AuthResult> => {
    if (!farmId || !currentAccount?.devices?.[deviceId]) {
      return { success: false, error: 'This device is not linked to your account.' };
    }
    try {
      await update(ref(database, `${ACCOUNTS_PATH}/${farmId}`), { selectedDeviceId: deviceId });
      setSelectedDeviceId(deviceId);
      setShowCalibrationScreen(false);
      setCurrentAccount((previous) => previous ? { ...previous, selectedDeviceId: deviceId } : previous);
      setActiveTab('dashboard');
      return { success: true };
    } catch {
      return { success: false, error: 'Could not select this device. Check your connection and try again.' };
    }
  };

  const handleUnlinkDevice = async (deviceId: string): Promise<AuthResult> => {
    if (!farmId || !currentAccount?.devices?.[deviceId]) {
      return { success: false, error: 'This device is not linked to your account.' };
    }
    const remainingDevices = { ...(currentAccount.devices ?? {}) };
    delete remainingDevices[deviceId];
    const nextSelectedDeviceId = selectedDeviceId === deviceId
      ? Object.keys(remainingDevices)[0] ?? null
      : selectedDeviceId;
    try {
      await update(ref(database), {
        [`${DEVICE_CLAIMS_PATH}/${deviceId}`]: null,
        [`${ACCOUNTS_PATH}/${farmId}/devices`]: remainingDevices,
        [`${ACCOUNTS_PATH}/${farmId}/selectedDeviceId`]: nextSelectedDeviceId,
        [`deviceConfig/${deviceId}/alertNumber`]: '',
        [`deviceConfig/${deviceId}/smsEnabled`]: false,
        [`deviceConfig/${deviceId}/smsCritical`]: false,
        [`deviceConfig/${deviceId}/smsWarning`]: false,
      });
      setSelectedDeviceId(nextSelectedDeviceId);
      setCurrentAccount((previous) => previous
        ? { ...previous, devices: remainingDevices, selectedDeviceId: nextSelectedDeviceId }
        : previous);
      return { success: true };
    } catch {
      return { success: false, error: 'Could not unlink the device. Check your connection and Firebase rules, then try again.' };
    }
  };

  const handleClearAllAlerts = async (): Promise<AuthResult> => {
    if (!farmId) return { success: false, error: 'Sign in before clearing alerts.' };
    const timestamp = Date.now();
    setAlertsClearing(true);
    try {
      await update(ref(database, `${ACCOUNTS_PATH}/${farmId}`), { clearedAlertsAt: timestamp });
      setClearedAlertsAt(timestamp);
      setCurrentAccount((previous) => previous ? { ...previous, clearedAlertsAt: timestamp } : previous);
      return { success: true };
    } catch {
      return { success: false, error: 'Could not save the alert dismissal. Check your connection and try again.' };
    } finally {
      setAlertsClearing(false);
    }
  };

  const handleDismissAlert = async (metricKey: MetricKey, detectedAt: number): Promise<AuthResult> => {
    if (!farmId || !selectedDeviceId) {
      return { success: false, error: 'Select a linked device before dismissing alerts.' };
    }
    try {
      await update(ref(database, `${ACCOUNTS_PATH}/${farmId}`), {
        [`dismissedAlerts/${selectedDeviceId}/${metricKey}`]: detectedAt,
      });
      setCurrentAccount((previous) => previous
        ? {
            ...previous,
            dismissedAlerts: {
              ...previous.dismissedAlerts,
              [selectedDeviceId]: {
                ...previous.dismissedAlerts?.[selectedDeviceId],
                [metricKey]: detectedAt,
              },
            },
          }
        : previous);
      return { success: true };
    } catch {
      return { success: false, error: 'Could not save this alert dismissal. Check your connection and try again.' };
    }
  };

  const togglePreference = async (key: keyof NotificationPreferences) => {
    if (!farmId) return;
    const next = { ...preferences, [key]: !preferences[key] };
    const savedPhone = currentAccount?.phoneNumber ?? '';
    if (
      key === 'smsNotifications' &&
      next.smsNotifications &&
      (!savedPhone || !/^\+[1-9]\d{7,14}$/.test(savedPhone))
    ) {
      Alert.alert(
        'Add a phone number',
        'Add a valid phone number in Account Profile before enabling SMS alerts.',
      );
      return;
    }
    try {
      const changes: Record<string, string | boolean | NotificationPreferences> = {
        [`${ACCOUNTS_PATH}/${farmId}/preferences`]: next,
      };
      const smsSetting = key === 'smsNotifications' || key === 'smsCritical';
      if (smsSetting) {
        managedDevices.forEach(({ deviceId }) => {
          const configPath = `deviceConfig/${deviceId}`;
          changes[`${configPath}/alertNumber`] = next.smsNotifications ? savedPhone : '';
          changes[`${configPath}/smsEnabled`] = next.smsNotifications;
          changes[`${configPath}/smsCritical`] = next.smsCritical;
          changes[`${configPath}/smsWarning`] = false;
        });
      }
      await update(ref(database), changes);
      setPreferences(next);
      setCurrentAccount((account) => account ? { ...account, preferences: next } : account);
    } catch {
      Alert.alert('Could not save setting', 'Check your connection and database rules, then try again.');
    }
  };

  useEffect(() => {
    if (!isAuthenticated || !preferences.pushNotifications) {
      setPushPermissionGranted(false);
      return;
    }

    const requestPushPermission = async () => {
      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('alerts', {
          name: 'Sensor alerts',
          importance: Notifications.AndroidImportance.HIGH,
          vibrationPattern: [0, 250, 250, 250],
        });
      }

      const existing = await Notifications.getPermissionsAsync();
      const permissions = existing.granted ? existing : await Notifications.requestPermissionsAsync();
      const granted =
        permissions.granted || permissions.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL;
      setPushPermissionGranted(granted);

      if (!granted) {
        Alert.alert('Notifications are disabled', 'Allow notifications in your device settings to receive sensor alerts.');
        togglePreference('pushNotifications');
      }
    };

    requestPushPermission();
  }, [isAuthenticated, preferences.pushNotifications]);

  // Pull live sensor data, unless Auto Refresh is turned off in Settings.
  useEffect(() => {
    if (!selectedDeviceId || !farmId) {
      setHistoryLogs([]);
      setHistoryHasMore(false);
      setHistoryLoading(false);
      return;
    }
    setHistoryLoading(true);
    setHistoryLogs([]);
    setHistoryHasMore(false);
    const historyPath = `${DEVICES_PATH}/${selectedDeviceId}/sensor_history`;
    const historyQuery = query(ref(database, historyPath), orderByChild('recordedAt'), limitToLast(HISTORY_PAGE_SIZE));
    let isInitialSnapshot = true;
    const unsubscribe = onValue(
      historyQuery,
      (snapshot) => {
        const data = snapshot.val() as Record<string, (PondReading & { recordedAt?: number }) | null> | null;
        const incomingLogs = Object.entries(data ?? [])
          .flatMap(([id, value]) => (value?.recordedAt
            ? [{
                ...applySensorCalibrations(value, sensorCalibrations),
                id,
                recordedAt: value.recordedAt,
              }]
            : []))
          .sort((a, b) => b.recordedAt - a.recordedAt);
        setHistoryLogs((previous) => {
          const merged = new Map(previous.map((log) => [log.id, log]));
          incomingLogs.forEach((log) => merged.set(log.id, log));
          return [...merged.values()].sort((a, b) => b.recordedAt - a.recordedAt);
        });
        if (isInitialSnapshot) {
          setHistoryHasMore(Object.keys(data ?? {}).length >= HISTORY_PAGE_SIZE);
          isInitialSnapshot = false;
        }
        setHistoryLoading(false);
      },
      () => {
        setHistoryLoading(false);
        Alert.alert('History unavailable', 'Could not load this device history. Check your connection and Firebase rules.');
      },
    );
    return unsubscribe;
  }, [farmId, selectedDeviceId, sensorCalibrations]);

  const handleLoadMoreHistory = async (): Promise<AuthResult> => {
    if (!farmId || !selectedDeviceId) {
      return { success: false, error: 'Select a linked device before loading its history.' };
    }
    const oldestLog = historyLogs[historyLogs.length - 1];
    if (!oldestLog) return { success: false, error: 'There are no older readings to load.' };

    setHistoryLoadingMore(true);
    try {
      const historyRef = ref(database, `${DEVICES_PATH}/${selectedDeviceId}/sensor_history`);
      const olderQuery = query(
        historyRef,
        orderByChild('recordedAt'),
        endAt(oldestLog.recordedAt - 1),
        limitToLast(HISTORY_PAGE_SIZE),
      );
      const snapshot = await get(olderQuery);
      const data = snapshot.val() as Record<string, (PondReading & { recordedAt?: number }) | null> | null;
      const olderLogs = Object.entries(data ?? [])
        .flatMap(([id, value]) => (value?.recordedAt
          ? [{
              ...applySensorCalibrations(value, sensorCalibrations),
              id,
              recordedAt: value.recordedAt,
            }]
          : []));
      setHistoryLogs((previous) => {
        const merged = new Map(previous.map((log) => [log.id, log]));
        olderLogs.forEach((log) => merged.set(log.id, log));
        return [...merged.values()].sort((a, b) => b.recordedAt - a.recordedAt);
      });
      setHistoryHasMore(Object.keys(data ?? {}).length >= HISTORY_PAGE_SIZE);
      return { success: true };
    } catch {
      return { success: false, error: 'Could not load older readings. Check your connection and Firebase permissions.' };
    } finally {
      setHistoryLoadingMore(false);
    }
  };

  const handleClearHistory = async (): Promise<AuthResult> => {
    if (!farmId || !selectedDeviceId) {
      return { success: false, error: 'Select a linked device before clearing its history.' };
    }
    setHistoryClearing(true);
    try {
      await remove(ref(database, `${DEVICES_PATH}/${selectedDeviceId}/sensor_history`));
      setHistoryLogs([]);
      setHistoryHasMore(false);
      return { success: true };
    } catch {
      return { success: false, error: 'Could not clear this device history. Check your connection and Firebase permissions.' };
    } finally {
      setHistoryClearing(false);
    }
  };

  const getLogsForHistoryDate = async (dateKey: string): Promise<
    { success: true; logs: SensorLog[] } | { success: false; error: string }
  > => {
    if (!farmId || !selectedDeviceId) {
      return { success: false, error: 'Select a linked device before accessing its history.' };
    }
    const [year, month, day] = dateKey.split('-').map(Number);
    const start = new Date(year, month - 1, day).getTime();
    const end = new Date(year, month - 1, day + 1).getTime();
    try {
      const dayQuery = query(
        ref(database, `${DEVICES_PATH}/${selectedDeviceId}/sensor_history`),
        orderByChild('recordedAt'),
        startAt(start),
        endAt(end - 1),
      );
      const snapshot = await get(dayQuery);
      const data = snapshot.val() as Record<string, (PondReading & { recordedAt?: number }) | null> | null;
      const logs = Object.entries(data ?? []).flatMap(([id, value]) => (
        value?.recordedAt
          ? [{ ...applySensorCalibrations(value, sensorCalibrations), id, recordedAt: value.recordedAt }]
          : []
      )).sort((a, b) => a.recordedAt - b.recordedAt);
      return { success: true, logs };
    } catch {
      return { success: false, error: 'Could not access readings for this date. Check your connection and Firebase permissions.' };
    }
  };

  const handleDeleteHistoryDate = async (dateKey: string): Promise<AuthResult> => {
    if (!selectedDeviceId) return { success: false, error: 'Select a linked device before deleting history.' };
    const result = await getLogsForHistoryDate(dateKey);
    if (!result.success) return { success: false, error: result.error };
    if (result.logs.length === 0) return { success: true };

    try {
      const changes: Record<string, null> = {};
      result.logs.forEach(({ id }) => {
        changes[`${DEVICES_PATH}/${selectedDeviceId}/sensor_history/${id}`] = null;
      });
      await update(ref(database), changes);
      setHistoryLogs((previous) => previous.filter((log) => !result.logs.some((deleted) => deleted.id === log.id)));
      return { success: true };
    } catch {
      return { success: false, error: 'Could not delete readings for this date from Firebase. Check your connection and permissions.' };
    }
  };

  const handleDownloadHistoryDate = async (dateKey: string): Promise<
    { success: true; logs: SensorLog[] } | { success: false; error: string }
  > => getLogsForHistoryDate(dateKey);

  const handleClearSerialMonitor = async (): Promise<AuthResult> => {
    if (!farmId || !selectedDeviceId) {
      return { success: false, error: 'Select a linked device before clearing its serial monitor.' };
    }

    const sequenceByBoot = new Map<string, number>();
    deviceSerialLogs.forEach(({ id }) => {
      const match = /^(.+)-(\d+)$/.exec(id);
      if (!match) return;
      const sequence = Number(match[2]);
      if (Number.isSafeInteger(sequence)) {
        sequenceByBoot.set(match[1], Math.max(sequenceByBoot.get(match[1]) ?? 0, sequence));
      }
    });
    const clearMarker = [...sequenceByBoot.entries()]
      .map(([bootId, sequence]) => `${bootId}:${sequence}`)
      .join(',');

    try {
      const changes: Record<string, null | string> = {
        [`${DEVICES_PATH}/${selectedDeviceId}/serial_monitor`]: null,
      };
      if (clearMarker) {
        changes[`deviceConfig/${selectedDeviceId}/serialLogClear`] = clearMarker;
      }
      await update(ref(database), changes);
      setDeviceSerialLogs([]);
      return { success: true };
    } catch {
      return { success: false, error: 'Could not clear serial monitor data from Firebase. Check your connection and database rules.' };
    }
  };

  // Pull live sensor data, unless Auto Refresh is turned off in Settings.
  useEffect(() => {
    if (!farmId || !selectedDeviceId) {
      setIsLive(false);
      setDeviceReading(demoReading);
      setSensorVoltages({});
      setVoltageUpdatedAt(null);
      setHistoryLogs([]);
      return;
    }
    setIsLive(false);
    setDeviceReading(demoReading);
    setSensorVoltages({});
    setVoltageUpdatedAt(null);
    setAlertDetectedAt({});
    const deviceDataPath = `${DEVICES_PATH}/${selectedDeviceId}/live_data`;
    const pondRef = ref(database, deviceDataPath);
    const unsubscribe = onValue(
      pondRef,
      (snapshot) => {
        if (!preferences.autoRefresh) return;

        const data = snapshot.val() as
          | (Partial<Record<keyof PondReading, number | string>> &
            Partial<Record<`${CalibratableMetricKey}Voltage`, number | string>> &
            { ntu?: number | string })
          | null;
        if (!data) {
          setIsLive(false);
          setSensorVoltages({});
          setVoltageUpdatedAt(null);
          return;
        }

        const nextReading: PondReading = {
          temp: Number(data.temp ?? demoReading.temp),
          ec: Number(data.ec ?? demoReading.ec),
          do: Number(data.do ?? demoReading.do),
          ph: Number(data.ph ?? demoReading.ph),
          tds: Number(data.tds ?? demoReading.tds),
          turbidity: Number(data.turbidity ?? data.ntu ?? demoReading.turbidity),
        };
        const recordedAt = Date.now();
        const nextVoltages: SensorVoltages = {};
        (['ph', 'tds', 'ec', 'turbidity', 'do'] as const).forEach((key) => {
          const voltage = Number(data[`${key}Voltage`]);
          if (data[`${key}Voltage`] !== undefined && Number.isFinite(voltage)) {
            nextVoltages[`${key}Voltage`] = voltage;
          }
        });
        push(ref(database, `${DEVICES_PATH}/${selectedDeviceId}/sensor_history`), { ...nextReading, recordedAt });
        setDeviceReading(nextReading);
        setSensorVoltages(nextVoltages);
        setVoltageUpdatedAt(recordedAt);
        setIsLive(true);
        setLastUpdated(new Date());
      },
      () => {
        setIsLive(false);
        setSensorVoltages({});
        setVoltageUpdatedAt(null);
        Alert.alert('Sensor unavailable', 'Could not read this device. It may be offline or Firebase access may not be configured.');
      },
    );
    return unsubscribe;
  }, [farmId, preferences.autoRefresh, selectedDeviceId]);

  useEffect(() => {
    if (!showCalibrationScreen || !farmId || !selectedDeviceId) {
      setDeviceSerialLogs([]);
      return;
    }

    const serialMonitorRef = ref(database, `${DEVICES_PATH}/${selectedDeviceId}/serial_monitor`);
    const unsubscribe = onValue(
      serialMonitorRef,
      (snapshot) => {
        const data = snapshot.val() as
          | { entries?: Record<string, Partial<DeviceSerialLog>> | DeviceSerialLog[] }
          | null;
        const entries = data?.entries;
        const values = Array.isArray(entries) ? entries : Object.values(entries ?? {});
        setDeviceSerialLogs(values.flatMap((entry) => (
          typeof entry?.id === 'string' &&
          typeof entry.message === 'string' &&
          typeof entry.uptimeMs === 'number' &&
          Number.isFinite(entry.uptimeMs)
            ? [{ id: entry.id, message: entry.message, uptimeMs: entry.uptimeMs }]
            : []
        )).slice(-12));
      },
      () => {
        setDeviceSerialLogs([]);
        Alert.alert(
          'Serial monitor unavailable',
          'Could not read firmware logs. Check your connection and publish the updated Firebase database rules.',
        );
      },
    );
    return unsubscribe;
  }, [farmId, selectedDeviceId, showCalibrationScreen]);

  // Track the first moment each metric started breaching its safe range, so
  // the Alerts screen can show "X minutes/hours ago" per alert.
  useEffect(() => {
    setAlertDetectedAt((prev) => {
      let changed = false;
      const next = { ...prev };

      metrics.forEach((metric) => {
        const severity = metric.getSeverity(reading[metric.key]);
        if (severity && !next[metric.key]) {
          next[metric.key] = new Date();
          changed = true;
        } else if (!severity && next[metric.key]) {
          delete next[metric.key];
          changed = true;
        }
      });

      return changed ? next : prev;
    });
  }, [reading]);

  const activeAlerts: ActiveAlert[] = useMemo(() => {
    if (!selectedDeviceId || !isLive) return [];
    return metrics.flatMap((metric) => {
      const value = reading[metric.key];
      const severity = metric.getSeverity(value);
      if (!severity) return [];
      return [
        {
          metric,
          value,
          severity,
          detectedAt: alertDetectedAt[metric.key] ?? new Date(),
        },
      ];
    });
  }, [reading, alertDetectedAt, isLive, selectedDeviceId]);

  const hasAlert = activeAlerts.length > 0;

  const previousActiveAlertKeys = useRef<Set<string>>(new Set());
  useEffect(() => {
    setHasUnreadAlerts(false);
    previousActiveAlertKeys.current = new Set();
  }, [farmId]);

  useEffect(() => {
    const currentAlertKeys = new Set(
      activeAlerts.map((alert) => `${farmId}:${selectedDeviceId}:${alert.metric.key}`),
    );
    const hasNewAlert = [...currentAlertKeys].some((key) => !previousActiveAlertKeys.current.has(key));

    if (hasNewAlert && activeTab !== 'alert') {
      setHasUnreadAlerts(true);
    }

    previousActiveAlertKeys.current = currentAlertKeys;
  }, [activeAlerts, activeTab, farmId, selectedDeviceId]);

  useEffect(() => {
    if (activeTab === 'alert') {
      setHasUnreadAlerts(false);
    }
  }, [activeTab]);

  // Suppress initial readings and throttle repeat incidents caused by noisy sensor values.
  const notificationState = useRef<{
    deviceId: string | null;
    initialized: boolean;
    severities: Partial<Record<MetricKey, ActiveAlert['severity']>>;
    lastSentAt: Partial<Record<MetricKey, number>>;
    criticalSent: Partial<Record<MetricKey, boolean>>;
  }>({
    deviceId: null,
    initialized: false,
    severities: {},
    lastSentAt: {},
    criticalSent: {},
  });
  useEffect(() => {
    const state = notificationState.current;
    if (state.deviceId !== selectedDeviceId) {
      state.deviceId = selectedDeviceId;
      state.initialized = false;
      state.severities = {};
      state.criticalSent = {};
    }
    if (!selectedDeviceId || !isLive) return;

    const currentSeverities: Partial<Record<MetricKey, ActiveAlert['severity']>> = {};
    activeAlerts.forEach((alert) => {
      currentSeverities[alert.metric.key] = alert.severity;
    });

    if (!state.initialized) {
      state.severities = currentSeverities;
      state.criticalSent = Object.fromEntries(
        activeAlerts.filter((alert) => alert.severity === 'critical').map((alert) => [alert.metric.key, true]),
      );
      state.initialized = true;
      return;
    }

    const now = Date.now();
    const cooldownMs = 15 * 60 * 1000;
    const notificationsToSend: ActiveAlert[] = [];
    activeAlerts.forEach((alert) => {
      const key = alert.metric.key;
      const previousSeverity = state.severities[key];
      const enabled = preferences.pushNotifications &&
        pushPermissionGranted &&
        (alert.severity === 'critical' ? preferences.alertNotifications : preferences.warningNotifications);
      const isNewIncident = !previousSeverity;
      const isCriticalEscalation = previousSeverity === 'warning' &&
        alert.severity === 'critical' &&
        !state.criticalSent[key];
      const cooldownExpired = !state.lastSentAt[key] || now - state.lastSentAt[key]! >= cooldownMs;

      if (enabled && ((isNewIncident && cooldownExpired) || isCriticalEscalation)) {
        notificationsToSend.push(alert);
        state.lastSentAt[key] = now;
      }
      if (alert.severity === 'critical') state.criticalSent[key] = true;
    });

    metrics.forEach((metric) => {
      if (!currentSeverities[metric.key]) state.criticalSent[metric.key] = false;
    });
    state.severities = currentSeverities;

    if (notificationsToSend.length > 0) {
      const labels = notificationsToSend.slice(0, 3).map((alert) =>
        `${alert.severity === 'critical' ? 'Critical' : 'Warning'} ${alert.metric.label}`,
      );
      const remaining = notificationsToSend.length - labels.length;
      const alertSummary = [...labels, ...(remaining > 0 ? [`+${remaining} more`] : [])].join(', ');
      const readingSummary = notificationsToSend.slice(0, 3).map((alert) =>
        `${formatValue(alert.value, alert.metric.key)} ${alert.metric.unit}`,
      ).join(' · ');
      Notifications.scheduleNotificationAsync({
        content: {
          title: `${notificationsToSend.length} pond alert${notificationsToSend.length === 1 ? '' : 's'}`,
          body: `${alertSummary}: ${readingSummary}`,
          sound: 'default',
        },
        trigger: null,
      }).catch((error: unknown) => {
        console.warn('Could not schedule pond alert notification.', error);
      });
    }
  }, [
    activeAlerts,
    isLive,
    preferences.alertNotifications,
    preferences.pushNotifications,
    preferences.warningNotifications,
    pushPermissionGranted,
    selectedDeviceId,
  ]);

  // Vibrate on newly detected critical alerts, if Sound Alerts is enabled.
  const previousCriticalKeys = useRef<Set<MetricKey>>(new Set());
  useEffect(() => {
    const currentCriticalKeys = new Set(
      activeAlerts.filter((alert) => alert.severity === 'critical').map((alert) => alert.metric.key),
    );
    const hasNewCritical = [...currentCriticalKeys].some((key) => !previousCriticalKeys.current.has(key));

    if (hasNewCritical && preferences.soundAlerts) {
      Vibration.vibrate(400);
    }

    previousCriticalKeys.current = currentCriticalKeys;
  }, [activeAlerts, preferences.soundAlerts]);

  if (!authReady) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top', 'right', 'bottom', 'left']}>
        <StatusBar style="dark" />
        <View style={{ alignItems: 'center', flex: 1, justifyContent: 'center' }}>
          <ActivityIndicator color="#078A95" size="large" />
        </View>
      </SafeAreaView>
    );
  }

  if (!isAuthenticated) {
    if (authScreen === 'signup') {
      return (
        <SignupScreen
          onVerifyGoogle={handleVerifyGoogleForSignUp}
          onCreateAccount={handleCreateAccount}
          onNavigateSignIn={handleLeaveSignUp}
        />
      );
    }
    return (
      <LoginScreen
        onVerifyGoogle={handleVerifyGoogleForSignIn}
        onCompleteSignIn={handleCompleteSignIn}
        onNavigateSignUp={() => setAuthScreen('signup')}
      />
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'right', 'bottom', 'left']}>
      <StatusBar style="dark" />

      <View style={styles.screenContainer}>
        {showCalibrationScreen ? (
          <CalibrationHomeScreen
            deviceName={selectedDevice?.name ?? null}
            deviceId={selectedDeviceId}
            firmwareSerialLogs={deviceSerialLogs}
            onClearSerialMonitor={handleClearSerialMonitor}
            reading={reading}
            rawReading={deviceReading}
            voltages={sensorVoltages}
            voltageUpdatedAt={voltageUpdatedAt}
            isLive={isLive}
            hasAlert={hasAlert}
            calibrations={sensorCalibrations}
            onSave={handleSaveSensorCalibration}
            onClear={handleClearSensorCalibration}
            onSaveTemperature={handleSaveTemperatureCalibration}
            onClearTemperature={handleClearTemperatureCalibration}
          />
        ) : null}
        {!showCalibrationScreen && activeTab === 'dashboard' && (
          <DashboardScreen
            reading={reading}
            isLive={isLive}
            lastUpdated={lastUpdated}
            hasAlert={hasAlert}
            greetingName={[currentAccount?.firstName, currentAccount?.lastName].filter(Boolean).join(' ') || 'there'}
            deviceName={selectedDevice?.name ?? null}
            devices={managedDevices}
            selectedDeviceId={selectedDeviceId}
            autoRefreshPaused={!preferences.autoRefresh}
            onManageDevices={() => setActiveTab('settings')}
            onOpenSmsSettings={() => {
              setFocusSmsSettings(true);
              setActiveTab('settings');
            }}
            onSelectDevice={handleSelectDevice}
          />
        )}
        {!showCalibrationScreen && activeTab === 'alert' && (
          <AlertScreen
            activeAlerts={activeAlerts}
            hasDevice={selectedDevice !== null}
            showCritical={preferences.alertNotifications}
            showWarning={preferences.warningNotifications}
            clearedAlertsAt={clearedAlertsAt}
            dismissedAlerts={currentAccount?.dismissedAlerts?.[selectedDeviceId ?? ''] ?? {}}
            isClearing={alertsClearing}
            onClearAll={handleClearAllAlerts}
            onDismissAlert={handleDismissAlert}
          />
        )}
        {!showCalibrationScreen && activeTab === 'history' && (
          <HistoryScreen
            logs={historyLogs}
            isLoading={historyLoading}
            isClearing={historyClearing}
            onClearHistory={handleClearHistory}
            hasMore={historyHasMore}
            isLoadingMore={historyLoadingMore}
            onLoadMore={handleLoadMoreHistory}
            onDeleteDate={handleDeleteHistoryDate}
            onDownloadDate={handleDownloadHistoryDate}
          />
        )}
        {!showCalibrationScreen && activeTab === 'settings' && (
          <SettingsScreen
            devices={managedDevices}
            selectedDeviceId={selectedDeviceId}
            accountEmail={currentAccount?.email ?? ''}
            firstName={currentAccount?.firstName ?? ''}
            lastName={currentAccount?.lastName ?? ''}
            countryCode={currentAccount?.countryCode ?? 'PH'}
            countryName={currentAccount?.countryName ?? 'Philippines'}
            countryCallingCode={currentAccount?.countryCallingCode ?? '63'}
            phoneNumber={currentAccount?.phoneNumber ?? ''}
            reading={reading}
            lastUpdated={lastUpdated}
            historyLogs={historyLogs}
            preferences={preferences}
            focusSmsSettings={focusSmsSettings}
            onTogglePreference={togglePreference}
            onSmsSettingsFocused={() => setFocusSmsSettings(false)}
            onUpdateAccountProfile={handleUpdateAccountProfile}
            onClaimDevice={handleClaimDevice}
            onUpdateDeviceName={handleUpdateDeviceName}
            onGetDeviceClaimCode={handleGetDeviceClaimCode}
            onSelectDevice={handleSelectDevice}
            onUnlinkDevice={handleUnlinkDevice}
            onLogout={handleLogout}
            onDeleteAccount={handleDeleteAccount}
          />
        )}
      </View>

      <TabBar
        activeTab={activeTab}
        onChangeTab={(tab) => {
          if (tab === 'calibration') {
            setShowCalibrationScreen(true);
            setActiveTab('calibration');
            return;
          }
          setShowCalibrationScreen(false);
          setActiveTab(tab);
        }}
        hasUnreadAlerts={hasUnreadAlerts}
      />
    </SafeAreaView>
  );
}

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AppContent />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
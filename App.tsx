import { StatusBar } from 'expo-status-bar';
import * as Notifications from 'expo-notifications';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import {
  deleteUser,
  GoogleAuthProvider,
  reauthenticateWithCredential,
  signInWithCredential,
  signOut,
} from 'firebase/auth';
import { get, limitToLast, onValue, orderByChild, push, query, ref, runTransaction, set, update } from 'firebase/database';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Platform, SafeAreaView, Vibration, View } from 'react-native';

import TabBar from './components/TabBar';
import { auth, db as database, GOOGLE_WEB_CLIENT_ID } from './firebaseConfig';
import { demoReading, formatValue, metrics } from './metrics';
import AlertScreen from './screens/AlertScreen';
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
  ManagedDevice,
  MetricKey,
  NotificationPreferences,
  PondReading,
  SensorLog,
  TabKey,
} from './types';

const ACCOUNTS_PATH = 'IsdaApp/accounts';
const DEVICE_CLAIMS_PATH = 'deviceClaims';
const DEVICES_PATH = 'devices';

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
  devices?: Record<string, { name: string }>;
  selectedDeviceId?: string | null;
};

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

export default function App() {
  const [reading, setReading] = useState<PondReading>(demoReading);
  const [isLive, setIsLive] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(new Date());
  const [activeTab, setActiveTab] = useState<TabKey>('dashboard');
  const [focusSmsSettings, setFocusSmsSettings] = useState(false);
  const [alertDetectedAt, setAlertDetectedAt] = useState<Partial<Record<MetricKey, Date>>>({});
  const [farmId, setFarmId] = useState<string | null>(null);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);
  const [authScreen, setAuthScreen] = useState<AuthScreen>('login');
  const [currentAccount, setCurrentAccount] = useState<StoredAccount | null>(null);
  const [preferences, setPreferences] = useState<NotificationPreferences>(DEFAULT_PREFERENCES);
  const [clearedAlertsAt, setClearedAlertsAt] = useState<number | null>(null);
  const [historyLogs, setHistoryLogs] = useState<SensorLog[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [pushPermissionGranted, setPushPermissionGranted] = useState(false);

  const isAuthenticated = farmId !== null;
  const managedDevices: ManagedDevice[] = Object.entries(currentAccount?.devices ?? {}).map(
    ([deviceId, device]) => ({ deviceId, name: device.name || deviceId }),
  );
  const selectedDevice = managedDevices.find((device) => device.deviceId === selectedDeviceId) ?? null;

  // Each account is stored under its Firebase Auth UID, so account reads stay
  // scoped to the Google account that authenticated.
  useEffect(() => {
    if (!farmId) {
      setCurrentAccount(null);
      return;
    }
    const unsubscribe = onValue(
      ref(database, `${ACCOUNTS_PATH}/${farmId}`),
      (snapshot) => setCurrentAccount(snapshot.val() as StoredAccount | null),
      () => Alert.alert('Account unavailable', 'Could not load account settings. Check your connection and database rules.'),
    );
    return unsubscribe;
  }, [farmId]);

  // Sync local preferences whenever this account record changes.
  useEffect(() => {
    setPreferences({ ...DEFAULT_PREFERENCES, ...currentAccount?.preferences });
    setClearedAlertsAt(currentAccount?.clearedAlertsAt ?? null);
    const devices = currentAccount?.devices ?? {};
    const savedSelection = currentAccount?.selectedDeviceId;
    setSelectedDeviceId(savedSelection && devices[savedSelection] ? savedSelection : null);
  }, [currentAccount]);

  const authenticateWithGoogle = async () => {
    await GoogleSignin.signOut();
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
    if (!user.emailVerified) {
      throw new Error('Verify this email address with Google before continuing.');
    }
    return user;
  };

  const handleSignUp = async (onStepChange: (step: number) => void): Promise<AuthResult> => {
    try {
      const user = await authenticateWithGoogle();
      onStepChange(1);
      const email = user.email?.trim().toLowerCase();
      if (!email) {
        return { success: false, error: 'The selected Google account does not have an email address.' };
      }
      const account: StoredAccount = {
        authUid: user.uid,
        email,
        farmName: 'Pond one',
        preferences: DEFAULT_PREFERENCES,
      };
      const accountRef = ref(database, `${ACCOUNTS_PATH}/${user.uid}`);
      const result = await runTransaction(accountRef, (current) => current ? undefined : account);
      const storedAccount = result.snapshot.val() as StoredAccount | null;
      if (!result.committed || !storedAccount) {
        return { success: false, error: 'This Google account already has an app account. Sign in instead.' };
      }
      setCurrentAccount(storedAccount);
      setFarmId(user.uid);
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Google sign-up failed. Please try again.',
      };
    }
  };

  const handleSignIn = async (): Promise<AuthResult> => {
    try {
      const user = await authenticateWithGoogle();
      const accountRef = ref(database, `${ACCOUNTS_PATH}/${user.uid}`);
      const accountSnapshot = await get(accountRef);
      const account = accountSnapshot.val() as (StoredAccount & { pin?: string | null }) | null;
      if (!account) {
        return { success: false, error: 'No account is registered for this Google account. Please sign up first.' };
      }

      if (Object.prototype.hasOwnProperty.call(account, 'pin')) {
        await update(accountRef, { pin: null });
      }

      const accountWithoutPin = { ...account };
      delete accountWithoutPin.pin;
      setCurrentAccount(accountWithoutPin);
      setFarmId(user.uid);
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Google sign-in failed. Please try again.',
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

  const handleUpdateFarmProfile = async (newName: string, phoneNumber: string): Promise<AuthResult> => {
    if (!farmId) return { success: false, error: 'You are not signed in.' };
    const trimmed = newName.trim();
    if (!trimmed) return { success: false, error: 'Farm name cannot be empty.' };
    const normalizedPhone = phoneNumber.trim();
    if (preferences.smsNotifications && !/^\+[1-9]\d{7,14}$/.test(normalizedPhone)) {
      return { success: false, error: 'Enter a valid phone number with + and country code, such as +639171234567.' };
    }
    try {
      const changes: Record<string, string | boolean> = {
        [`${ACCOUNTS_PATH}/${farmId}/farmName`]: trimmed,
        [`${ACCOUNTS_PATH}/${farmId}/phoneNumber`]: normalizedPhone,
      };
      managedDevices.forEach(({ deviceId }) => {
        const configPath = `deviceConfig/${deviceId}`;
        changes[`${configPath}/alertNumber`] = preferences.smsNotifications ? normalizedPhone : '';
        changes[`${configPath}/smsEnabled`] = preferences.smsNotifications;
        changes[`${configPath}/smsCritical`] = preferences.smsCritical;
        changes[`${configPath}/smsWarning`] = preferences.smsWarning;
      });
      await update(ref(database), changes);
      setCurrentAccount((previous) => previous ? { ...previous, farmName: trimmed, phoneNumber: normalizedPhone } : previous);
      return { success: true };
    } catch {
      return { success: false, error: 'Could not save your farm profile. Check your connection and database rules.' };
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
          [`${configPath}/alertNumber`]: preferences.smsNotifications ? currentAccount?.phoneNumber ?? '' : '',
          [`${configPath}/smsEnabled`]: preferences.smsNotifications,
          [`${configPath}/smsCritical`]: preferences.smsCritical,
          [`${configPath}/smsWarning`]: preferences.smsWarning,
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

  const handleSelectDevice = async (deviceId: string): Promise<AuthResult> => {
    if (!farmId || !currentAccount?.devices?.[deviceId]) {
      return { success: false, error: 'This device is not linked to your account.' };
    }
    try {
      await update(ref(database, `${ACCOUNTS_PATH}/${farmId}`), { selectedDeviceId: deviceId });
      setSelectedDeviceId(deviceId);
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

  const handleClearAllAlerts = () => {
    if (!farmId) return;
    const timestamp = Date.now();
    setClearedAlertsAt(timestamp);
    update(ref(database, `${ACCOUNTS_PATH}/${farmId}`), { clearedAlertsAt: timestamp });
  };

  const togglePreference = async (key: keyof NotificationPreferences) => {
    if (!farmId) return;
    const next = { ...preferences, [key]: !preferences[key] };
    const savedPhone = currentAccount?.phoneNumber ?? '';
    if (
      key === 'smsNotifications' &&
      next.smsNotifications &&
      savedPhone.length > 0 &&
      !/^\+[1-9]\d{7,14}$/.test(savedPhone)
    ) {
      Alert.alert(
        'Update phone number',
        'Save the recipient number in international format, including + and country code, before enabling SMS.',
      );
      return;
    }
    try {
      const changes: Record<string, string | boolean | NotificationPreferences> = {
        [`${ACCOUNTS_PATH}/${farmId}/preferences`]: next,
      };
      const smsSetting = key === 'smsNotifications' || key === 'smsCritical' || key === 'smsWarning';
      if (smsSetting) {
        managedDevices.forEach(({ deviceId }) => {
          const configPath = `deviceConfig/${deviceId}`;
          changes[`${configPath}/alertNumber`] = next.smsNotifications ? savedPhone : '';
          changes[`${configPath}/smsEnabled`] = next.smsNotifications;
          changes[`${configPath}/smsCritical`] = next.smsCritical;
          changes[`${configPath}/smsWarning`] = next.smsWarning;
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
      setHistoryLoading(false);
      return;
    }
    setHistoryLoading(true);
    const historyPath = `${DEVICES_PATH}/${selectedDeviceId}/sensor_history`;
    const historyQuery = query(ref(database, historyPath), orderByChild('recordedAt'), limitToLast(50));
    const unsubscribe = onValue(
      historyQuery,
      (snapshot) => {
        const data = snapshot.val() as Record<string, (PondReading & { recordedAt?: number }) | null> | null;
        const logs = Object.entries(data ?? [])
          .flatMap(([id, value]) => (value?.recordedAt ? [{ ...value, id, recordedAt: value.recordedAt }] : []))
          .sort((a, b) => b.recordedAt - a.recordedAt);
        setHistoryLogs(logs);
        setHistoryLoading(false);
      },
      () => {
        setHistoryLoading(false);
        Alert.alert('History unavailable', 'Could not load this device history. Check your connection and Firebase rules.');
      },
    );
    return unsubscribe;
  }, [farmId, selectedDeviceId]);

  // Pull live sensor data, unless Auto Refresh is turned off in Settings.
  useEffect(() => {
    if (!farmId || !selectedDeviceId) {
      setIsLive(false);
      setReading(demoReading);
      setHistoryLogs([]);
      return;
    }
    setIsLive(false);
    setReading(demoReading);
    setAlertDetectedAt({});
    const deviceDataPath = `${DEVICES_PATH}/${selectedDeviceId}/live_data`;
    const pondRef = ref(database, deviceDataPath);
    const unsubscribe = onValue(
      pondRef,
      (snapshot) => {
        if (!preferences.autoRefresh) return;

        const data = snapshot.val() as
          | (Partial<Record<keyof PondReading, number | string>> & { ntu?: number | string })
          | null;
        if (!data) {
          setIsLive(false);
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
        push(ref(database, `${DEVICES_PATH}/${selectedDeviceId}/sensor_history`), { ...nextReading, recordedAt });
        setReading(nextReading);
        setIsLive(true);
        setLastUpdated(new Date());
      },
      () => {
        setIsLive(false);
        Alert.alert('Sensor unavailable', 'Could not read this device. It may be offline or Firebase access may not be configured.');
      },
    );
    return unsubscribe;
  }, [farmId, preferences.autoRefresh, selectedDeviceId]);

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

  if (!isAuthenticated) {
    if (authScreen === 'signup') {
      return (
        <SignupScreen
          onSignUp={handleSignUp}
          onNavigateSignIn={() => setAuthScreen('login')}
        />
      );
    }
    return (
      <LoginScreen
        onSignIn={handleSignIn}
        onNavigateSignUp={() => setAuthScreen('signup')}
      />
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="dark" />

      <View style={styles.screenContainer}>
        {activeTab === 'dashboard' && (
          <DashboardScreen
            reading={reading}
            isLive={isLive}
            lastUpdated={lastUpdated}
            hasAlert={hasAlert}
            farmName={currentAccount?.farmName ?? 'Pond one'}
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
        {activeTab === 'alert' && (
          <AlertScreen
            activeAlerts={activeAlerts}
            hasDevice={selectedDevice !== null}
            showCritical={preferences.alertNotifications}
            showWarning={preferences.warningNotifications}
            clearedAlertsAt={clearedAlertsAt}
            onClearAll={handleClearAllAlerts}
          />
        )}
        {activeTab === 'history' && <HistoryScreen logs={historyLogs} isLoading={historyLoading} />}
        {activeTab === 'settings' && (
          <SettingsScreen
            farmName={currentAccount?.farmName ?? 'Pond one'}
            devices={managedDevices}
            selectedDeviceId={selectedDeviceId}
            accountEmail={currentAccount?.email ?? ''}
            phoneNumber={currentAccount?.phoneNumber ?? ''}
            reading={reading}
            lastUpdated={lastUpdated}
            historyLogs={historyLogs}
            preferences={preferences}
            focusSmsSettings={focusSmsSettings}
            onTogglePreference={togglePreference}
            onSmsSettingsFocused={() => setFocusSmsSettings(false)}
            onUpdateFarmProfile={handleUpdateFarmProfile}
            onClaimDevice={handleClaimDevice}
            onSelectDevice={handleSelectDevice}
            onUnlinkDevice={handleUnlinkDevice}
            onLogout={handleLogout}
            onDeleteAccount={handleDeleteAccount}
          />
        )}
      </View>

      <TabBar activeTab={activeTab} onChangeTab={setActiveTab} hasAlert={hasAlert} />
    </SafeAreaView>
  );
}
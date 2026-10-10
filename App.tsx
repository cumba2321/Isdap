import { StatusBar } from 'expo-status-bar';
import * as Notifications from 'expo-notifications';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import { GoogleAuthProvider, signInWithCredential, signOut } from 'firebase/auth';
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
  MetricKey,
  NotificationPreferences,
  PondReading,
  SensorLog,
  TabKey,
} from './types';

// The Arduino uploads with: PUT /live_data.json
const FIREBASE_PATH = 'live_data';
const HISTORY_PATH = 'sensor_history';
const ACCOUNTS_PATH = 'IsdaApp/accounts';

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
  const [alertDetectedAt, setAlertDetectedAt] = useState<Partial<Record<MetricKey, Date>>>({});
  const [farmId, setFarmId] = useState<string | null>(null);
  const [authScreen, setAuthScreen] = useState<AuthScreen>('login');
  const [currentAccount, setCurrentAccount] = useState<StoredAccount | null>(null);
  const [preferences, setPreferences] = useState<NotificationPreferences>(DEFAULT_PREFERENCES);
  const [clearedAlertsAt, setClearedAlertsAt] = useState<number | null>(null);
  const [historyLogs, setHistoryLogs] = useState<SensorLog[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [pushPermissionGranted, setPushPermissionGranted] = useState(false);

  const isAuthenticated = farmId !== null;

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
      setAuthScreen('login');
      setActiveTab('dashboard');
    } catch {
      Alert.alert('Sign out failed', 'Could not sign out of Google right now. Check your connection and try again.');
    }
  };

  const handleUpdateFarmProfile = async (newName: string, phoneNumber: string): Promise<AuthResult> => {
    if (!farmId) return { success: false, error: 'You are not signed in.' };
    const trimmed = newName.trim();
    if (!trimmed) return { success: false, error: 'Farm name cannot be empty.' };
    const normalizedPhone = phoneNumber.trim();
    try {
      await update(ref(database, `${ACCOUNTS_PATH}/${farmId}`), { farmName: trimmed, phoneNumber: normalizedPhone });
      setCurrentAccount((previous) => previous ? { ...previous, farmName: trimmed, phoneNumber: normalizedPhone } : previous);
      return { success: true };
    } catch {
      return { success: false, error: 'Could not save your farm profile. Check your connection and database rules.' };
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
    try {
      await update(ref(database, `${ACCOUNTS_PATH}/${farmId}/preferences`), next);
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
    const historyQuery = query(ref(database, HISTORY_PATH), orderByChild('recordedAt'), limitToLast(50));
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
      () => setHistoryLoading(false),
    );
    return unsubscribe;
  }, []);

  // Pull live sensor data, unless Auto Refresh is turned off in Settings.
  useEffect(() => {
    const pondRef = ref(database, FIREBASE_PATH);
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
        push(ref(database, HISTORY_PATH), { ...nextReading, recordedAt });
        setReading(nextReading);
        setIsLive(true);
        setLastUpdated(new Date());
      },
      () => setIsLive(false),
    );

    return unsubscribe;
  }, [preferences.autoRefresh]);

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
  }, [reading, alertDetectedAt]);

  const hasAlert = activeAlerts.length > 0;

  // Notify only when a metric enters or changes alert severity, not on every refresh.
  const previousSeverities = useRef<Partial<Record<MetricKey, string>>>({});
  useEffect(() => {
    const currentSeverities: Partial<Record<MetricKey, string>> = {};

    activeAlerts.forEach((alert) => {
      currentSeverities[alert.metric.key] = alert.severity;
      if (
        preferences.pushNotifications &&
        pushPermissionGranted &&
        previousSeverities.current[alert.metric.key] !== alert.severity
      ) {
        Notifications.scheduleNotificationAsync({
          content: {
            title: `${alert.severity === 'critical' ? 'Critical' : 'Warning'}: ${alert.metric.label}`,
            body: `${formatValue(alert.value, alert.metric.key)} ${alert.metric.unit} is outside the safe range.`,
            sound: 'default',
          },
          trigger: null,
        });
      }
    });

    previousSeverities.current = currentSeverities;
  }, [activeAlerts, preferences.pushNotifications, pushPermissionGranted]);

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
            autoRefreshPaused={!preferences.autoRefresh}
          />
        )}
        {activeTab === 'alert' && (
          <AlertScreen
            activeAlerts={activeAlerts}
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
            accountEmail={currentAccount?.email ?? ''}
            phoneNumber={currentAccount?.phoneNumber ?? ''}
            reading={reading}
            lastUpdated={lastUpdated}
            historyLogs={historyLogs}
            preferences={preferences}
            onTogglePreference={togglePreference}
            onUpdateFarmProfile={handleUpdateFarmProfile}
            onLogout={handleLogout}
          />
        )}
      </View>

      <TabBar activeTab={activeTab} onChangeTab={setActiveTab} hasAlert={hasAlert} />
    </SafeAreaView>
  );
}
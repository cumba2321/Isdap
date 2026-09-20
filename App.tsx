import { StatusBar } from 'expo-status-bar';
import { limitToLast, onValue, orderByChild, push, query, ref, set, update } from 'firebase/database';
import { useEffect, useMemo, useRef, useState } from 'react';
import { SafeAreaView, Vibration, View } from 'react-native';

import TabBar from './components/TabBar';
import { db as database } from './firebaseConfig';
import { demoReading, metrics } from './metrics';
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

type AuthScreen = 'login' | 'signup';

type StoredAccount = Account & {
  preferences?: NotificationPreferences;
  clearedAlertsAt?: number;
};

const DEFAULT_PREFERENCES: NotificationPreferences = {
  alertNotifications: true,
  warningNotifications: true,
  smsNotifications: false,
  smsCritical: true,
  smsWarning: false,
  autoRefresh: true,
  soundAlerts: true,
};

// Seeded demo account. Only written to Firebase if the accounts path is
// still empty, so it won't overwrite real data on every app start.
const SEED_ACCOUNTS: Record<string, StoredAccount> = {
  pond_farm_01: {
    email: 'demo@isdaapp.io',
    password: 'password123',
    farmName: 'Pond one',
    preferences: DEFAULT_PREFERENCES,
  },
};

export default function App() {
  const [reading, setReading] = useState<PondReading>(demoReading);
  const [isLive, setIsLive] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(new Date());
  const [activeTab, setActiveTab] = useState<TabKey>('dashboard');
  const [alertDetectedAt, setAlertDetectedAt] = useState<Partial<Record<MetricKey, Date>>>({});
  const [farmId, setFarmId] = useState<string | null>(null);
  const [authScreen, setAuthScreen] = useState<AuthScreen>('login');
  const [accounts, setAccounts] = useState<Record<string, StoredAccount>>(SEED_ACCOUNTS);
  const [preferences, setPreferences] = useState<NotificationPreferences>(DEFAULT_PREFERENCES);
  const [clearedAlertsAt, setClearedAlertsAt] = useState<number | null>(null);
  const [historyLogs, setHistoryLogs] = useState<SensorLog[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);

  const isAuthenticated = farmId !== null;
  const currentAccount = farmId ? accounts[farmId] : null;

  // Load every registered account from Firebase. If the database is empty
  // (first run), seed it with the demo account so sign-in still works.
  useEffect(() => {
    const accountsRef = ref(database, ACCOUNTS_PATH);
    const unsubscribe = onValue(accountsRef, (snapshot) => {
      const data = snapshot.val() as Record<string, StoredAccount> | null;
      if (data) {
        setAccounts(data);
      } else {
        set(accountsRef, SEED_ACCOUNTS);
        setAccounts(SEED_ACCOUNTS);
      }
    });
    return unsubscribe;
  }, []);

  // Whenever the signed-in farm's account record changes (including right
  // after login), sync local preferences state from what's stored.
  useEffect(() => {
    if (!farmId) return;
    setPreferences({ ...DEFAULT_PREFERENCES, ...accounts[farmId]?.preferences });
    setClearedAlertsAt(accounts[farmId]?.clearedAlertsAt ?? null);
  }, [farmId, accounts]);

  const handleSignIn = (id: string, password: string): AuthResult => {
    const account = accounts[id];
    if (!account || account.password !== password) {
      return { success: false, error: 'Incorrect farm ID or password.' };
    }
    setFarmId(id);
    return { success: true };
  };

  const handleSignUp = (id: string, email: string, password: string): AuthResult => {
    if (accounts[id]) {
      return { success: false, error: 'That farm ID is already registered.' };
    }
    const newAccount: StoredAccount = {
      email,
      password,
      farmName: 'Pond one',
      preferences: DEFAULT_PREFERENCES,
    };
    setAccounts((prev) => ({ ...prev, [id]: newAccount }));
    set(ref(database, `${ACCOUNTS_PATH}/${id}`), newAccount);
    setFarmId(id);
    return { success: true };
  };

  const handleLogout = () => {
    setFarmId(null);
    setAuthScreen('login');
    setActiveTab('dashboard');
  };

  const handleChangePassword = (currentPassword: string, newPassword: string): AuthResult => {
    if (!farmId) return { success: false, error: 'You are not signed in.' };
    const account = accounts[farmId];
    if (account.password !== currentPassword) {
      return { success: false, error: 'Current password is incorrect.' };
    }
    setAccounts((prev) => ({ ...prev, [farmId]: { ...prev[farmId], password: newPassword } }));
    update(ref(database, `${ACCOUNTS_PATH}/${farmId}`), { password: newPassword });
    return { success: true };
  };

  const handleUpdateFarmProfile = (newName: string, phoneNumber: string): AuthResult => {
    if (!farmId) return { success: false, error: 'You are not signed in.' };
    const trimmed = newName.trim();
    if (!trimmed) return { success: false, error: 'Farm name cannot be empty.' };
    const normalizedPhone = phoneNumber.trim();
    setAccounts((prev) => ({
      ...prev,
      [farmId]: { ...prev[farmId], farmName: trimmed, phoneNumber: normalizedPhone },
    }));
    update(ref(database, `${ACCOUNTS_PATH}/${farmId}`), { farmName: trimmed, phoneNumber: normalizedPhone });
    return { success: true };
  };

  const handleClearAllAlerts = () => {
    if (!farmId) return;
    const timestamp = Date.now();
    setClearedAlertsAt(timestamp);
    update(ref(database, `${ACCOUNTS_PATH}/${farmId}`), { clearedAlertsAt: timestamp });
  };

  const togglePreference = (key: keyof NotificationPreferences) => {
    setPreferences((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      if (farmId) {
        update(ref(database, `${ACCOUNTS_PATH}/${farmId}/preferences`), next);
      }
      return next;
    });
  };

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
    return authScreen === 'login' ? (
      <LoginScreen onSignIn={handleSignIn} onNavigateSignUp={() => setAuthScreen('signup')} />
    ) : (
      <SignupScreen onSignUp={handleSignUp} onNavigateSignIn={() => setAuthScreen('login')} />
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="light" />

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
            farmId={farmId}
            farmName={currentAccount?.farmName ?? 'Pond one'}
            phoneNumber={currentAccount?.phoneNumber ?? ''}
            reading={reading}
            lastUpdated={lastUpdated}
            historyLogs={historyLogs}
            preferences={preferences}
            onTogglePreference={togglePreference}
            onChangePassword={handleChangePassword}
            onUpdateFarmProfile={handleUpdateFarmProfile}
            onLogout={handleLogout}
          />
        )}
      </View>

      <TabBar activeTab={activeTab} onChangeTab={setActiveTab} hasAlert={hasAlert} />
    </SafeAreaView>
  );
}
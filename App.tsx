import { StatusBar } from 'expo-status-bar';
import { getApps, initializeApp } from 'firebase/app';
import { getDatabase, onValue, ref } from 'firebase/database';
import { useEffect, useMemo, useRef, useState } from 'react';
import { SafeAreaView, Vibration, View } from 'react-native';
 
import TabBar from './components/TabBar';
import { demoReading, metrics } from './metrics';
import AlertScreen from './screens/AlertScreen';
import DashboardScreen from './screens/DashboardScreen';
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
  TabKey,
} from './types';
 
const FIREBASE_DATABASE_URL = 'https://isdapp-251fc-default-rtdb.asia-southeast1.firebasedatabase.app';
const FIREBASE_PATH = 'IsdaApp/Pond_1/live_data';
 
const firebaseApp = getApps().length > 0 ? getApps()[0] : initializeApp({ databaseURL: FIREBASE_DATABASE_URL });
const database = getDatabase(firebaseApp);
 
type AuthScreen = 'login' | 'signup';
 
const DEFAULT_PREFERENCES: NotificationPreferences = {
  alertNotifications: true,
  warningNotifications: true,
  maintenanceAlerts: false,
  updateNotifications: true,
  autoRefresh: true,
  soundAlerts: true,
};
 
// Seeded demo account so the app is usable without signing up first.
const INITIAL_ACCOUNTS: Record<string, Account> = {
  pond_farm_01: { email: 'demo@isdaapp.io', password: 'password123', farmName: 'Pond one' },
};
 
export default function App() {
  const [reading, setReading] = useState<PondReading>(demoReading);
  const [isLive, setIsLive] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(new Date());
  const [activeTab, setActiveTab] = useState<TabKey>('dashboard');
  const [alertDetectedAt, setAlertDetectedAt] = useState<Partial<Record<MetricKey, Date>>>({});
  const [farmId, setFarmId] = useState<string | null>(null);
  const [authScreen, setAuthScreen] = useState<AuthScreen>('login');
  const [accounts, setAccounts] = useState<Record<string, Account>>(INITIAL_ACCOUNTS);
  const [preferences, setPreferences] = useState<NotificationPreferences>(DEFAULT_PREFERENCES);
 
  const isAuthenticated = farmId !== null;
  const currentAccount = farmId ? accounts[farmId] : null;
 
  const handleSignIn = (id: string, password: string): AuthResult => {
    console.log('APP: handleSignIn called with', JSON.stringify(id), JSON.stringify(password));
  const account = accounts[id];
    console.log('APP: found account?', account);
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
    setAccounts((prev) => ({ ...prev, [id]: { email, password, farmName: 'Pond one' } }));
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
    return { success: true };
  };
 
  const handleUpdateFarmName = (newName: string): AuthResult => {
    if (!farmId) return { success: false, error: 'You are not signed in.' };
    const trimmed = newName.trim();
    if (!trimmed) return { success: false, error: 'Farm name cannot be empty.' };
    setAccounts((prev) => ({ ...prev, [farmId]: { ...prev[farmId], farmName: trimmed } }));
    return { success: true };
  };
 
  const togglePreference = (key: keyof NotificationPreferences) =>
    setPreferences((prev) => ({ ...prev, [key]: !prev[key] }));
 
  // Pull live sensor data, unless Auto Refresh is turned off in Settings.
  useEffect(() => {
    const pondRef = ref(database, FIREBASE_PATH);
    const unsubscribe = onValue(
      pondRef,
      (snapshot) => {
        if (!preferences.autoRefresh) return;
 
        const data = snapshot.val() as Partial<Record<keyof PondReading, number | string>> | null;
        if (!data) {
          setIsLive(false);
          return;
        }
 
        const nextReading = Object.fromEntries(
          (Object.keys(demoReading) as Array<keyof PondReading>).map((key) => [
            key,
            Number(data[key] ?? demoReading[key]),
          ]),
        ) as PondReading;
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
          />
        )}
        {activeTab === 'settings' && (
          <SettingsScreen
            isLive={isLive}
            farmId={farmId}
            farmName={currentAccount?.farmName ?? 'Pond one'}
            reading={reading}
            lastUpdated={lastUpdated}
            preferences={preferences}
            onTogglePreference={togglePreference}
            onChangePassword={handleChangePassword}
            onUpdateFarmName={handleUpdateFarmName}
            onLogout={handleLogout}
          />
        )}
      </View>
 
      <TabBar activeTab={activeTab} onChangeTab={setActiveTab} hasAlert={hasAlert} />
    </SafeAreaView>
  );
}
 
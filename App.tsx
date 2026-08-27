import { StatusBar } from 'expo-status-bar';
import { getApps, initializeApp } from 'firebase/app';
import { getDatabase, onValue, ref } from 'firebase/database';
import { useEffect, useState } from 'react';
import {
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

type PondReading = {
  temp: number;
  ec: number;
  do: number;
  ph: number;
  tds: number;
  turbidity: number;
};

const FIREBASE_DATABASE_URL = 'https://isdapp-251fc-default-rtdb.asia-southeast1.firebasedatabase.app';
const FIREBASE_PATH = 'IsdaApp/Pond_1/live_data';

const firebaseApp = getApps().length > 0 ? getApps()[0] : initializeApp({ databaseURL: FIREBASE_DATABASE_URL });
const database = getDatabase(firebaseApp);

const demoReading: PondReading = {
  temp: 28.4,
  ec: 1.18,
  do: 6.42,
  ph: 7.32,
  tds: 584,
  turbidity: 3.8,
};

const metrics = [
  { key: 'temp', label: 'Temperature', unit: 'C', icon: 'TEMP', color: '#f6a85f', healthy: (value: number) => value >= 24 && value <= 32 },
  { key: 'do', label: 'Dissolved oxygen', unit: 'mg/L', icon: 'DO', color: '#59c3c3', healthy: (value: number) => value >= 3 },
  { key: 'ph', label: 'pH level', unit: 'pH', icon: 'pH', color: '#c4a7e7', healthy: (value: number) => value >= 6.5 && value <= 8.5 },
  { key: 'turbidity', label: 'Turbidity', unit: 'NTU', icon: 'TURB', color: '#e8c56a', healthy: (value: number) => value <= 20 },
  { key: 'ec', label: 'Conductivity', unit: 'mS/cm', icon: 'EC', color: '#ef7d88', healthy: () => true },
  { key: 'tds', label: 'Total dissolved solids', unit: 'ppm', icon: 'TDS', color: '#86bdf2', healthy: () => true },
] as const;

function formatValue(value: number, key: string) {
  return key === 'tds' || key === 'turbidity' ? value.toFixed(1) : value.toFixed(2);
}

export default function App() {
  const [reading, setReading] = useState<PondReading>(demoReading);
  const [isLive, setIsLive] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(new Date());

  useEffect(() => {
    const pondRef = ref(database, FIREBASE_PATH);
    const unsubscribe = onValue(
      pondRef,
      (snapshot) => {
        const data = snapshot.val() as Partial<Record<keyof PondReading, number | string>> | null;
        if (!data) {
          setIsLive(false);
          return;
        }

        const nextReading = Object.fromEntries(
          (Object.keys(demoReading) as Array<keyof PondReading>).map((key) => [key, Number(data[key] ?? demoReading[key])]),
        ) as PondReading;
        setReading(nextReading);
        setIsLive(true);
        setLastUpdated(new Date());
      },
      () => setIsLive(false),
    );

    return unsubscribe;
  }, []);

  const hasAlert = reading.do < 3 || reading.ph < 6.5 || reading.ph > 8.5;

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="light" />
      <ScrollView
        contentContainerStyle={styles.content}
      >
        <View style={styles.header}>
          <View>
            <Text style={styles.eyebrow}>ISDAAPP / WATER STATION</Text>
            <Text style={styles.title}>Pond one</Text>
          </View>
          <View style={styles.stationBadge}>
            <View style={[styles.statusDot, isLive ? styles.liveDot : styles.demoDot]} />
            <Text style={styles.stationText}>{isLive ? 'LIVE' : 'DEMO'}</Text>
          </View>
        </View>

        <View style={styles.hero}>
          <View style={styles.heroOrb} />
          <Text style={styles.heroLabel}>WATER QUALITY INDEX</Text>
          <Text style={styles.heroValue}>{hasAlert ? 'ATTENTION' : 'GOOD'}</Text>
          <Text style={styles.heroCopy}>{hasAlert ? 'A reading is outside the safe range.' : 'Your pond is within the safe range.'}</Text>
          <View style={styles.updatedRow}>
            <View style={styles.pulse} />
            <Text style={styles.updatedText}>Updated {lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text>
          </View>
        </View>

        {hasAlert && (
          <View style={styles.alert}>
            <Text style={styles.alertIcon}>!</Text>
            <View style={styles.alertBody}>
              <Text style={styles.alertTitle}>Check pond conditions</Text>
              <Text style={styles.alertCopy}>Dissolved oxygen or pH needs your attention.</Text>
            </View>
          </View>
        )}

        <View style={styles.sectionHeading}>
          <Text style={styles.sectionTitle}>Live readings</Text>
        </View>

        <View style={styles.grid}>
          {metrics.map((metric) => {
            const value = reading[metric.key];
            const isHealthy = metric.healthy(value);
            return (
              <View key={metric.key} style={styles.metricCard}>
                <View style={styles.metricTop}>
                  <View style={[styles.metricIcon, { backgroundColor: `${metric.color}22` }]}>
                    <Text style={[styles.metricIconText, { color: metric.color }]}>{metric.icon}</Text>
                  </View>
                  <View style={[styles.healthDot, { backgroundColor: isHealthy ? '#59c3c3' : '#ef7d88' }]} />
                </View>
                <Text style={styles.metricLabel}>{metric.label}</Text>
                <Text style={styles.metricValue}>{formatValue(value, metric.key)}</Text>
                <Text style={styles.metricUnit}>{metric.unit}</Text>
              </View>
            );
          })}
        </View>

        <View style={styles.connectionRow}>
          <View style={styles.connectionMark}><Text style={styles.connectionMarkText}>SD</Text></View>
          <View style={styles.connectionBody}>
            <Text style={styles.connectionTitle}>Station backup active</Text>
            <Text style={styles.connectionCopy}>Arduino logs are also saved to pond_log.csv</Text>
          </View>
          <Text style={styles.connectionChevron}>›</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#102127',
  },
  content: {
    padding: 22,
    paddingBottom: 40,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 24,
  },
  eyebrow: {
    color: '#7fa7aa',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.5,
  },
  title: {
    color: '#f4f0e7',
    fontSize: 32,
    fontWeight: '800',
    marginTop: 5,
  },
  stationBadge: {
    alignItems: 'center',
    backgroundColor: '#1d343a',
    borderRadius: 20,
    flexDirection: 'row',
    gap: 7,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  statusDot: { borderRadius: 5, height: 9, width: 9 },
  liveDot: { backgroundColor: '#59c3c3' },
  demoDot: { backgroundColor: '#e8c56a' },
  stationText: { color: '#d7e5df', fontSize: 11, fontWeight: '800', letterSpacing: 1 },
  hero: {
    backgroundColor: '#21434a',
    borderRadius: 24,
    overflow: 'hidden',
    padding: 24,
  },
  heroOrb: {
    backgroundColor: '#28545a',
    borderRadius: 100,
    height: 160,
    position: 'absolute',
    right: -50,
    top: -55,
    width: 160,
  },
  heroLabel: { color: '#91c8c3', fontSize: 11, fontWeight: '800', letterSpacing: 1.4 },
  heroValue: { color: '#f4f0e7', fontSize: 42, fontWeight: '800', marginTop: 8 },
  heroCopy: { color: '#c1d8d2', fontSize: 14, marginTop: 4 },
  updatedRow: { alignItems: 'center', flexDirection: 'row', marginTop: 25 },
  pulse: { backgroundColor: '#59c3c3', borderRadius: 4, height: 8, marginRight: 8, width: 8 },
  updatedText: { color: '#a9c8c2', fontSize: 12 },
  alert: { alignItems: 'center', backgroundColor: '#492f35', borderRadius: 16, flexDirection: 'row', marginTop: 14, padding: 15 },
  alertIcon: { alignItems: 'center', backgroundColor: '#ef7d88', borderRadius: 14, color: '#492f35', fontSize: 18, fontWeight: '900', height: 28, lineHeight: 28, textAlign: 'center', width: 28 },
  alertBody: { marginLeft: 12 },
  alertTitle: { color: '#ffe6e4', fontSize: 14, fontWeight: '800' },
  alertCopy: { color: '#d7acae', fontSize: 12, marginTop: 3 },
  sectionHeading: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12, marginTop: 27 },
  sectionTitle: { color: '#f4f0e7', fontSize: 19, fontWeight: '800' },
  refreshButton: { backgroundColor: '#d5e9dc', borderRadius: 18, minWidth: 74, paddingHorizontal: 14, paddingVertical: 8 },
  pressed: { opacity: 0.7 },
  refreshText: { color: '#15252b', fontSize: 12, fontWeight: '800', textAlign: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  metricCard: { backgroundColor: '#183139', borderRadius: 18, minHeight: 147, padding: 16, width: '48%' },
  metricTop: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  metricIcon: { alignItems: 'center', borderRadius: 10, height: 32, justifyContent: 'center', width: 43 },
  metricIconText: { fontSize: 10, fontWeight: '900' },
  healthDot: { borderRadius: 4, height: 8, width: 8 },
  metricLabel: { color: '#91afb0', fontSize: 12, marginTop: 16 },
  metricValue: { color: '#f4f0e7', fontSize: 25, fontWeight: '800', marginTop: 3 },
  metricUnit: { color: '#719092', fontSize: 11, marginTop: 1 },
  connectionRow: { alignItems: 'center', backgroundColor: '#d5e9dc', borderRadius: 18, flexDirection: 'row', marginTop: 24, padding: 15 },
  connectionMark: { alignItems: 'center', backgroundColor: '#a9d2c3', borderRadius: 12, height: 42, justifyContent: 'center', width: 42 },
  connectionMarkText: { color: '#21434a', fontSize: 12, fontWeight: '900' },
  connectionBody: { flex: 1, marginLeft: 12 },
  connectionTitle: { color: '#21434a', fontSize: 14, fontWeight: '800' },
  connectionCopy: { color: '#527572', fontSize: 11, marginTop: 3 },
  connectionChevron: { color: '#527572', fontSize: 27, fontWeight: '300', marginLeft: 8 },
});

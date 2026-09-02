import { ScrollView, Text, View } from 'react-native';
import { formatValue, metrics } from '../metrics';
import { styles } from '../styles';
import { PondReading } from '../types';
 
type DashboardScreenProps = {
  reading: PondReading;
  isLive: boolean;
  lastUpdated: Date;
  hasAlert: boolean;
  farmName: string;
  autoRefreshPaused: boolean;
};
 
export default function DashboardScreen({
  reading,
  isLive,
  lastUpdated,
  hasAlert,
  farmName,
  autoRefreshPaused,
}: DashboardScreenProps) {
  return (
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <View>
          <Text style={styles.eyebrow}>ISDAAPP / WATER STATION</Text>
          <Text style={styles.title}>{farmName}</Text>
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
        <Text style={styles.heroCopy}>
          {hasAlert ? 'A reading is outside the safe range.' : 'Your pond is within the safe range.'}
        </Text>
        <View style={styles.updatedRow}>
          <View style={styles.pulse} />
          <Text style={styles.updatedText}>
            {autoRefreshPaused
              ? 'Auto-refresh paused · last updated ' +
                lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
              : 'Updated ' + lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </Text>
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
          const isHealthy = metric.getSeverity(value) === null;
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
        <View style={styles.connectionMark}>
          <Text style={styles.connectionMarkText}>SD</Text>
        </View>
        <View style={styles.connectionBody}>
          <Text style={styles.connectionTitle}>Station backup active</Text>
          <Text style={styles.connectionCopy}>Arduino logs are also saved to pond_log.csv</Text>
        </View>
        <Text style={styles.connectionChevron}>›</Text>
      </View>
    </ScrollView>
  );
}
 
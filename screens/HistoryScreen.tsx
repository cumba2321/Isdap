import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { formatValue, metrics } from '../metrics';
import { styles } from '../styles';
import { SensorLog } from '../types';

type HistoryScreenProps = {
  logs: SensorLog[];
  isLoading: boolean;
};

function formatRecordedAt(timestamp: number) {
  return new Date(timestamp).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function HistoryScreen({ logs, isLoading }: HistoryScreenProps) {
  return (
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>History</Text>
          <Text style={styles.screenSubtitle}>Recent sensor readings</Text>
        </View>
        <View style={styles.historyCount}>
          <Text style={styles.historyCountText}>{logs.length}</Text>
          <Text style={styles.historyCountLabel}>LOGS</Text>
        </View>
      </View>

      {isLoading && <Text style={styles.historyStatus}>Loading history…</Text>}

      {!isLoading && logs.length === 0 && (
        <View style={screenStyles.emptyCard}>
          <View style={screenStyles.emptyIcon}>
            <Text style={screenStyles.emptyIconText}>↻</Text>
          </View>
          <Text style={screenStyles.emptyEyebrow}>READING ARCHIVE</Text>
          <Text style={screenStyles.emptyTitle}>Your history starts here</Text>
          <Text style={screenStyles.emptyCopy}>
            Sensor readings will be saved here as they come in.
          </Text>
        </View>
      )}

      {logs.map((log) => (
        <View key={log.id} style={styles.historyCard}>
          <View style={styles.historyCardHeader}>
            <Text style={styles.historyCardTitle}>Sensor reading</Text>
            <Text style={styles.historyCardTime}>{formatRecordedAt(log.recordedAt)}</Text>
          </View>
          <View style={styles.historyMetricGrid}>
            {metrics.map((metric) => (
              <View key={metric.key} style={styles.historyMetric}>
                <Text style={styles.historyMetricLabel}>{metric.label}</Text>
                <Text style={styles.historyMetricValue}>
                  {formatValue(log[metric.key], metric.key)} <Text style={styles.historyMetricUnit}>{metric.unit}</Text>
                </Text>
              </View>
            ))}
          </View>
        </View>
      ))}
    </ScrollView>
  );
}

const screenStyles = StyleSheet.create({
  emptyCard: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: '#E3ECEE',
    borderRadius: 22,
    borderWidth: 1,
    marginTop: 8,
    paddingHorizontal: 28,
    paddingVertical: 30,
  },
  emptyIcon: {
    alignItems: 'center',
    backgroundColor: '#E8F5F2',
    borderColor: '#D8EBE7',
    borderRadius: 30,
    borderWidth: 1,
    height: 58,
    justifyContent: 'center',
    width: 58,
  },
  emptyIconText: { color: '#087C73', fontSize: 29, fontWeight: '500', lineHeight: 34 },
  emptyEyebrow: { color: '#71868C', fontSize: 9, fontWeight: '800', letterSpacing: 1.4, marginTop: 18 },
  emptyTitle: { color: '#1D343B', fontSize: 17, fontWeight: '800', marginTop: 7, textAlign: 'center' },
  emptyCopy: { color: '#71868C', fontSize: 12, lineHeight: 18, marginTop: 6, maxWidth: 250, textAlign: 'center' },
});
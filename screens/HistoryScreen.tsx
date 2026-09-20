import { ScrollView, Text, View } from 'react-native';
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

      {isLoading && <Text style={styles.historyStatus}>Loading sensor history...</Text>}

      {!isLoading && logs.length === 0 && (
        <View style={styles.emptyState}>
          <View style={styles.emptyBadge}>
            <Text style={styles.emptyBadgeText}>HIST</Text>
          </View>
          <Text style={styles.emptyTitle}>No readings recorded yet</Text>
          <Text style={styles.emptyCopy}>New sensor readings will appear here automatically.</Text>
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
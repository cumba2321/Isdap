import { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import Swipeable from 'react-native-gesture-handler/Swipeable';
import Svg, { Circle, Line, Polyline, Text as SvgText } from 'react-native-svg';
import * as XLSX from 'xlsx-js-style';
import FishMascot from '../components/FishMascot';
import { formatValue, metrics } from '../metrics';
import { styles } from '../styles';
import { AuthResult, MetricKey, SensorLog } from '../types';

type HistoryChartRange = '24h' | '7d' | '30d';

const historyChartRanges: { key: HistoryChartRange; label: string; durationMs: number }[] = [
  { key: '24h', label: '24 hours', durationMs: 24 * 60 * 60 * 1000 },
  { key: '7d', label: '7 days', durationMs: 7 * 24 * 60 * 60 * 1000 },
  { key: '30d', label: '30 days', durationMs: 30 * 24 * 60 * 60 * 1000 },
];

type HistoryScreenProps = {
  logs: SensorLog[];
  hasDevice: boolean;
  isLoading: boolean;
  isClearing: boolean;
  hasMore: boolean;
  isLoadingMore: boolean;
  onClearHistory: () => Promise<AuthResult>;
  onLoadMore: () => Promise<AuthResult>;
  onDeleteDate: (dateKey: string) => Promise<AuthResult>;
  onDownloadDate: (
    dateKey: string,
  ) => Promise<{ success: true; logs: SensorLog[] } | { success: false; error: string }>;
  onLoadChart: (
    startAt: number,
    endAt: number,
  ) => Promise<{ success: true; logs: SensorLog[] } | { success: false; error: string }>;
};

function formatRecordedAt(timestamp: number) {
  return new Date(timestamp).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getDateKey(timestamp: number) {
  const date = new Date(timestamp);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function formatDateHeading(timestamp: number) {
  return new Date(timestamp).toLocaleDateString([], {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

function formatChartTime(timestamp: number, range: HistoryChartRange) {
  const date = new Date(timestamp);
  return range === '24h'
    ? date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

export default function HistoryScreen({
  logs,
  hasDevice,
  isLoading,
  isClearing,
  hasMore,
  isLoadingMore,
  onClearHistory,
  onLoadMore,
  onDeleteDate,
  onDownloadDate,
  onLoadChart,
}: HistoryScreenProps) {
  const { width: screenWidth } = useWindowDimensions();
  const [expandedDate, setExpandedDate] = useState<string | null>(null);
  const [busyDateAction, setBusyDateAction] = useState<string | null>(null);
  const [chartRange, setChartRange] = useState<HistoryChartRange>('24h');
  const [chartMetricKey, setChartMetricKey] = useState<MetricKey>('ph');
  const [chartLogs, setChartLogs] = useState<SensorLog[]>([]);
  const [chartLoading, setChartLoading] = useState(true);
  const selectedChartMetric = metrics.find((metric) => metric.key === chartMetricKey) ?? metrics[0];
  const chartWidth = Math.max(240, screenWidth - 78);
  const chartPoints = useMemo(() => {
    const values = chartLogs
      .filter((log) => Number.isFinite(log[chartMetricKey]))
      .map((log) => ({ timestamp: log.recordedAt, value: log[chartMetricKey] }));
    if (values.length === 0) return [];
    const rawMin = Math.min(...values.map((point) => point.value));
    const rawMax = Math.max(...values.map((point) => point.value));
    const padding = rawMin === rawMax ? Math.max(Math.abs(rawMin) * 0.05, 1) : (rawMax - rawMin) * 0.12;
    const minValue = rawMin - padding;
    const maxValue = rawMax + padding;
    const plotLeft = 46;
    const plotRight = chartWidth - 10;
    const plotTop = 14;
    const plotBottom = 146;
    const startTimestamp = values[0].timestamp;
    const timestampSpan = Math.max(values[values.length - 1].timestamp - startTimestamp, 1);
    return values.map((point) => ({
      x: plotLeft + ((point.timestamp - startTimestamp) / timestampSpan) * (plotRight - plotLeft),
      y: plotBottom - ((point.value - minValue) / (maxValue - minValue)) * (plotBottom - plotTop),
    }));
  }, [chartLogs, chartMetricKey, chartWidth]);

  useEffect(() => {
    let cancelled = false;
    if (!hasDevice) {
      setChartLogs([]);
      setChartLoading(false);
      return () => {
        cancelled = true;
      };
    }
    const range = historyChartRanges.find((item) => item.key === chartRange) ?? historyChartRanges[0];
    const endAt = Date.now();
    setChartLoading(true);
    void onLoadChart(endAt - range.durationMs, endAt).then((result) => {
      if (cancelled) return;
      if (result.success) {
        setChartLogs(result.logs);
      } else {
        setChartLogs([]);
        Alert.alert('Chart unavailable', result.error);
      }
      setChartLoading(false);
    }).catch(() => {
      if (cancelled) return;
      setChartLogs([]);
      setChartLoading(false);
      Alert.alert('Chart unavailable', 'Could not load chart readings. Please try again.');
    });
    return () => {
      cancelled = true;
    };
  }, [chartRange, hasDevice, onLoadChart]);

  const groupedLogs = new Map<string, SensorLog[]>();
  logs.forEach((log) => {
    const dateKey = getDateKey(log.recordedAt);
    groupedLogs.set(dateKey, [...(groupedLogs.get(dateKey) ?? []), log]);
  });
  const groups = [...groupedLogs.entries()];

  const loadMoreHistory = async () => {
    const result = await onLoadMore();
    if (!result.success) Alert.alert('Could not load history', result.error);
  };

  const downloadDate = async (dateKey: string) => {
    setBusyDateAction(dateKey);
    try {
      const result = await onDownloadDate(dateKey);
      if (!result.success) {
        Alert.alert('Could not load daily data', result.error);
        return;
      }
      if (result.logs.length === 0) {
        Alert.alert('No readings found', 'There are no saved readings for this date.');
        return;
      }

      const rows = result.logs.flatMap((log) => metrics.map((metric) => ({
        Timestamp: new Date(log.recordedAt).toLocaleString(),
        Sensor: metric.label,
        Value: formatValue(log[metric.key], metric.key),
        Unit: metric.unit,
        'Alert Status': metric.getSeverity(log[metric.key]) === 'critical'
          ? 'Critical'
          : metric.getSeverity(log[metric.key]) === 'warning'
            ? 'Warning'
            : 'Optimal',
      })));
      const worksheet = XLSX.utils.json_to_sheet(rows);
      rows.forEach((row, index) => {
        const cell = worksheet[`E${index + 2}`];
        const style = row['Alert Status'] === 'Optimal'
          ? { fill: { patternType: 'solid', fgColor: { rgb: 'E2F3E8' } }, font: { bold: true, color: { rgb: '237A48' } } }
          : row['Alert Status'] === 'Warning'
            ? { fill: { patternType: 'solid', fgColor: { rgb: 'FFF4CC' } }, font: { bold: true, color: { rgb: '926500' } } }
            : { fill: { patternType: 'solid', fgColor: { rgb: 'FCE6E6' } }, font: { bold: true, color: { rgb: 'B42332' } } };
        if (cell) cell.s = style;
      });
      worksheet['!cols'] = [{ wch: 24 }, { wch: 28 }, { wch: 14 }, { wch: 12 }, { wch: 16 }];
      worksheet['!autofilter'] = { ref: `A1:E${rows.length + 1}` };
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Sensor Readings');
      const base64 = XLSX.write(workbook, { bookType: 'xlsx', type: 'base64' });
      const fileUri = `${FileSystem.documentDirectory}pond-readings-${dateKey}.xlsx`;
      await FileSystem.writeAsStringAsync(fileUri, base64, { encoding: FileSystem.EncodingType.Base64 });

      if (!(await Sharing.isAvailableAsync())) {
        Alert.alert('Sharing unavailable', 'This device cannot share the Excel file.');
        return;
      }
      await Sharing.shareAsync(fileUri, {
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        dialogTitle: `Pond readings ${dateKey}`,
        UTI: 'com.microsoft.excel.xlsx',
      });
    } catch {
      Alert.alert('Could not download daily data', 'Something went wrong while preparing or sharing the Excel file.');
    } finally {
      setBusyDateAction(null);
    }
  };

  const confirmDeleteDate = (dateKey: string) => {
    Alert.alert(
      'Delete this day’s history?',
      `This permanently deletes all saved sensor readings for ${dateKey} from Firebase. This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete day',
          style: 'destructive',
          onPress: async () => {
            setBusyDateAction(dateKey);
            const result = await onDeleteDate(dateKey);
            setBusyDateAction(null);
            if (!result.success) {
              Alert.alert('Could not delete daily history', result.error);
            }
          },
        },
      ],
    );
  };

  const confirmClearHistory = () => {
    Alert.alert(
      'Clear history?',
      'This permanently deletes the saved sensor readings for the selected device. New readings will be saved again as they arrive.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear history',
          style: 'destructive',
          onPress: async () => {
            const result = await onClearHistory();
            if (result.success) {
              Alert.alert('History cleared', 'Saved readings for this device have been deleted.');
            } else {
              Alert.alert('Could not clear history', result.error);
            }
          },
        },
      ],
    );
  };

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>History</Text>
          <Text style={styles.screenSubtitle}>Recent sensor readings</Text>
        </View>
        <View style={screenStyles.headerActions}>
          {logs.length > 0 ? (
            <Pressable
              onPress={confirmClearHistory}
              disabled={isClearing || isLoading}
              style={({ pressed }) => [
                screenStyles.clearButton,
                (isClearing || isLoading) && screenStyles.clearButtonDisabled,
                pressed && screenStyles.clearButtonPressed,
              ]}
              accessibilityRole="button"
              accessibilityLabel="Clear saved sensor history"
            >
              <Text style={screenStyles.clearButtonText}>{isClearing ? 'Clearing…' : 'Clear'}</Text>
            </Pressable>
          ) : null}
          <View style={styles.historyCount}>
            <Text style={styles.historyCountText}>{logs.length}</Text>
            <Text style={styles.historyCountLabel}>LOGS</Text>
          </View>
        </View>
      </View>

      <View style={screenStyles.chartCard}>
        <View style={screenStyles.chartHeading}>
          <View>
            <Text style={screenStyles.chartEyebrow}>READING TRENDS</Text>
            <Text style={screenStyles.chartTitle}>{selectedChartMetric.label}</Text>
          </View>
          <Text style={screenStyles.chartUnit}>{selectedChartMetric.unit}</Text>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={screenStyles.rangeSelector}>
          {historyChartRanges.map((range) => (
            <Pressable
              key={range.key}
              onPress={() => setChartRange(range.key)}
              accessibilityRole="button"
              accessibilityState={{ selected: chartRange === range.key }}
              style={[screenStyles.rangeButton, chartRange === range.key && screenStyles.rangeButtonSelected]}
            >
              <Text style={[screenStyles.rangeButtonText, chartRange === range.key && screenStyles.rangeButtonTextSelected]}>
                {range.label}
              </Text>
            </Pressable>
          ))}
        </ScrollView>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={screenStyles.metricSelector}>
          {metrics.map((metric) => (
            <Pressable
              key={metric.key}
              onPress={() => setChartMetricKey(metric.key)}
              accessibilityRole="button"
              accessibilityState={{ selected: chartMetricKey === metric.key }}
              style={[screenStyles.metricButton, chartMetricKey === metric.key && screenStyles.metricButtonSelected]}
            >
              <Text style={[screenStyles.metricButtonText, chartMetricKey === metric.key && screenStyles.metricButtonTextSelected]}>
                {metric.label}
              </Text>
            </Pressable>
          ))}
        </ScrollView>

        {chartLoading ? (
          <Text style={screenStyles.chartStatus}>Loading chart readings…</Text>
        ) : chartLogs.length === 0 ? (
          <Text style={screenStyles.chartStatus}>
            {hasDevice ? 'No readings found in this time range.' : 'Link a device to view reading trends.'}
          </Text>
        ) : (
          <>
            <Svg width="100%" height={172} viewBox={`0 0 ${chartWidth} 172`}>
              {[0, 1, 2, 3].map((index) => {
                const y = 14 + index * 44;
                return (
                  <Line
                    key={`grid-${index}`}
                    x1={46}
                    y1={y}
                    x2={chartWidth - 10}
                    y2={y}
                    stroke="#E7ECEE"
                    strokeWidth={1}
                  />
                );
              })}
              {chartPoints.length > 1 ? (
                <Polyline
                  points={chartPoints.map((point) => `${point.x},${point.y}`).join(' ')}
                  fill="none"
                  stroke={selectedChartMetric.color}
                  strokeWidth={3}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
              ) : null}
              {chartPoints.map((point, index) => (
                <Circle
                  key={`chart-point-${index}`}
                  cx={point.x}
                  cy={point.y}
                  r={chartPoints.length === 1 ? 4 : 2}
                  fill={selectedChartMetric.color}
                />
              ))}
              {[0, 1, 2, 3].map((index) => {
                const values = chartLogs.map((log) => log[chartMetricKey]);
                const rawMin = Math.min(...values);
                const rawMax = Math.max(...values);
                const padding = rawMin === rawMax ? Math.max(Math.abs(rawMin) * 0.05, 1) : (rawMax - rawMin) * 0.12;
                const value = rawMax + padding - (index / 3) * (rawMax - rawMin + padding * 2);
                return (
                  <SvgText
                    key={`y-label-${index}`}
                    x={40}
                    y={18 + index * 44}
                    fill="#71868C"
                    fontSize={9}
                    textAnchor="end"
                  >
                    {formatValue(value, chartMetricKey)}
                  </SvgText>
                );
              })}
            </Svg>
            <View style={screenStyles.chartTimeLabels}>
              <Text style={screenStyles.chartTimeText}>{formatChartTime(chartLogs[0].recordedAt, chartRange)}</Text>
              <Text style={screenStyles.chartTimeText}>{formatChartTime(chartLogs[chartLogs.length - 1].recordedAt, chartRange)}</Text>
            </View>
            {chartLogs.length >= 500 ? (
              <Text style={screenStyles.chartFootnote}>Showing up to 500 readings in this range.</Text>
            ) : null}
          </>
        )}
      </View>

      {isLoading && <Text style={styles.historyStatus}>Loading history…</Text>}

      {!isLoading && logs.length === 0 && (
        <View style={screenStyles.emptyCard}>
          <FishMascot
            style={screenStyles.emptyMascot}
            accessibilityLabel="Fish mascot welcoming you to your reading history"
          />
          <Text style={screenStyles.emptyEyebrow}>READING ARCHIVE</Text>
          <Text style={screenStyles.emptyTitle}>Your history starts here</Text>
          <Text style={screenStyles.emptyCopy}>
            Sensor readings will be saved here as they come in.
          </Text>
        </View>
      )}

      {groups.map(([dateKey, dateLogs]) => {
        const isExpanded = expandedDate === dateKey;
        return (
          <View key={dateKey} style={screenStyles.dayGroup}>
            <Swipeable
              enabled={!isClearing && busyDateAction === null}
              overshootRight={false}
              renderRightActions={() => (
                <View style={screenStyles.swipeActions}>
                  <Pressable
                    onPress={() => { void downloadDate(dateKey); }}
                    disabled={busyDateAction !== null}
                    style={({ pressed }) => [screenStyles.downloadDayButton, pressed && screenStyles.swipeActionPressed]}
                    accessibilityRole="button"
                    accessibilityLabel={`Download readings for ${formatDateHeading(dateLogs[0].recordedAt)}`}
                  >
                    <Text style={screenStyles.swipeActionText}>
                      {busyDateAction === dateKey ? '…' : 'Download'}
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => confirmDeleteDate(dateKey)}
                    disabled={busyDateAction !== null}
                    style={({ pressed }) => [screenStyles.deleteDayButton, pressed && screenStyles.swipeActionPressed]}
                    accessibilityRole="button"
                    accessibilityLabel={`Delete readings for ${formatDateHeading(dateLogs[0].recordedAt)}`}
                  >
                    <Text style={screenStyles.swipeActionText}>Delete</Text>
                  </Pressable>
                </View>
              )}
            >
              <Pressable
                onPress={() => setExpandedDate(isExpanded ? null : dateKey)}
                style={({ pressed }) => [screenStyles.dayHeader, pressed && screenStyles.dayHeaderPressed]}
                accessibilityRole="button"
                accessibilityState={{ expanded: isExpanded }}
                accessibilityLabel={`${formatDateHeading(dateLogs[0].recordedAt)}, ${dateLogs.length} readings`}
              >
                <View style={screenStyles.dayHeaderText}>
                  <Text style={screenStyles.dayTitle}>{formatDateHeading(dateLogs[0].recordedAt)}</Text>
                  <Text style={screenStyles.dayCount}>
                    {dateLogs.length} {dateLogs.length === 1 ? 'reading' : 'readings'} loaded
                  </Text>
                </View>
                <Text style={screenStyles.dayChevron}>{isExpanded ? '−' : '+'}</Text>
              </Pressable>
            </Swipeable>
            {isExpanded ? dateLogs.map((log) => (
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
            )) : null}
          </View>
        );
      })}

      {!isLoading && hasMore ? (
        <Pressable
          onPress={() => { void loadMoreHistory(); }}
          disabled={isLoadingMore || isClearing}
          style={({ pressed }) => [
            screenStyles.loadMoreButton,
            (isLoadingMore || isClearing) && screenStyles.loadMoreButtonDisabled,
            pressed && screenStyles.loadMoreButtonPressed,
          ]}
          accessibilityRole="button"
        >
          <Text style={screenStyles.loadMoreText}>
            {isLoadingMore ? 'Loading…' : 'Load older readings'}
          </Text>
        </Pressable>
      ) : null}
    </ScrollView>
  );
}

const screenStyles = StyleSheet.create({
  chartCard: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E3ECEE',
    borderRadius: 20,
    borderWidth: 1,
    marginBottom: 18,
    padding: 16,
  },
  chartHeading: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  chartEyebrow: { color: '#71868C', fontSize: 9, fontWeight: '800', letterSpacing: 1.2 },
  chartTitle: { color: '#172B33', fontSize: 17, fontWeight: '800', marginTop: 3 },
  chartUnit: { color: '#60777E', fontSize: 11, fontWeight: '700' },
  rangeSelector: { gap: 7, paddingVertical: 14 },
  rangeButton: { backgroundColor: '#F3F7F8', borderRadius: 10, paddingHorizontal: 11, paddingVertical: 8 },
  rangeButtonSelected: { backgroundColor: '#E3F3F1' },
  rangeButtonText: { color: '#60777E', fontSize: 10, fontWeight: '700' },
  rangeButtonTextSelected: { color: '#087C73' },
  metricSelector: { gap: 7, paddingBottom: 12 },
  metricButton: { borderColor: '#E3ECEE', borderRadius: 10, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 7 },
  metricButtonSelected: { backgroundColor: '#F0F8F6', borderColor: '#AED8CE' },
  metricButtonText: { color: '#60777E', fontSize: 10, fontWeight: '600' },
  metricButtonTextSelected: { color: '#176A58', fontWeight: '800' },
  chartStatus: { color: '#71868C', fontSize: 12, paddingVertical: 34, textAlign: 'center' },
  chartTimeLabels: { flexDirection: 'row', justifyContent: 'space-between', marginLeft: 46, marginRight: 10, marginTop: -4 },
  chartTimeText: { color: '#71868C', fontSize: 9 },
  chartFootnote: { color: '#71868C', fontSize: 9, marginTop: 9, textAlign: 'center' },
  dayGroup: { marginBottom: 10 },
  swipeActions: { flexDirection: 'row', marginBottom: 8, overflow: 'hidden' },
  downloadDayButton: { alignItems: 'center', backgroundColor: '#087C73', justifyContent: 'center', paddingHorizontal: 15 },
  deleteDayButton: { alignItems: 'center', backgroundColor: '#B74450', borderTopRightRadius: 15, borderBottomRightRadius: 15, justifyContent: 'center', paddingHorizontal: 15 },
  swipeActionPressed: { opacity: 0.75 },
  swipeActionText: { color: '#FFFFFF', fontSize: 11, fontWeight: '800' },
  dayHeader: { alignItems: 'center', backgroundColor: '#FFFFFF', borderColor: '#DDE7EB', borderRadius: 15, borderWidth: 1, flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8, paddingHorizontal: 15, paddingVertical: 13 },
  dayHeaderPressed: { opacity: 0.75 },
  dayHeaderText: { flex: 1 },
  dayTitle: { color: '#172B33', fontSize: 14, fontWeight: '800' },
  dayCount: { color: '#71868C', fontSize: 11, marginTop: 3 },
  dayChevron: { color: '#087C73', fontSize: 22, fontWeight: '600', paddingHorizontal: 5 },
  loadMoreButton: { alignItems: 'center', backgroundColor: '#E6F5F5', borderRadius: 13, marginTop: 2, paddingHorizontal: 16, paddingVertical: 13 },
  loadMoreButtonDisabled: { opacity: 0.55 },
  loadMoreButtonPressed: { opacity: 0.75 },
  loadMoreText: { color: '#087F8C', fontSize: 12, fontWeight: '800' },
  headerActions: { alignItems: 'center', flexDirection: 'row', gap: 8 },
  clearButton: { backgroundColor: '#FFF0F0', borderColor: '#F2D5D7', borderRadius: 12, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 10 },
  clearButtonDisabled: { opacity: 0.5 },
  clearButtonPressed: { opacity: 0.75 },
  clearButtonText: { color: '#A83E49', fontSize: 11, fontWeight: '800' },
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
  emptyMascot: { height: 112, width: 136 },
  emptyEyebrow: { color: '#71868C', fontSize: 9, fontWeight: '800', letterSpacing: 1.4, marginTop: 18 },
  emptyTitle: { color: '#1D343B', fontSize: 17, fontWeight: '800', marginTop: 7, textAlign: 'center' },
  emptyCopy: { color: '#71868C', fontSize: 12, lineHeight: 18, marginTop: 6, maxWidth: 250, textAlign: 'center' },
});
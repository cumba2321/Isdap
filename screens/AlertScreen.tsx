import { useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { formatValue } from '../metrics';
import { styles } from '../styles';
import { ActiveAlert } from '../types';
import { formatRelativeTime } from '../utils';

type AlertScreenProps = {
  activeAlerts: ActiveAlert[];
  showCritical: boolean;
  showWarning: boolean;
  clearedAlertsAt: number | null;
  onClearAll: () => void;
};

function getAlertTitle(alert: ActiveAlert) {
  return alert.severity === 'critical'
    ? `Critical ${alert.metric.label}`
    : `${alert.metric.label} Warning`;
}

function getAlertMessage(alert: ActiveAlert) {
  const formatted = `${formatValue(alert.value, alert.metric.key)} ${alert.metric.unit}`;
  return alert.severity === 'critical'
    ? `${alert.metric.label} has reached a critical level at ${formatted}.`
    : `${alert.metric.label} is trending outside the safe range at ${formatted}.`;
}

export default function AlertScreen({
  activeAlerts,
  showCritical,
  showWarning,
  clearedAlertsAt,
  onClearAll,
}: AlertScreenProps) {
  const [now, setNow] = useState(new Date());

  // Keep "x minutes ago" labels fresh without needing new sensor data.
  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(interval);
  }, []);

  const notMuted = activeAlerts.filter(
    (alert) => (alert.severity === 'critical' && showCritical) || (alert.severity === 'warning' && showWarning),
  );

  const visibleAlerts = notMuted
    .filter((alert) => !clearedAlertsAt || alert.detectedAt.getTime() > clearedAlertsAt)
    .sort((a, b) => b.detectedAt.getTime() - a.detectedAt.getTime());

  const criticalCount = visibleAlerts.filter((alert) => alert.severity === 'critical').length;
  const warningCount = visibleAlerts.length - criticalCount;
  const hasAlerts = visibleAlerts.length > 0;
  const isMuted = activeAlerts.length > 0 && notMuted.length === 0;

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Alerts</Text>
          <Text style={styles.screenSubtitle}>System Notifications</Text>
        </View>
      </View>

      <View style={[styles.alertsSummaryCard, hasAlerts ? styles.alertsSummaryCardActive : styles.alertsSummaryCardClear]}>
        <Text style={styles.alertsSummaryTitle}>{hasAlerts ? 'Active Alerts' : 'All Clear'}</Text>
        <Text style={styles.alertsSummaryCopy}>
          {hasAlerts
            ? `${visibleAlerts.length} active alert${visibleAlerts.length === 1 ? '' : 's'} requiring attention (${criticalCount} critical, ${warningCount} warning)`
            : 'All readings are currently within their safe ranges.'}
        </Text>
      </View>

      {hasAlerts &&
        visibleAlerts.map((alert) => {
          const isCritical = alert.severity === 'critical';
          return (
            <View
              key={alert.metric.key}
              style={[
                styles.alertItemCard,
                isCritical ? styles.alertItemCardCritical : styles.alertItemCardWarning,
              ]}
            >
              <View style={styles.alertItemHeader}>
                <View
                  style={[
                    styles.alertIconCircle,
                    isCritical ? styles.alertIconCircleCritical : styles.alertIconCircleWarning,
                  ]}
                >
                  <Text style={styles.alertIconCircleText}>{isCritical ? '🚨' : '⚠️'}</Text>
                </View>
                <View style={styles.alertItemTitleWrap}>
                  <Text style={styles.alertItemTitle}>{getAlertTitle(alert)}</Text>
                  <Text style={isCritical ? styles.alertItemBadgeCritical : styles.alertItemBadgeWarning}>
                    {isCritical ? 'CRITICAL ALERT' : 'WARNING'}
                  </Text>
                </View>
                <Text style={styles.alertItemTime}>{formatRelativeTime(alert.detectedAt, now)}</Text>
              </View>

              <Text style={styles.alertItemMessage}>{getAlertMessage(alert)}</Text>

              <View style={styles.thresholdRow}>
                <View style={styles.thresholdCol}>
                  <Text style={styles.thresholdLabel}>PARAMETER</Text>
                  <Text style={styles.thresholdValue}>{alert.metric.label}</Text>
                </View>
                <View style={styles.thresholdCol}>
                  <Text style={styles.thresholdLabel}>CURRENT</Text>
                  <Text style={styles.thresholdValue}>
                    {formatValue(alert.value, alert.metric.key)} {alert.metric.unit}
                  </Text>
                </View>
                <View style={styles.thresholdCol}>
                  <Text style={styles.thresholdLabel}>THRESHOLD</Text>
                  <Text style={styles.thresholdValue}>
                    {alert.metric.range} ({isCritical ? 'Critical' : 'Warning'})
                  </Text>
                </View>
              </View>
            </View>
          );
        })}

      {!hasAlerts && (
        <View style={styles.emptyState}>
          <View style={styles.emptyBadge}>
            <Text style={styles.emptyBadgeText}>{isMuted ? 'MUTE' : 'OK'}</Text>
          </View>
          <Text style={styles.emptyTitle}>{isMuted ? 'Alerts are muted' : 'No active alerts'}</Text>
          <Text style={styles.emptyCopy}>
            {isMuted
              ? 'Readings are out of range, but Alert or Warning Notifications are turned off in Settings.'
              : 'All readings are within their safe ranges.'}
          </Text>
        </View>
      )}

      <Pressable
        onPress={onClearAll}
        disabled={!hasAlerts}
        style={({ pressed }) => [
          styles.clearAllButton,
          !hasAlerts && styles.clearAllButtonDisabled,
          pressed && hasAlerts && styles.tabButtonPressed,
        ]}
      >
        <Text style={styles.clearAllButtonText}>Clear All Alerts</Text>
      </Pressable>
    </ScrollView>
  );
}
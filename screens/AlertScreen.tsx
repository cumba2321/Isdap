import { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { formatValue } from '../metrics';
import { styles } from '../styles';
import { ActiveAlert, AuthResult } from '../types';
import { formatRelativeTime } from '../utils';

type AlertScreenProps = {
  activeAlerts: ActiveAlert[];
  hasDevice: boolean;
  showCritical: boolean;
  showWarning: boolean;
  clearedAlertsAt: number | null;
  isClearing: boolean;
  onClearAll: () => Promise<AuthResult>;
};

function getAlertTitle(alert: ActiveAlert) {
  return alert.severity === 'critical'
    ? `${alert.metric.label} needs attention`
    : `${alert.metric.label} is outside range`;
}

function getAlertMessage(alert: ActiveAlert) {
  const formatted = `${formatValue(alert.value, alert.metric.key)} ${alert.metric.unit}`;
  return alert.severity === 'critical'
    ? `Current reading is ${formatted}. Review the pond conditions as soon as possible.`
    : `Current reading is ${formatted}. Keep an eye on this parameter.`;
}

export default function AlertScreen({
  activeAlerts,
  hasDevice,
  showCritical,
  showWarning,
  clearedAlertsAt,
  isClearing,
  onClearAll,
}: AlertScreenProps) {
  const [now, setNow] = useState(new Date());

  const confirmClearAll = () => {
    Alert.alert(
      'Clear visible alerts?',
      'This dismisses the current alerts and saves the dismissal to your account. Alerts can appear again if a reading returns to range and later becomes unsafe.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear alerts',
          style: 'destructive',
          onPress: async () => {
            const result = await onClearAll();
            if (result.success) {
              Alert.alert('Alerts cleared', 'The current alert dismissal was saved to your account.');
            } else {
              Alert.alert('Could not clear alerts', result.error);
            }
          },
        },
      ],
    );
  };

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
          <Text style={styles.screenSubtitle}>Pond health, at a glance</Text>
        </View>
      </View>

      <View style={[styles.alertsSummaryCard, hasAlerts || isMuted ? styles.alertsSummaryCardActive : styles.alertsSummaryCardClear]}>
        <View style={styles.alertsSummaryTop}>
          <View style={[
            styles.alertsSummaryMark,
            hasAlerts ? styles.alertsSummaryMarkActive : styles.alertsSummaryMarkClear,
          ]}>
            <Text style={[
              styles.alertsSummaryMarkText,
              hasAlerts ? styles.alertsSummaryMarkTextActive : styles.alertsSummaryMarkTextClear,
            ]}>
              {!hasDevice ? '—' : hasAlerts ? '!' : '✓'}
            </Text>
          </View>
          <View style={styles.alertsSummaryBody}>
            <Text style={styles.alertsSummaryEyebrow}>
              {!hasDevice ? 'SENSOR STATUS' : isMuted ? 'NOTIFICATION STATUS' : hasAlerts ? 'MONITORING STATUS' : 'POND STATUS'}
            </Text>
            <Text style={styles.alertsSummaryTitle}>
              {!hasDevice ? 'Connect a sensor' : isMuted ? 'Alerts are paused' : hasAlerts ? 'Attention required' : 'Looking good'}
            </Text>
            <Text style={styles.alertsSummaryCopy}>
              {!hasDevice
                ? 'Link a sensor to see live water-quality alerts here.'
                : isMuted
                ? 'Some readings are outside range, but alert notifications are turned off.'
                : hasAlerts
                ? 'One or more readings are outside their target range.'
                : 'Your latest readings are within their target ranges.'}
            </Text>
          </View>
        </View>
        {hasAlerts ? (
          <View style={styles.alertsCountRow}>
            <View style={styles.alertsCountPill}>
              <View style={[styles.alertsCountDot, styles.alertsCountDotCritical]} />
              <Text style={styles.alertsCountText}>{criticalCount} critical</Text>
            </View>
            <View style={styles.alertsCountPill}>
              <View style={[styles.alertsCountDot, styles.alertsCountDotWarning]} />
              <Text style={styles.alertsCountText}>{warningCount} to review</Text>
            </View>
          </View>
        ) : null}
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
                  <Text style={[
                    styles.alertMetricIcon,
                    { color: alert.metric.color },
                  ]}>{alert.metric.icon}</Text>
                </View>
                <View style={styles.alertItemTitleWrap}>
                  <Text style={styles.alertItemTitle}>{getAlertTitle(alert)}</Text>
                  <View style={[
                    styles.alertSeverityPill,
                    isCritical ? styles.alertSeverityPillCritical : styles.alertSeverityPillWarning,
                  ]}>
                    <View style={[
                      styles.alertSeverityDot,
                      isCritical ? styles.alertSeverityDotCritical : styles.alertSeverityDotWarning,
                    ]} />
                    <Text style={isCritical ? styles.alertItemBadgeCritical : styles.alertItemBadgeWarning}>
                      {isCritical ? 'CRITICAL' : 'REVIEW'}
                    </Text>
                  </View>
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
                  <Text style={styles.thresholdLabel}>CURRENT READING</Text>
                  <Text style={styles.thresholdValue}>
                    {formatValue(alert.value, alert.metric.key)} {alert.metric.unit}
                  </Text>
                </View>
                <View style={styles.thresholdCol}>
                  <Text style={styles.thresholdLabel}>TARGET RANGE</Text>
                  <Text style={styles.thresholdValue}>
                    {alert.metric.range}
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
          <Text style={styles.emptyTitle}>
            {!hasDevice ? 'Your pond is not connected' : isMuted ? 'Notifications are paused' : 'No active alerts'}
          </Text>
          <Text style={styles.emptyCopy}>
            {!hasDevice
              ? 'Link a sensor in Settings to start monitoring water quality.'
              : isMuted
              ? 'Some readings are outside their target ranges. Turn alerts back on in Settings to see them here.'
              : 'Everything is within range. We’ll show an alert here if a reading needs your attention.'}
          </Text>
        </View>
      )}

      <Pressable
        onPress={confirmClearAll}
        disabled={!hasDevice || !hasAlerts || isClearing}
        accessibilityRole="button"
        accessibilityState={{ disabled: !hasDevice || !hasAlerts || isClearing }}
        style={({ pressed }) => [
          styles.clearAllButton,
          (!hasDevice || !hasAlerts || isClearing) && styles.clearAllButtonDisabled,
          pressed && hasDevice && hasAlerts && styles.tabButtonPressed,
        ]}
      >
        <Text style={styles.clearAllButtonText}>{isClearing ? 'Saving…' : 'Clear visible alerts'}</Text>
      </Pressable>
    </ScrollView>
  );
}
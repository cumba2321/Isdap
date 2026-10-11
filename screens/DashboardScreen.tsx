import { useState } from 'react';
import { Image, Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { formatValue, metrics } from '../metrics';
import { styles } from '../styles';
import { AuthResult, ManagedDevice, PondReading } from '../types';

type DashboardScreenProps = {
  reading: PondReading;
  isLive: boolean;
  lastUpdated: Date;
  hasAlert: boolean;
  farmName: string;
  deviceName: string | null;
  devices: ManagedDevice[];
  selectedDeviceId: string | null;
  autoRefreshPaused: boolean;
  onManageDevices: () => void;
  onOpenSmsSettings: () => void;
  onSelectDevice: (deviceId: string) => Promise<AuthResult>;
};

export default function DashboardScreen({
  reading,
  isLive,
  lastUpdated,
  hasAlert,
  farmName,
  deviceName,
  devices,
  selectedDeviceId,
  autoRefreshPaused,
  onManageDevices,
  onOpenSmsSettings,
  onSelectDevice,
}: DashboardScreenProps) {
  const [devicePickerVisible, setDevicePickerVisible] = useState(false);
  const [devicePickerError, setDevicePickerError] = useState('');
  const [selectingDeviceId, setSelectingDeviceId] = useState<string | null>(null);
  const displayedReading = isLive
    ? reading
    : { temp: 0, ec: 0, do: 0, ph: 0, tds: 0, turbidity: 0 };
  const statusLabel = hasAlert ? 'NEEDS REVIEW' : isLive ? 'STABLE' : 'PREVIEW';
  const statusMessage = hasAlert
    ? 'One or more readings are outside the target range. Review the highlighted parameters below.'
    : isLive
      ? 'Your latest readings are within their target ranges.'
      : 'Sample readings are shown until your sensor connects.';

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <View style={styles.dashboardIdentity}>
          <Image
            source={require('../assets/isdapp-logo.png')}
            style={{ height: 42, marginRight: 10, width: 42 }}
            resizeMode="contain"
            accessibilityLabel="IsdaApp water-quality logo"
          />
          {devices.length > 1 ? (
            <Pressable
              onPress={() => {
                setDevicePickerError('');
                setDevicePickerVisible(true);
              }}
              accessibilityRole="button"
              accessibilityLabel={`Selected pond ${deviceName}. Tap to switch pond.`}
              style={({ pressed }) => [styles.dashboardDeviceSelector, pressed && styles.pressed]}
            >
              <Text numberOfLines={1} style={styles.dashboardDeviceName}>{deviceName ?? farmName}</Text>
              <Text style={styles.dashboardDeviceChevron}>⌄</Text>
            </Pressable>
          ) : (
            <Text numberOfLines={1} style={styles.title}>{deviceName ?? farmName}</Text>
          )}
        </View>
        <View style={styles.stationBadge}>
          <View style={[styles.statusDot, isLive ? styles.liveDot : styles.demoDot]} />
          <Text style={styles.stationText}>{isLive ? 'LIVE' : 'PREVIEW'}</Text>
        </View>
      </View>

      <Modal
        animationType="fade"
        transparent
        visible={devicePickerVisible}
        onRequestClose={() => setDevicePickerVisible(false)}
      >
        <View style={styles.devicePickerOverlay}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close pond selector"
            style={styles.devicePickerBackdrop}
            onPress={() => setDevicePickerVisible(false)}
          />
          <View style={styles.devicePickerSheet}>
            <View style={styles.devicePickerHeading}>
              <View>
                <Text style={styles.devicePickerEyebrow}>YOUR SENSORS</Text>
                <Text style={styles.devicePickerTitle}>Switch pond</Text>
              </View>
              <Pressable
                onPress={() => setDevicePickerVisible(false)}
                accessibilityRole="button"
                accessibilityLabel="Close"
                style={styles.devicePickerClose}
              >
                <Text style={styles.devicePickerCloseText}>×</Text>
              </Pressable>
            </View>
            <Text style={styles.devicePickerCopy}>Choose a pond to view its latest readings.</Text>
            {devices.map((device) => {
              const isSelected = device.deviceId === selectedDeviceId;
              const isSelecting = selectingDeviceId === device.deviceId;
              return (
                <Pressable
                  key={device.deviceId}
                  disabled={selectingDeviceId !== null}
                  onPress={async () => {
                    setSelectingDeviceId(device.deviceId);
                    setDevicePickerError('');
                    const result = await onSelectDevice(device.deviceId);
                    setSelectingDeviceId(null);
                    if (result.success) {
                      setDevicePickerVisible(false);
                    } else {
                      setDevicePickerError(result.error);
                    }
                  }}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isSelected, disabled: selectingDeviceId !== null }}
                  style={({ pressed }) => [
                    styles.devicePickerOption,
                    isSelected && styles.devicePickerOptionSelected,
                    pressed && styles.pressed,
                  ]}
                >
                  <View style={[styles.devicePickerIcon, isSelected && styles.devicePickerIconSelected]}>
                    <Text style={[styles.devicePickerIconText, isSelected && styles.devicePickerIconTextSelected]}>P</Text>
                  </View>
                  <View style={styles.devicePickerOptionBody}>
                    <Text numberOfLines={1} style={styles.devicePickerOptionName}>{device.name}</Text>
                    <Text numberOfLines={1} style={styles.devicePickerOptionId}>{device.deviceId}</Text>
                  </View>
                  <Text style={isSelected ? styles.devicePickerSelectedMark : styles.devicePickerChevron}>
                    {isSelecting ? '…' : isSelected ? '✓' : '›'}
                  </Text>
                </Pressable>
              );
            })}
            {devicePickerError ? (
              <Text style={styles.devicePickerError} accessibilityRole="alert">{devicePickerError}</Text>
            ) : null}
            <Pressable
              onPress={() => {
                setDevicePickerVisible(false);
                onManageDevices();
              }}
              accessibilityRole="button"
              style={({ pressed }) => [styles.devicePickerManageButton, pressed && styles.pressed]}
            >
              <Text style={styles.devicePickerManageText}>Manage linked devices</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <View style={styles.hero}>
        <View style={styles.heroOrb} />
        <View style={styles.heroTopRow}>
          <Text style={styles.heroLabel}>POND HEALTH</Text>
          <View style={[styles.heroStatusPill, hasAlert ? styles.heroStatusPillAlert : styles.heroStatusPillGood]}>
            <View style={[styles.heroStatusDot, hasAlert ? styles.heroStatusDotAlert : styles.heroStatusDotGood]} />
            <Text style={[styles.heroStatusText, hasAlert ? styles.heroStatusTextAlert : styles.heroStatusTextGood]}>
              {statusLabel}
            </Text>
          </View>
        </View>
        <Text style={styles.heroValue}>{hasAlert ? 'Review needed' : isLive ? 'Looking good' : 'Ready to monitor'}</Text>
        <Text style={styles.heroCopy}>{statusMessage}</Text>
        <View style={styles.updatedRow}>
          <View style={[styles.pulse, !isLive && styles.previewPulse]} />
          <Text style={styles.updatedText}>
            {!isLive
              ? 'Waiting for sensor data'
              : autoRefreshPaused
                ? 'Refresh paused · last updated ' +
                  lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                : 'Last updated ' + lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </Text>
        </View>
      </View>

      {!deviceName ? (
        <>
          <View style={styles.dashboardConnectCard}>
            <Pressable
              onPress={onManageDevices}
              accessibilityRole="button"
              accessibilityLabel="Link a sensor"
              style={({ pressed }) => [styles.dashboardConnectMark, pressed && styles.pressed]}
            >
              <Text style={styles.dashboardConnectMarkText}>+</Text>
            </Pressable>
            <View style={styles.dashboardConnectBody}>
              <Text style={styles.dashboardConnectTitle}>Connect your pond</Text>
              <Text style={styles.dashboardConnectCopy}>
                Link a sensor to monitor live water quality. Current values are sample readings.
              </Text>
            </View>
          </View>

          <View style={styles.dashboardConnectCard}>
            <Pressable
              onPress={onOpenSmsSettings}
              accessibilityRole="button"
              accessibilityLabel="Set up SMS alerts"
              style={({ pressed }) => [styles.dashboardConnectMark, pressed && styles.pressed]}
            >
              <Text style={styles.dashboardConnectMarkText}>+</Text>
            </Pressable>
            <View style={styles.dashboardConnectBody}>
              <Text style={styles.dashboardConnectTitle}>Set up SMS alerts</Text>
              <Text style={styles.dashboardConnectCopy}>
                Activate SMS in Settings to receive alerts.
              </Text>
            </View>
          </View>
        </>
      ) : null}

      {hasAlert ? (
        <View style={styles.dashboardAlertBanner}>
          <View style={styles.dashboardAlertMark}>
            <Text style={styles.dashboardAlertMarkText}>!</Text>
          </View>
          <View style={styles.alertBody}>
            <Text style={styles.alertTitle}>A reading needs attention</Text>
            <Text style={styles.alertCopy}>See the highlighted parameters below for details.</Text>
          </View>
        </View>
      ) : null}

      <View style={styles.sectionHeading}>
        <View>
          <Text style={styles.sectionTitle}>Water quality</Text>
          <Text style={styles.dashboardSectionCopy}>
            {isLive ? 'Current sensor readings' : 'Preview · sensor readings are zero'}
          </Text>
        </View>
      </View>

      <View style={styles.grid}>
        {metrics.map((metric) => {
          const value = displayedReading[metric.key];
          const isHealthy = !isLive || metric.getSeverity(value) === null;
          return (
            <View key={metric.key} style={styles.metricCard}>
              <View style={styles.metricTop}>
                <View style={[styles.metricIcon, { backgroundColor: `${metric.color}22` }]}>
                  <Text style={[styles.metricIconText, { color: metric.color }]}>{metric.icon}</Text>
                </View>
                <View style={[styles.metricStatusPill, isHealthy ? styles.metricStatusPillGood : styles.metricStatusPillAlert]}>
                  <View style={[styles.healthDot, { backgroundColor: isHealthy ? '#078A95' : '#C84F5B' }]} />
                  <Text style={[styles.metricStatusText, isHealthy ? styles.metricStatusTextGood : styles.metricStatusTextAlert]}>
                    {!isLive ? 'PREVIEW' : isHealthy ? 'IN RANGE' : 'REVIEW'}
                  </Text>
                </View>
              </View>
              <Text style={styles.metricLabel}>{metric.label}</Text>
              <Text style={styles.metricValue}>{formatValue(value, metric.key)}</Text>
              <Text style={styles.metricUnit}>{metric.unit}</Text>
            </View>
          );
        })}
      </View>
    </ScrollView>
  );
}
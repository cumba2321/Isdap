import { useEffect, useRef, useState } from 'react';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { formatValue, metrics } from '../metrics';
import { styles } from '../styles';
import { AuthResult, ManagedDevice, NotificationPreferences, PondReading, SensorLog } from '../types';
import * as XLSX from 'xlsx';
 
type SettingsScreenProps = {
  farmName: string;
  devices: ManagedDevice[];
  selectedDeviceId: string | null;
  accountEmail: string;
  phoneNumber: string;
  reading: PondReading;
  lastUpdated: Date;
  historyLogs: SensorLog[];
  preferences: NotificationPreferences;
  focusSmsSettings: boolean;
  onTogglePreference: (key: keyof NotificationPreferences) => void;
  onSmsSettingsFocused: () => void;
  onUpdateFarmProfile: (newName: string, phoneNumber: string) => Promise<AuthResult>;
  onClaimDevice: (deviceId: string, claimCode: string, name: string) => Promise<AuthResult>;
  onSelectDevice: (deviceId: string) => Promise<AuthResult>;
  onUnlinkDevice: (deviceId: string) => Promise<AuthResult>;
  onLogout: () => void;
  onDeleteAccount: () => Promise<AuthResult>;
};
 
type RowBase = {
  key: string;
  icon: string;
  iconBg: string;
  title: string;
  subtitle: string;
};
 
type LinkRow = RowBase & { type: 'link'; onPress: () => void };
type ToggleRow = RowBase & { type: 'toggle'; toggleKey: keyof NotificationPreferences; disabled?: boolean };
type ActionRow = RowBase & { type: 'action'; onPress: () => void; badge: string };
type DestructiveRow = RowBase & { type: 'destructive'; onPress: () => void };

type Row = LinkRow | ToggleRow | ActionRow | DestructiveRow;
 
const SWITCH_TRACK_COLOR = { false: '#CAD9DE', true: '#84C8CC' };
const SWITCH_THUMB_COLOR = { off: '#60777E', on: '#078A95' };

const thresholdReference = [
  {
    Parameter: 'Temperature',
    'Optimum Level': '25-32 C',
    'Warning Threshold': 'Below 25 C OR above 32 C',
    Comment: 'Optimum for metabolism, reproduction, and growth',
    'Critical Threshold': 'Below 10 C or above 35 C',
    'Effects Beyond Threshold': 'Reduced feeding activity, slow growth, physiological stress, and mortality',
    References: 'Bautista et al. (2022); BFAR (2022); HORIBA (2025); Romana-Eguia et al. (2020)',
  },
  {
    Parameter: 'pH',
    'Optimum Level': '6.5-9.0',
    'Warning Threshold': 'Below 6.5 OR above 9.0',
    Comment: 'Suitable for metabolism and fish health',
    'Critical Threshold': 'Below 4 or above 9',
    'Effects Beyond Threshold': 'Increased ammonia toxicity, stress, reduced swimming activity, and mortality',
    References: 'Bautista et al. (2022); BFAR (2022); HORIBA (2025); Stone & Thomford (2004)',
  },
  {
    Parameter: 'Dissolved Oxygen (DO)',
    'Optimum Level': 'Above 5 mg/L',
    'Warning Threshold': 'Below 3 mg/L OR 3-5 mg/L',
    Comment: 'Necessary for respiration and growth',
    'Critical Threshold': 'Below 3 mg/L',
    'Effects Beyond Threshold': 'Poor growth, stress, reduced activity, and fish mortality',
    References: 'Bautista et al. (2022); BFAR (2022); HORIBA (2025)',
  },
  {
    Parameter: 'Total Dissolved Solids (TDS)',
    'Optimum Level': '150-350 ppm',
    'Warning Threshold': 'Below 150 ppm OR above 350 ppm',
    Comment: 'Indicates dissolved salts and mineral concentration',
    'Critical Threshold': 'Above 350 ppm',
    'Effects Beyond Threshold': 'Osmotic stress, reduced growth, and water-quality deterioration',
    References: 'Bautista et al. (2022)',
  },
  {
    Parameter: 'Electrical Conductivity (EC)',
    'Optimum Level': '100-2,000 uS/cm',
    'Warning Threshold': 'Below 100 uS/cm OR above 2,000 uS/cm',
    Comment: 'Reflects ionic concentration and dissolved substances',
    'Critical Threshold': 'Above 5,000 uS/cm',
    'Effects Beyond Threshold': 'Excess dissolved salts, pollutants, and unstable pond conditions',
    References: 'Stone & Thomford (2004)',
  },
  {
    Parameter: 'Turbidity',
    'Optimum Level': '30-80 NTU',
    'Warning Threshold': 'Below 30 NTU OR above 80 NTU',
    Comment: 'Moderate turbidity supports pond productivity',
    'Critical Threshold': 'Below 10 NTU or above 150 NTU',
    'Effects Beyond Threshold': 'Increased predation stress, clogged gills, and reduced growth',
    References: 'HORIBA (2025)',
  },
];
 
export default function SettingsScreen({
  farmName,
  devices,
  selectedDeviceId,
  accountEmail,
  phoneNumber,
  reading,
  lastUpdated,
  historyLogs,
  preferences,
  focusSmsSettings,
  onTogglePreference,
  onSmsSettingsFocused,
  onUpdateFarmProfile,
  onClaimDevice,
  onSelectDevice,
  onUnlinkDevice,
  onLogout,
  onDeleteAccount,
}: SettingsScreenProps) {
  const scrollViewRef = useRef<ScrollView>(null);
  const [activeModal, setActiveModal] = useState<'farmProfile' | 'downloadData' | null>(null);
  const [qrScannerVisible, setQrScannerVisible] = useState(false);
  const [QrCameraView, setQrCameraView] = useState<typeof import('expo-camera').CameraView | null>(null);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [deviceIdDraft, setDeviceIdDraft] = useState('');
  const [deviceClaimCodeDraft, setDeviceClaimCodeDraft] = useState('');
  const [deviceNameDraft, setDeviceNameDraft] = useState('');
  const [deviceError, setDeviceError] = useState<string | null>(null);
  const [deviceBusy, setDeviceBusy] = useState<string | null>(null);
 
  const [farmNameDraft, setFarmNameDraft] = useState(farmName);
  const [phoneNumberDraft, setPhoneNumberDraft] = useState(phoneNumber);
  const [farmProfileError, setFarmProfileError] = useState<string | null>(null);
  const [smsNumberError, setSmsNumberError] = useState<string | null>(null);
  const [smsNumberSaving, setSmsNumberSaving] = useState(false);
  const [smsNumberSaved, setSmsNumberSaved] = useState(false);

  useEffect(() => {
    setPhoneNumberDraft(phoneNumber);
  }, [phoneNumber]);
 
  const [exportDate, setExportDate] = useState(() => {
    const now = new Date();
    return [now.getFullYear(), String(now.getMonth() + 1).padStart(2, '0'), String(now.getDate()).padStart(2, '0')].join('-');
  });
 
  const closeModal = () => {
    setActiveModal(null);
    setFarmProfileError(null);
  };
 
  const openFarmProfile = () => {
    setFarmNameDraft(farmName);
    setPhoneNumberDraft(phoneNumber);
    setFarmProfileError(null);
    setActiveModal('farmProfile');
  };
 
  const handleSaveFarmName = async () => {
    const result = await onUpdateFarmProfile(farmNameDraft, phoneNumberDraft);
    if (!result.success) {
      setFarmProfileError(result.error);
      return;
    }
    closeModal();
  };

  const handleSaveSmsNumber = async () => {
    setSmsNumberSaving(true);
    setSmsNumberError(null);
    setSmsNumberSaved(false);
    try {
      const result = await onUpdateFarmProfile(farmName, phoneNumberDraft);
      if (!result.success) setSmsNumberError(result.error);
      else setSmsNumberSaved(true);
    } finally {
      setSmsNumberSaving(false);
    }
  };

  const handleClaimDevice = async () => {
    setDeviceBusy('claim');
    setDeviceError(null);
    try {
      let deviceId = deviceIdDraft.trim();
      let claimCode = deviceClaimCodeDraft;
      const qrPrefix = /^ISDAAPP:/i;
      if (qrPrefix.test(deviceId)) {
        const payload = deviceId.replace(qrPrefix, '');
        const separator = payload.indexOf(':');
        if (separator >= 0) {
          deviceId = payload.slice(0, separator);
          claimCode = payload.slice(separator + 1);
        }
      }
      const result = await onClaimDevice(deviceId, claimCode, deviceNameDraft);
      if (!result.success) {
        setDeviceError(result.error);
        return;
      }
      setDeviceIdDraft('');
      setDeviceClaimCodeDraft('');
      setDeviceNameDraft('');
    } catch {
      setDeviceError('Could not link this device. Check your connection and try again.');
    } finally {
      setDeviceBusy(null);
    }
  };

  const openQrScanner = async () => {
    try {
      const camera = await import('expo-camera');
      let permission = await camera.Camera.getCameraPermissionsAsync();
      if (!permission.granted) {
        permission = await camera.Camera.requestCameraPermissionsAsync();
      }
      if (!permission.granted) {
        setDeviceError('Camera access is needed to scan a device QR code.');
        return;
      }
      setQrCameraView(() => camera.CameraView);
      setDeviceError(null);
      setQrScannerVisible(true);
    } catch {
      Alert.alert(
        'Update required',
        'QR scanning needs the latest IsdaApp version. Rebuild and reinstall the app, then try again.',
      );
    }
  };

  const handleQrScanned = ({ data }: { data: string }) => {
    if (!qrScannerVisible) return;
    const match = /^ISDAAPP:([^:]+):([\s\S]+)$/i.exec(data.trim());
    if (!match) {
      setQrScannerVisible(false);
      setDeviceError('This QR code is not a valid IsdaApp device code.');
      return;
    }

    setDeviceIdDraft(match[1]);
    setDeviceClaimCodeDraft(match[2]);
    setDeviceError(null);
    setQrScannerVisible(false);
  };

  const confirmUnlinkDevice = (device: ManagedDevice) => {
    Alert.alert(
      'Unlink device?',
      `${device.name} will stop appearing in your account and become available for another user to claim. The sensor itself will keep uploading.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Unlink',
          style: 'destructive',
          onPress: async () => {
            setDeviceBusy(device.deviceId);
            setDeviceError(null);
            const result = await onUnlinkDevice(device.deviceId);
            if (!result.success) setDeviceError(result.error);
            setDeviceBusy(null);
          },
        },
      ],
    );
  };

  const confirmDeleteAccount = () => {
    Alert.alert(
      'Delete account permanently?',
      'This removes your IsdaApp account, unlinks all ponds, and clears their SMS alert settings. Sensor readings remain in the database, and the sensors will keep uploading.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete account',
          style: 'destructive',
          onPress: async () => {
            setDeletingAccount(true);
            const result = await onDeleteAccount();
            setDeletingAccount(false);
            if (!result.success) Alert.alert('Account not deleted', result.error);
          },
        },
      ],
    );
  };
 
  const handleDownloadData = async () => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(exportDate)) {
      Alert.alert('Invalid date', 'Enter a date using YYYY-MM-DD.');
      return;
    }

    const [year, month, day] = exportDate.split('-').map(Number);
    const start = new Date(year, month - 1, day).getTime();
    const end = new Date(year, month - 1, day + 1).getTime();
    const selectedLogs = historyLogs.filter((log) => log.recordedAt >= start && log.recordedAt < end);

    const rows = selectedLogs.flatMap((log, logIndex) => {
      const sensorRows = metrics.map((metric) => {
        const severity = metric.getSeverity(log[metric.key]);
        return {
          Timestamp: new Date(log.recordedAt).toLocaleString(),
          Sensor: metric.label,
          Value: formatValue(log[metric.key], metric.key),
          Unit: metric.unit,
          'Alert Status': severity === 'critical' ? 'Critical' : severity === 'warning' ? 'Warning' : 'Optimal',
        };
      });

      if (logIndex === selectedLogs.length - 1) {
        return sensorRows;
      }

      return [
        ...sensorRows,
        {
          Timestamp: '------------------------------------',
          Sensor: '------------------------------------',
          Value: '------------------------------------',
          Unit: '------------------------------------',
          'Alert Status': '------------------------------------',
        },
      ];
    });
 
    try {
      const workbook = XLSX.utils.book_new();
      const worksheet = XLSX.utils.json_to_sheet(rows);
      worksheet['!cols'] = [
        { wch: 24 },
        { wch: 28 },
        { wch: 14 },
        { wch: 12 },
        { wch: 16 },
      ];
      worksheet['!autofilter'] = { ref: `A1:E${rows.length + 1}` };
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Sensor Readings');

      const referenceWorksheet = XLSX.utils.json_to_sheet(thresholdReference);
      referenceWorksheet['!cols'] = [
        { wch: 28 },
        { wch: 18 },
        { wch: 34 },
        { wch: 48 },
        { wch: 28 },
        { wch: 58 },
        { wch: 58 },
      ];
      referenceWorksheet['!autofilter'] = { ref: `A1:F${thresholdReference.length + 1}` };
      XLSX.utils.book_append_sheet(workbook, referenceWorksheet, 'Threshold Reference');

      const workbookBase64 = XLSX.write(workbook, { bookType: 'xlsx', type: 'base64' });
      const fileUri = `${FileSystem.documentDirectory}pond-readings-${exportDate}.xlsx`;
      await FileSystem.writeAsStringAsync(fileUri, workbookBase64, {
        encoding: FileSystem.EncodingType.Base64,
      });

      if (!(await Sharing.isAvailableAsync())) {
        Alert.alert('Sharing unavailable', 'This device cannot share the Excel file.');
        return;
      }

      await Sharing.shareAsync(fileUri, {
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        dialogTitle: `Pond readings ${exportDate}`,
        UTI: 'com.microsoft.excel.xlsx',
      });
      setActiveModal(null);
    } catch {
      Alert.alert('Could not export', 'Something went wrong while preparing the Excel file.');
    }
  };
 
  const sections: { title: string; icon: string; rows: Row[] }[] = [
    {
      title: 'ACCOUNT',
      icon: '👤',
      rows: [
        {
          key: 'farmProfile',
          type: 'link',
          icon: '🌾',
          iconBg: '#FFF3D5',
          title: 'Farm Profile',
          subtitle: accountEmail ? `${farmName} · ${accountEmail}` : farmName,
          onPress: openFarmProfile,
        },
      ],
    },
    {
      title: 'NOTIFICATIONS',
      icon: '🔔',
      rows: [
        {
          key: 'pushNotifications',
          type: 'toggle',
          toggleKey: 'pushNotifications',
          icon: '📲',
          iconBg: '#E6F5F5',
          title: 'Push Notifications',
          subtitle: 'Notify me for every warning or critical reading',
        },
        {
          key: 'alertNotifications',
          type: 'toggle',
          toggleKey: 'alertNotifications',
          icon: '🚨',
          iconBg: '#FCE8EA',
          title: 'Critical Alerts',
          subtitle: 'Show and notify for critical readings',
        },
        {
          key: 'warningNotifications',
          type: 'toggle',
          toggleKey: 'warningNotifications',
          icon: '⚠️',
          iconBg: '#FFF3D5',
          title: 'Warning Alerts',
          subtitle: 'Show and notify for warning readings',
        },
        {
          key: 'smsNotifications',
          type: 'toggle',
          toggleKey: 'smsNotifications',
          icon: 'SMS',
          iconBg: '#E6F5F5',
          title: 'SMS Notifications',
          subtitle: preferences.smsNotifications ? 'SMS alerts are enabled' : 'SMS alerts are disabled',
        },
        {
          key: 'smsCritical',
          type: 'toggle',
          toggleKey: 'smsCritical',
          disabled: !preferences.smsNotifications,
          icon: '🚨',
          iconBg: '#FCE8EA',
          title: 'SMS Critical Alerts',
          subtitle: 'Send an SMS for critical sensor readings',
        },
        {
          key: 'smsWarning',
          type: 'toggle',
          toggleKey: 'smsWarning',
          disabled: !preferences.smsNotifications,
          icon: '⚠️',
          iconBg: '#FFF3D5',
          title: 'SMS Warning Alerts',
          subtitle: 'Send an SMS for warning sensor readings',
        },
      ],
    },
    {
      title: 'SYSTEM',
      icon: '⚙️',
      rows: [
        {
          key: 'autoRefresh',
          type: 'toggle',
          toggleKey: 'autoRefresh',
          icon: '🔄',
          iconBg: '#E6F5F5',
          title: 'Auto Refresh',
          subtitle: preferences.autoRefresh ? 'Live sensor updates are on' : 'Paused — showing last known reading',
        },
        {
          key: 'soundAlerts',
          type: 'toggle',
          toggleKey: 'soundAlerts',
          icon: '🔊',
          iconBg: '#E6F5F5',
          title: 'Sound Alerts',
          subtitle: 'Vibrate when a new critical alert appears',
        },
        {
          key: 'downloadData',
          type: 'action',
          icon: '⬇️',
          iconBg: '#EEF3F5',
          title: 'Download Data',
          subtitle: 'Share the latest reading as a CSV',
          badge: '📤',
          onPress: () => setActiveModal('downloadData'),
        },
      ],
    },
    {
      title: 'ADVANCED SETTINGS',
      icon: '⚠️',
      rows: [
        {
          key: 'deleteAccount',
          type: 'destructive',
          icon: '❌',
          iconBg: '#FCE8EA',
          title: deletingAccount ? 'Deleting account…' : 'Delete account',
          subtitle: 'Permanently remove your account and unlink all ponds',
          onPress: confirmDeleteAccount,
        },
      ],
    },
  ];
 
  return (
    <ScrollView ref={scrollViewRef} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Settings</Text>
          <Text style={styles.screenSubtitle}>Manage your preferences</Text>
        </View>
      </View>

      <View style={screenStyles.deviceSection}>
        <Text style={styles.sectionTitle}>My devices</Text>
        <Text style={screenStyles.deviceIntro}>
          Sensors connected to your ponds.
        </Text>

        {devices.length === 0 ? (
          <View style={screenStyles.deviceEmpty}>
            <Text style={screenStyles.deviceEmptyTitle}>No devices linked</Text>
            <Text style={screenStyles.deviceEmptyCopy}>
              Live pond readings will appear here after setup.
            </Text>
          </View>
        ) : devices.map((device) => {
          const isSelected = device.deviceId === selectedDeviceId;
          return (
            <View key={device.deviceId} style={screenStyles.deviceCard}>
              <View style={screenStyles.deviceInfo}>
                <Text style={screenStyles.deviceName}>{device.name}</Text>
                <Text style={screenStyles.deviceId}>{device.deviceId}</Text>
                {isSelected ? <Text style={screenStyles.deviceSelected}>CURRENT SENSOR</Text> : null}
              </View>
              {!isSelected ? (
                <Pressable
                  onPress={async () => {
                    setDeviceBusy(device.deviceId);
                    setDeviceError(null);
                    const result = await onSelectDevice(device.deviceId);
                    if (!result.success) setDeviceError(result.error);
                    setDeviceBusy(null);
                  }}
                  disabled={deviceBusy !== null}
                  style={screenStyles.deviceSmallButton}
                  accessibilityRole="button"
                  accessibilityLabel={`Select ${device.name}`}
                >
                  <Text style={screenStyles.deviceSmallButtonText}>
                    {deviceBusy === device.deviceId ? '…' : 'Select'}
                  </Text>
                </Pressable>
              ) : null}
              <Pressable
                onPress={() => confirmUnlinkDevice(device)}
                disabled={deviceBusy !== null}
                style={screenStyles.deviceUnlinkButton}
                accessibilityRole="button"
                accessibilityLabel={`Unlink ${device.name}`}
              >
                <Text style={screenStyles.deviceUnlinkText}>Unlink</Text>
              </Pressable>
            </View>
          );
        })}

        <View style={screenStyles.deviceForm}>
          <Text style={screenStyles.deviceFormTitle}>Link a device</Text>
          <Text style={screenStyles.deviceFormSubtitle}>Enter the device ID and private claim code.</Text>
          <Pressable
            onPress={openQrScanner}
            style={({ pressed }) => [screenStyles.qrScanButton, pressed && styles.tabButtonPressed]}
            accessibilityRole="button"
          >
            <Text style={screenStyles.qrScanButtonIcon}>▦</Text>
            <Text style={screenStyles.qrScanButtonText}>Scan device QR code</Text>
          </Pressable>
          <Text style={styles.inputLabel}>DEVICE ID</Text>
          <View style={styles.inputRow}>
            <TextInput
              value={deviceIdDraft}
              onChangeText={(value) => { setDeviceIdDraft(value); setDeviceError(null); }}
              placeholder="e.g. pond-uno-r4-001"
              placeholderTextColor="#6A8188"
              autoCapitalize="none"
              autoCorrect={false}
              style={styles.textInput}
              accessibilityLabel="Device ID or QR code content"
            />
          </View>
          <Text style={screenStyles.deviceHint}>
            Or paste the QR code text into the fields below.
          </Text>
          <Text style={[styles.inputLabel, screenStyles.deviceFieldLabel]}>PRIVATE CLAIM CODE</Text>
          <View style={styles.inputRow}>
            <TextInput
              value={deviceClaimCodeDraft}
              onChangeText={(value) => { setDeviceClaimCodeDraft(value); setDeviceError(null); }}
              placeholder="Enter the device claim code"
              placeholderTextColor="#6A8188"
              autoCapitalize="none"
              autoCorrect={false}
              secureTextEntry
              style={styles.textInput}
              accessibilityLabel="Private device claim code"
            />
          </View>
          <Text style={[styles.inputLabel, screenStyles.deviceFieldLabel]}>POND NAME (OPTIONAL)</Text>
          <View style={styles.inputRow}>
            <TextInput
              value={deviceNameDraft}
              onChangeText={setDeviceNameDraft}
              placeholder="e.g. Tilapia pond"
              placeholderTextColor="#6A8188"
              style={styles.textInput}
              accessibilityLabel="Pond name"
            />
          </View>
          {deviceError ? (
            <Text style={screenStyles.deviceError} accessibilityRole="alert">{deviceError}</Text>
          ) : null}
          <Pressable
            onPress={handleClaimDevice}
            disabled={deviceBusy !== null}
            style={({ pressed }) => [
              styles.primaryButton,
              screenStyles.deviceClaimButton,
              deviceBusy === 'claim' && styles.primaryButtonDisabled,
              pressed && styles.tabButtonPressed,
            ]}
            accessibilityRole="button"
          >
            <Text style={styles.primaryButtonText}>
              {deviceBusy === 'claim' ? 'Linking device…' : 'Link device'}
            </Text>
          </Pressable>
        </View>
      </View>
 
      {sections.map((section) => (
        <View
          key={section.title}
          onLayout={section.title === 'NOTIFICATIONS' && focusSmsSettings
            ? (event) => {
                scrollViewRef.current?.scrollTo({ y: event.nativeEvent.layout.y, animated: true });
                onSmsSettingsFocused();
              }
            : undefined}
        >
          {section.title !== 'ACCOUNT' ? (
            <View style={styles.settingsSectionHeader}>
              <Text style={styles.settingsSectionHeaderIcon}>{section.icon}</Text>
              <Text style={styles.settingsSectionHeaderText}>{section.title}</Text>
            </View>
          ) : null}
 
          <View style={styles.settingsGroupCard}>
            {section.rows
              .filter((row) => {
                if (section.title !== 'NOTIFICATIONS') return true;
                if (!preferences.pushNotifications && (row.key === 'alertNotifications' || row.key === 'warningNotifications')) {
                  return false;
                }
                if (!preferences.smsNotifications && (row.key === 'smsCritical' || row.key === 'smsWarning')) {
                  return false;
                }
                return true;
              })
              .map((row, index) => {
              const rowContent = (
                <>
                  <View style={[styles.settingsIconBadge, { backgroundColor: row.iconBg }]}>
                    <Text style={styles.settingsIconBadgeText}>{row.icon}</Text>
                  </View>
                  <View style={styles.settingsRowBody}>
                    <Text style={[styles.settingsRowTitle, row.type === 'destructive' && styles.deleteAccountTitle]}>
                      {row.title}
                    </Text>
                    <Text style={styles.settingsRowSubtitle}>{row.subtitle}</Text>
                  </View>
                  {row.type === 'toggle' && (
                    <Switch
                      value={preferences[row.toggleKey]}
                      onValueChange={() => onTogglePreference(row.toggleKey)}
                      disabled={row.disabled}
                      trackColor={SWITCH_TRACK_COLOR}
                      thumbColor={preferences[row.toggleKey] ? SWITCH_THUMB_COLOR.on : SWITCH_THUMB_COLOR.off}
                    />
                  )}
                  {(row.type === 'link' || row.type === 'destructive') && (
                    <Text style={styles.connectionChevron}>›</Text>
                  )}
                  {row.type === 'action' && (
                    <View style={styles.settingsDatePill}>
                      <Text style={styles.settingsDatePillText}>{row.badge}</Text>
                    </View>
                  )}
                </>
              );
 
              const rowStyle = [styles.settingsRowInner, index > 0 && styles.settingsRowDivider];
 
              if (row.type === 'toggle') {
                return (
                  <View key={row.key} style={rowStyle}>
                    {rowContent}
                  </View>
                );
              }

              return (
                <Pressable
                  key={row.key}
                  onPress={row.onPress}
                  disabled={row.type === 'destructive' && deletingAccount}
                  style={({ pressed }) => [...rowStyle, pressed && styles.tabButtonPressed]}
                >
                  {rowContent}
                </Pressable>
              );
              })}
            {section.title === 'NOTIFICATIONS' && preferences.smsNotifications ? (
              <View style={screenStyles.smsNumberForm}>
                <Text style={screenStyles.smsNumberTitle}>SMS recipient</Text>
                <Text style={screenStyles.smsNumberCopy}>
                  This number is shared with your linked SIM800L boards.
                </Text>
                <View style={[styles.inputRow, screenStyles.smsNumberInput]}>
                  <TextInput
                    value={phoneNumberDraft}
                    onChangeText={(value) => {
                      setPhoneNumberDraft(value);
                      setSmsNumberError(null);
                      setSmsNumberSaved(false);
                    }}
                    placeholder="+639171234567"
                    placeholderTextColor="#71868C"
                    keyboardType="phone-pad"
                    autoCapitalize="none"
                    autoCorrect={false}
                    style={styles.textInput}
                    accessibilityLabel="SMS recipient phone number"
                  />
                </View>
                <Text style={screenStyles.smsNumberHint}>Include the + and country code.</Text>
                {smsNumberSaved ? (
                  <Text style={screenStyles.smsNumberSaved}>Saved. Linked boards update within about a minute.</Text>
                ) : null}
                {smsNumberError ? (
                  <Text style={screenStyles.deviceError} accessibilityRole="alert">{smsNumberError}</Text>
                ) : null}
                <Pressable
                  onPress={handleSaveSmsNumber}
                  disabled={smsNumberSaving}
                  accessibilityRole="button"
                  style={({ pressed }) => [
                    screenStyles.smsNumberSaveButton,
                    smsNumberSaving && styles.primaryButtonDisabled,
                    pressed && styles.tabButtonPressed,
                  ]}
                >
                  <Text style={screenStyles.smsNumberSaveText}>{smsNumberSaving ? 'Saving…' : 'Save number'}</Text>
                </Pressable>
              </View>
            ) : null}
          </View>
        </View>
      ))}
 
      <Pressable
        onPress={() =>
          Alert.alert('Logout', 'Are you sure you want to log out?', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Logout', style: 'destructive', onPress: onLogout },
          ])
        }
        style={({ pressed }) => [styles.logoutButton, pressed && styles.tabButtonPressed]}
      >
        <Text style={styles.logoutButtonText}>Logout</Text>
      </Pressable>
 
      {/* Farm Profile modal */}
      <Modal visible={activeModal === 'farmProfile'} transparent animationType="fade" onRequestClose={closeModal}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.authCardTitle}>Farm Profile</Text>
            <Text style={styles.authCardSubtitle}>Update the name shown on your dashboard</Text>
 
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>FARM NAME</Text>
              <View style={styles.inputRow}>
                <TextInput
                  value={farmNameDraft}
                  onChangeText={setFarmNameDraft}
                  placeholder="e.g. Pond one"
                  placeholderTextColor="#49656D"
                  style={styles.textInput}
                />
              </View>
              {farmProfileError ? <Text style={styles.fieldErrorText}>{farmProfileError}</Text> : null}
            </View>
 
            <Text style={styles.settingsRowSubtitle}>Google account: {accountEmail}</Text>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>SMS PHONE NUMBER</Text>
              <View style={styles.inputRow}>
                <TextInput
                  value={phoneNumberDraft}
                  onChangeText={setPhoneNumberDraft}
                  placeholder="e.g. +639171234567"
                  placeholderTextColor="#49656D"
                  keyboardType="phone-pad"
                  style={styles.textInput}
                />
              </View>
              <Text style={styles.settingsRowSubtitle}>Use international format, including the country code.</Text>
            </View>
 
            <View style={styles.modalButtonRow}>
              <Pressable onPress={closeModal} style={[styles.secondaryButton, styles.modalButtonHalf]}>
                <Text style={styles.secondaryButtonText}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={handleSaveFarmName}
                style={[styles.primaryButton, styles.modalButtonHalf]}
              >
                <Text style={styles.primaryButtonText}>Save</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={activeModal === 'downloadData'} transparent animationType="fade" onRequestClose={closeModal}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.authCardTitle}>Download CSV</Text>
            <Text style={styles.authCardSubtitle}>Export all sensor readings recorded on a specific date</Text>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>DATE</Text>
              <View style={styles.inputRow}>
                <TextInput
                  value={exportDate}
                  onChangeText={setExportDate}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor="#49656D"
                  keyboardType="numbers-and-punctuation"
                  style={styles.textInput}
                />
              </View>
              <Text style={styles.settingsRowSubtitle}>
                Each matching reading includes its exact timestamp.
              </Text>
            </View>

            <View style={styles.modalButtonRow}>
              <Pressable onPress={closeModal} style={[styles.secondaryButton, styles.modalButtonHalf]}>
                <Text style={styles.secondaryButtonText}>Cancel</Text>
              </Pressable>
              <Pressable onPress={handleDownloadData} style={[styles.primaryButton, styles.modalButtonHalf]}>
                <Text style={styles.primaryButtonText}>Export</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={qrScannerVisible}
        animationType="slide"
        onRequestClose={() => setQrScannerVisible(false)}
      >
        <View style={screenStyles.qrScanner}>
          {QrCameraView ? (
            <QrCameraView
              style={screenStyles.qrCamera}
              facing="back"
              barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
              onBarcodeScanned={handleQrScanned}
            />
          ) : null}
          <View style={screenStyles.qrScannerOverlay}>
            <View style={screenStyles.qrScannerHeader}>
              <Text style={screenStyles.qrScannerTitle}>Scan device QR code</Text>
              <Pressable
                onPress={() => setQrScannerVisible(false)}
                accessibilityRole="button"
                accessibilityLabel="Close QR scanner"
                style={screenStyles.qrScannerClose}
              >
                <Text style={screenStyles.qrScannerCloseText}>×</Text>
              </Pressable>
            </View>
            <View style={screenStyles.qrScanFrame} />
            <Text style={screenStyles.qrScannerHint}>
              Hold the QR code inside the frame.
            </Text>
          </View>
        </View>
      </Modal>
 
    </ScrollView>
  );
}

const screenStyles = StyleSheet.create({
  deviceSection: { marginBottom: 8 },
  deviceIntro: { color: '#60777E', fontSize: 12, lineHeight: 18, marginBottom: 13, marginTop: 4 },
  deviceEmpty: {
    backgroundColor: '#FFFFFF',
    borderColor: '#DDE7EB',
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 12,
    padding: 15,
  },
  deviceEmptyTitle: { color: '#172B33', fontSize: 14, fontWeight: '800' },
  deviceEmptyCopy: { color: '#60777E', fontSize: 12, lineHeight: 17, marginTop: 4 },
  deviceCard: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: '#DDE7EB',
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 8,
    marginBottom: 10,
    padding: 14,
  },
  deviceInfo: { flex: 1, minWidth: 0 },
  deviceName: { color: '#172B33', fontSize: 14, fontWeight: '800' },
  deviceId: { color: '#60777E', fontSize: 11, marginTop: 3 },
  deviceSelected: { color: '#078A95', fontSize: 9, fontWeight: '800', letterSpacing: 0.7, marginTop: 5 },
  deviceSmallButton: { backgroundColor: '#E6F5F5', borderRadius: 10, paddingHorizontal: 11, paddingVertical: 8 },
  deviceSmallButtonText: { color: '#087F8C', fontSize: 11, fontWeight: '800' },
  deviceUnlinkButton: { paddingHorizontal: 5, paddingVertical: 8 },
  deviceUnlinkText: { color: '#C84F5B', fontSize: 11, fontWeight: '700' },
  deviceForm: {
    backgroundColor: '#FFFFFF',
    borderColor: '#DDE7EB',
    borderRadius: 18,
    borderWidth: 1,
    marginTop: 4,
    padding: 16,
  },
  deviceFormTitle: { color: '#172B33', fontSize: 16, fontWeight: '800' },
  deviceFormSubtitle: { color: '#71868C', fontSize: 11, lineHeight: 16, marginBottom: 14, marginTop: 4 },
  deviceHint: { color: '#6A8188', fontSize: 10, lineHeight: 14, marginTop: 6 },
  deviceFieldLabel: { marginTop: 14 },
  deviceError: { backgroundColor: '#FFF1F2', borderRadius: 10, color: '#A83E49', fontSize: 11, lineHeight: 16, marginTop: 12, overflow: 'hidden', padding: 10 },
  deviceClaimButton: { borderRadius: 14, marginTop: 15 },
  qrScanButton: { alignItems: 'center', alignSelf: 'flex-start', backgroundColor: '#EAF5F2', borderRadius: 12, flexDirection: 'row', marginBottom: 14, paddingHorizontal: 13, paddingVertical: 10 },
  qrScanButtonIcon: { color: '#087C73', fontSize: 17, fontWeight: '800', marginRight: 8 },
  qrScanButtonText: { color: '#087C73', fontSize: 12, fontWeight: '800' },
  qrScanner: { backgroundColor: '#102A30', flex: 1 },
  qrCamera: { flex: 1 },
  qrScannerOverlay: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'space-between', padding: 24 },
  qrScannerHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', width: '100%' },
  qrScannerTitle: { color: '#FFFFFF', fontSize: 17, fontWeight: '800' },
  qrScannerClose: { alignItems: 'center', backgroundColor: '#102A30CC', borderRadius: 18, height: 36, justifyContent: 'center', width: 36 },
  qrScannerCloseText: { color: '#FFFFFF', fontSize: 25, lineHeight: 28 },
  qrScanFrame: { borderColor: '#67D2B2', borderRadius: 22, borderWidth: 3, height: 240, width: 240 },
  qrScannerHint: { backgroundColor: '#102A30CC', borderRadius: 12, color: '#FFFFFF', fontSize: 12, overflow: 'hidden', paddingHorizontal: 15, paddingVertical: 10, textAlign: 'center' },
  smsNumberForm: { borderTopColor: '#E7ECEE', borderTopWidth: 1, marginTop: 4, padding: 15 },
  smsNumberTitle: { color: '#203840', fontSize: 13, fontWeight: '800' },
  smsNumberCopy: { color: '#71868C', fontSize: 11, lineHeight: 16, marginTop: 3 },
  smsNumberInput: { marginTop: 12 },
  smsNumberHint: { color: '#71868C', fontSize: 10, marginTop: 5 },
  smsNumberSaved: { color: '#087C73', fontSize: 10, lineHeight: 15, marginTop: 7 },
  smsNumberSaveButton: { alignItems: 'center', alignSelf: 'flex-start', backgroundColor: '#173C45', borderRadius: 11, marginTop: 12, paddingHorizontal: 16, paddingVertical: 10 },
  smsNumberSaveText: { color: '#FFFFFF', fontSize: 11, fontWeight: '800' },
});
 
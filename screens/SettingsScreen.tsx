import { useState } from 'react';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { formatValue, metrics } from '../metrics';
import { styles } from '../styles';
import { AuthResult, NotificationPreferences, PondReading, SensorLog } from '../types';
import * as XLSX from 'xlsx';
 
type SettingsScreenProps = {
  farmId: string | null;
  farmName: string;
  phoneNumber: string;
  reading: PondReading;
  lastUpdated: Date;
  historyLogs: SensorLog[];
  preferences: NotificationPreferences;
  onTogglePreference: (key: keyof NotificationPreferences) => void;
  onChangePassword: (currentPassword: string, newPassword: string) => AuthResult;
  onUpdateFarmProfile: (newName: string, phoneNumber: string) => AuthResult;
  onLogout: () => void;
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
 
type Row = LinkRow | ToggleRow | ActionRow;
 
const SWITCH_TRACK_COLOR = { false: '#2b444b', true: '#59c3c377' };
const SWITCH_THUMB_COLOR = { off: '#7fa7aa', on: '#59c3c3' };

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
  farmId,
  farmName,
  phoneNumber,
  reading,
  lastUpdated,
  historyLogs,
  preferences,
  onTogglePreference,
  onChangePassword,
  onUpdateFarmProfile,
  onLogout,
}: SettingsScreenProps) {
  const [activeModal, setActiveModal] = useState<'farmProfile' | 'changePassword' | 'downloadData' | null>(null);
 
  const [farmNameDraft, setFarmNameDraft] = useState(farmName);
  const [phoneNumberDraft, setPhoneNumberDraft] = useState(phoneNumber);
  const [farmProfileError, setFarmProfileError] = useState<string | null>(null);
 
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [exportDate, setExportDate] = useState(() => {
    const now = new Date();
    return [now.getFullYear(), String(now.getMonth() + 1).padStart(2, '0'), String(now.getDate()).padStart(2, '0')].join('-');
  });
 
  const closeModal = () => {
    setActiveModal(null);
    setFarmProfileError(null);
    setPasswordError(null);
    setCurrentPassword('');
    setNewPassword('');
    setConfirmNewPassword('');
  };
 
  const openFarmProfile = () => {
    setFarmNameDraft(farmName);
    setPhoneNumberDraft(phoneNumber);
    setFarmProfileError(null);
    setActiveModal('farmProfile');
  };
 
  const handleSaveFarmName = () => {
    const result = onUpdateFarmProfile(farmNameDraft, phoneNumberDraft);
    if (!result.success) {
      setFarmProfileError(result.error);
      return;
    }
    closeModal();
  };
 
  const handleSavePassword = () => {
    if (!currentPassword.trim() || !newPassword.trim() || !confirmNewPassword.trim()) {
      setPasswordError('Fill in all three fields.');
      return;
    }
    if (newPassword !== confirmNewPassword) {
      setPasswordError('New passwords do not match.');
      return;
    }
    if (newPassword.length < 6) {
      setPasswordError('New password must be at least 6 characters.');
      return;
    }
    const result = onChangePassword(currentPassword, newPassword);
    if (!result.success) {
      setPasswordError(result.error);
      return;
    }
    closeModal();
    Alert.alert('Password updated', 'Your password has been changed.');
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
          iconBg: '#e8c56a22',
          title: 'Farm Profile',
          subtitle: farmId ? `${farmName} · ${farmId}` : 'Manage farm information',
          onPress: openFarmProfile,
        },
        {
          key: 'changePassword',
          type: 'link',
          icon: '🔒',
          iconBg: '#86bdf222',
          title: 'Change Password',
          subtitle: 'Update your login credentials',
          onPress: () => setActiveModal('changePassword'),
        },
      ],
    },
    {
      title: 'NOTIFICATIONS',
      icon: '🔔',
      rows: [
        {
          key: 'alertNotifications',
          type: 'toggle',
          toggleKey: 'alertNotifications',
          icon: '🚨',
          iconBg: '#ef7d8822',
          title: 'Alert Notifications',
          subtitle: 'Show critical alerts on the Alerts tab',
        },
        {
          key: 'warningNotifications',
          type: 'toggle',
          toggleKey: 'warningNotifications',
          icon: '⚠️',
          iconBg: '#e8c56a22',
          title: 'Warning Notifications',
          subtitle: 'Show warning alerts on the Alerts tab',
        },
        {
          key: 'smsNotifications',
          type: 'toggle',
          toggleKey: 'smsNotifications',
          icon: 'SMS',
          iconBg: '#59c3c322',
          title: 'SMS Notifications',
          subtitle: preferences.smsNotifications ? 'SMS alerts are enabled' : 'SMS alerts are disabled',
        },
        {
          key: 'smsCritical',
          type: 'toggle',
          toggleKey: 'smsCritical',
          disabled: !preferences.smsNotifications,
          icon: '🚨',
          iconBg: '#ef7d8822',
          title: 'SMS Critical Alerts',
          subtitle: 'Send an SMS for critical sensor readings',
        },
        {
          key: 'smsWarning',
          type: 'toggle',
          toggleKey: 'smsWarning',
          disabled: !preferences.smsNotifications,
          icon: '⚠️',
          iconBg: '#e8c56a22',
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
          iconBg: '#59c3c322',
          title: 'Auto Refresh',
          subtitle: preferences.autoRefresh ? 'Live sensor updates are on' : 'Paused — showing last known reading',
        },
        {
          key: 'soundAlerts',
          type: 'toggle',
          toggleKey: 'soundAlerts',
          icon: '🔊',
          iconBg: '#59c3c322',
          title: 'Sound Alerts',
          subtitle: 'Vibrate when a new critical alert appears',
        },
        {
          key: 'downloadData',
          type: 'action',
          icon: '⬇️',
          iconBg: '#91afb022',
          title: 'Download Data',
          subtitle: 'Share the latest reading as a CSV',
          badge: '📤',
          onPress: () => setActiveModal('downloadData'),
        },
      ],
    },
  ];
 
  return (
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Settings</Text>
          <Text style={styles.screenSubtitle}>Manage your preferences</Text>
        </View>
      </View>
 
      {sections.map((section) => (
        <View key={section.title}>
          <View style={styles.settingsSectionHeader}>
            <Text style={styles.settingsSectionHeaderIcon}>{section.icon}</Text>
            <Text style={styles.settingsSectionHeaderText}>{section.title}</Text>
          </View>
 
          <View style={styles.settingsGroupCard}>
            {section.rows.map((row, index) => {
              const rowContent = (
                <>
                  <View style={[styles.settingsIconBadge, { backgroundColor: row.iconBg }]}>
                    <Text style={styles.settingsIconBadgeText}>{row.icon}</Text>
                  </View>
                  <View style={styles.settingsRowBody}>
                    <Text style={styles.settingsRowTitle}>{row.title}</Text>
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
                  {row.type === 'link' && <Text style={styles.connectionChevron}>›</Text>}
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
                  style={({ pressed }) => [...rowStyle, pressed && styles.tabButtonPressed]}
                >
                  {rowContent}
                </Pressable>
              );
            })}
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
                  placeholderTextColor="#4f6b6d"
                  style={styles.textInput}
                />
              </View>
              {farmProfileError ? <Text style={styles.fieldErrorText}>{farmProfileError}</Text> : null}
            </View>
 
            <Text style={styles.settingsRowSubtitle}>Farm ID: {farmId} (cannot be changed)</Text>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>SMS PHONE NUMBER</Text>
              <View style={styles.inputRow}>
                <TextInput
                  value={phoneNumberDraft}
                  onChangeText={setPhoneNumberDraft}
                  placeholder="e.g. +639171234567"
                  placeholderTextColor="#4f6b6d"
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
                  placeholderTextColor="#4f6b6d"
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
 
      {/* Change Password modal */}
      <Modal visible={activeModal === 'changePassword'} transparent animationType="fade" onRequestClose={closeModal}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.authCardTitle}>Change Password</Text>
            <Text style={styles.authCardSubtitle}>Enter your current password and choose a new one</Text>
 
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>CURRENT PASSWORD</Text>
              <View style={styles.inputRow}>
                <TextInput
                  value={currentPassword}
                  onChangeText={setCurrentPassword}
                  placeholder="Current password"
                  placeholderTextColor="#4f6b6d"
                  secureTextEntry
                  style={styles.textInput}
                />
              </View>
            </View>
 
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>NEW PASSWORD</Text>
              <View style={styles.inputRow}>
                <TextInput
                  value={newPassword}
                  onChangeText={setNewPassword}
                  placeholder="New password"
                  placeholderTextColor="#4f6b6d"
                  secureTextEntry
                  style={styles.textInput}
                />
              </View>
            </View>
 
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>CONFIRM NEW PASSWORD</Text>
              <View style={styles.inputRow}>
                <TextInput
                  value={confirmNewPassword}
                  onChangeText={setConfirmNewPassword}
                  placeholder="Confirm new password"
                  placeholderTextColor="#4f6b6d"
                  secureTextEntry
                  style={styles.textInput}
                />
              </View>
              {passwordError ? <Text style={styles.fieldErrorText}>{passwordError}</Text> : null}
            </View>
 
            <View style={styles.modalButtonRow}>
              <Pressable onPress={closeModal} style={[styles.secondaryButton, styles.modalButtonHalf]}>
                <Text style={styles.secondaryButtonText}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={handleSavePassword}
                style={[styles.primaryButton, styles.modalButtonHalf]}
              >
                <Text style={styles.primaryButtonText}>Save</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
 
    </ScrollView>
  );
}
 
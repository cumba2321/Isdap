import { useState } from 'react';
import {
  Alert,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  Share,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { formatValue } from '../metrics';
import { styles } from '../styles';
import { AuthResult, NotificationPreferences, PondReading } from '../types';
 
type SettingsScreenProps = {
  isLive: boolean;
  farmId: string | null;
  farmName: string;
  reading: PondReading;
  lastUpdated: Date;
  preferences: NotificationPreferences;
  onTogglePreference: (key: keyof NotificationPreferences) => void;
  onChangePassword: (currentPassword: string, newPassword: string) => AuthResult;
  onUpdateFarmName: (newName: string) => AuthResult;
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
type ToggleRow = RowBase & { type: 'toggle'; toggleKey: keyof NotificationPreferences };
type ActionRow = RowBase & { type: 'action'; onPress: () => void; badge: string };
 
type Row = LinkRow | ToggleRow | ActionRow;
 
const SWITCH_TRACK_COLOR = { false: '#2b444b', true: '#59c3c377' };
const SWITCH_THUMB_COLOR = { off: '#7fa7aa', on: '#59c3c3' };
 
const APP_VERSION = '1.0.0';
 
export default function SettingsScreen({
  isLive,
  farmId,
  farmName,
  reading,
  lastUpdated,
  preferences,
  onTogglePreference,
  onChangePassword,
  onUpdateFarmName,
  onLogout,
}: SettingsScreenProps) {
  const [activeModal, setActiveModal] = useState<'farmProfile' | 'changePassword' | 'systemInfo' | 'about' | null>(
    null,
  );
 
  const [farmNameDraft, setFarmNameDraft] = useState(farmName);
  const [farmProfileError, setFarmProfileError] = useState<string | null>(null);
 
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [passwordError, setPasswordError] = useState<string | null>(null);
 
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
    setFarmProfileError(null);
    setActiveModal('farmProfile');
  };
 
  const handleSaveFarmName = () => {
    const result = onUpdateFarmName(farmNameDraft);
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
    const rows = [
      ['Parameter', 'Value', 'Unit'],
      ['Temperature', formatValue(reading.temp, 'temp'), 'C'],
      ['Dissolved oxygen', formatValue(reading.do, 'do'), 'mg/L'],
      ['pH level', formatValue(reading.ph, 'ph'), 'pH'],
      ['Turbidity', formatValue(reading.turbidity, 'turbidity'), 'NTU'],
      ['Conductivity', formatValue(reading.ec, 'ec'), 'mS/cm'],
      ['Total dissolved solids', formatValue(reading.tds, 'tds'), 'ppm'],
    ];
    const csv = [
      `Pond reading export — ${lastUpdated.toLocaleString()}`,
      '',
      ...rows.map((row) => row.join(', ')),
    ].join('\n');
 
    try {
      await Share.share({
        title: 'Pond reading export',
        message: csv,
      });
    } catch {
      Alert.alert('Could not share', 'Something went wrong while preparing the export.');
    }
  };
 
  const handleHelpSupport = async () => {
    const url = 'mailto:support@isdaapp.io?subject=IsdaApp%20Support&body=Farm%20ID%3A%20' + (farmId ?? '');
    const canOpen = await Linking.canOpenURL(url);
    if (canOpen) {
      Linking.openURL(url);
    } else {
      Alert.alert('No email app found', 'Reach us at support@isdaapp.io');
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
          key: 'maintenanceAlerts',
          type: 'toggle',
          toggleKey: 'maintenanceAlerts',
          icon: '🔧',
          iconBg: '#91afb022',
          title: 'Maintenance Alerts',
          subtitle: 'System maintenance notifications',
        },
        {
          key: 'updateNotifications',
          type: 'toggle',
          toggleKey: 'updateNotifications',
          icon: '📲',
          iconBg: '#86bdf222',
          title: 'Update Notifications',
          subtitle: 'App and system updates',
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
          onPress: handleDownloadData,
        },
        {
          key: 'systemInfo',
          type: 'link',
          icon: 'ℹ️',
          iconBg: '#86bdf222',
          title: 'System Info',
          subtitle: `v${APP_VERSION} · ${isLive ? 'Live data connected' : 'Demo data mode'}`,
          onPress: () => setActiveModal('systemInfo'),
        },
      ],
    },
    {
      title: 'SUPPORT',
      icon: '💬',
      rows: [
        {
          key: 'helpSupport',
          type: 'link',
          icon: '🆘',
          iconBg: '#ef7d8822',
          title: 'Help & Support',
          subtitle: 'Email support@isdaapp.io',
          onPress: handleHelpSupport,
        },
        {
          key: 'about',
          type: 'link',
          icon: '📋',
          iconBg: '#91afb022',
          title: 'About ISDAAPP',
          subtitle: 'App information and credits',
          onPress: () => setActiveModal('about'),
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
 
      {/* System Info modal */}
      <Modal visible={activeModal === 'systemInfo'} transparent animationType="fade" onRequestClose={closeModal}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.authCardTitle}>System Info</Text>
            <Text style={styles.authCardSubtitle}>Live details about this station</Text>
 
            {[
              ['App version', APP_VERSION],
              ['Connection', isLive ? 'Live · Firebase Realtime Database' : 'Demo data (no live connection)'],
              ['Farm ID', farmId ?? '—'],
              ['Last updated', lastUpdated.toLocaleString()],
              ['Monitored parameters', '6 (temp, DO, pH, turbidity, EC, TDS)'],
            ].map(([label, value]) => (
              <View key={label} style={styles.settingsRowInner}>
                <View style={styles.settingsRowBody}>
                  <Text style={styles.settingsRowTitle}>{label}</Text>
                  <Text style={styles.settingsRowSubtitle}>{value}</Text>
                </View>
              </View>
            ))}
 
            <Pressable onPress={closeModal} style={[styles.primaryButton, { marginTop: 16 }]}>
              <Text style={styles.primaryButtonText}>Close</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
 
      {/* About modal */}
      <Modal visible={activeModal === 'about'} transparent animationType="fade" onRequestClose={closeModal}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.authCardTitle}>About ISDAAPP</Text>
            <Text style={styles.authCardSubtitle}>IoT Water Quality Monitoring System</Text>
            <Text style={styles.settingsRowSubtitle}>
              IsdaApp helps pond and hatchery operators keep an eye on temperature, dissolved oxygen, pH,
              turbidity, conductivity, and total dissolved solids in real time, with alerts when a reading
              drifts outside a safe range.
            </Text>
            <Text style={[styles.settingsRowSubtitle, { marginTop: 12 }]}>Version {APP_VERSION}</Text>
 
            <Pressable onPress={closeModal} style={[styles.primaryButton, { marginTop: 16 }]}>
              <Text style={styles.primaryButtonText}>Close</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}
 
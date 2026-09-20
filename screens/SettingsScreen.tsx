import { useState } from 'react';
import {
  Alert,
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
  farmId: string | null;
  farmName: string;
  phoneNumber: string;
  reading: PondReading;
  lastUpdated: Date;
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
 
export default function SettingsScreen({
  farmId,
  farmName,
  phoneNumber,
  reading,
  lastUpdated,
  preferences,
  onTogglePreference,
  onChangePassword,
  onUpdateFarmProfile,
  onLogout,
}: SettingsScreenProps) {
  const [activeModal, setActiveModal] = useState<'farmProfile' | 'changePassword' | null>(null);
 
  const [farmNameDraft, setFarmNameDraft] = useState(farmName);
  const [phoneNumberDraft, setPhoneNumberDraft] = useState(phoneNumber);
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
          onPress: handleDownloadData,
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
 
import { Image, ImageSourcePropType, Pressable, Text, View } from 'react-native';
import { styles } from '../styles';
import { TabKey } from '../types';
 
type TabBarProps = {
  activeTab: TabKey;
  onChangeTab: (tab: TabKey) => void;
  hasUnreadAlerts: boolean;
};
 
function TabButton({
  label,
  image,
  active,
  onPress,
  badge,
}: {
  label: string;
  image: ImageSourcePropType;
  active: boolean;
  onPress: () => void;
  badge?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.tabButton, pressed && styles.tabButtonPressed]}
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      accessibilityLabel={badge ? `${label}, unread alerts` : label}
    >
      <View style={styles.tabIconWrap}>
        <View style={[styles.tabIcon, active && styles.tabIconActive]}>
          <Image source={image} style={styles.tabImage} resizeMode="contain" />
        </View>
        {badge ? <View style={styles.tabBadge} /> : null}
      </View>
      <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>{label}</Text>
    </Pressable>
  );
}
 
export default function TabBar({ activeTab, onChangeTab, hasUnreadAlerts }: TabBarProps) {
  return (
    <View style={styles.tabBar}>
      <TabButton
        label="Dashboard"
        image={require('../assets/tab-dashboard.png')}
        active={activeTab === 'dashboard'}
        onPress={() => onChangeTab('dashboard')}
      />
      <TabButton
        label="Alert"
        image={require('../assets/tab-alert.png')}
        active={activeTab === 'alert'}
        onPress={() => onChangeTab('alert')}
        badge={hasUnreadAlerts}
      />
      <Pressable
        onPress={() => onChangeTab('calibration')}
        style={({ pressed }) => [styles.tabCalibrationButton, pressed && styles.tabButtonPressed]}
        accessibilityRole="tab"
        accessibilityState={{ selected: activeTab === 'calibration' }}
        accessibilityLabel="Calibrate sensors"
      >
        <View style={[styles.tabIcon, activeTab === 'calibration' && styles.tabIconActive]}>
          <Image
            source={require('../assets/tab-calibration.png')}
            style={styles.tabImage}
            resizeMode="contain"
            accessibilityLabel="Calibration instrument icon"
          />
        </View>
        <Text style={[
          styles.tabLabel,
          activeTab === 'calibration' && styles.tabLabelActive,
        ]}>
          Calibrate
        </Text>
      </Pressable>
      <TabButton
        label="History"
        image={require('../assets/tab-history.png')}
        active={activeTab === 'history'}
        onPress={() => onChangeTab('history')}
      />
      <TabButton
        label="Settings"
        image={require('../assets/tab-settings.png')}
        active={activeTab === 'settings'}
        onPress={() => onChangeTab('settings')}
      />
    </View>
  );
}
 
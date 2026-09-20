import { Pressable, Text, View } from 'react-native';
import { styles } from '../styles';
import { TabKey } from '../types';
 
type TabBarProps = {
  activeTab: TabKey;
  onChangeTab: (tab: TabKey) => void;
  hasAlert: boolean;
};
 
function TabButton({
  label,
  icon,
  active,
  onPress,
  badge,
}: {
  label: string;
  icon: string;
  active: boolean;
  onPress: () => void;
  badge?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.tabButton, pressed && styles.tabButtonPressed]}
    >
      <View style={styles.tabIconWrap}>
        <View style={[styles.tabIcon, active && styles.tabIconActive]}>
          <Text style={[styles.tabIconText, active && styles.tabIconTextActive]}>{icon}</Text>
        </View>
        {badge ? <View style={styles.tabBadge} /> : null}
      </View>
      <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>{label}</Text>
    </Pressable>
  );
}
 
export default function TabBar({ activeTab, onChangeTab, hasAlert }: TabBarProps) {
  return (
    <View style={styles.tabBar}>
      <TabButton
        label="Dashboard"
        icon="DASH"
        active={activeTab === 'dashboard'}
        onPress={() => onChangeTab('dashboard')}
      />
      <TabButton
        label="Alert"
        icon="ALRT"
        active={activeTab === 'alert'}
        onPress={() => onChangeTab('alert')}
        badge={hasAlert}
      />
      <TabButton
        label="History"
        icon="HIST"
        active={activeTab === 'history'}
        onPress={() => onChangeTab('history')}
      />
      <TabButton
        label="Settings"
        icon="SET"
        active={activeTab === 'settings'}
        onPress={() => onChangeTab('settings')}
      />
    </View>
  );
}
 
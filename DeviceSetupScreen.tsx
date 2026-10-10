import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  StatusBar,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { COLORS } from './constants/colors';

// Define the props interface for the navigation stack
interface Props {
  navigation: any; // Using 'any' here for a frictionless drop-in, replace with NativeStackNavigationProp if you have a RootStackParamList
}

export default function DeviceSetupScreen({ navigation }: Props) {
  // TypeScript will automatically infer these as strings and booleans
  const [ssid, setSsid] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);

  const sendCredentials = async (): Promise<void> => {
    if (!ssid.trim()) {
      Alert.alert('Missing Info', 'Please enter your Wi-Fi Network Name (SSID).');
      return;
    }

    setLoading(true);

    try {
      // The Arduino IP address in AP Mode is always 192.168.4.1
      const targetUrl = `http://192.168.4.1/?ssid=${encodeURIComponent(ssid)}&pass=${encodeURIComponent(password)}`;
      
      // We use a short timeout so the app doesn't hang forever if disconnected
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const response = await fetch(targetUrl, { signal: controller.signal });
      clearTimeout(timeoutId);

      if (response.ok) {
        Alert.alert(
          'Success!', 
          'Credentials sent to the hardware. The Arduino is now rebooting and connecting to your Wi-Fi.',
          [{ text: 'OK', onPress: () => navigation.goBack() }]
        );
      } else {
        Alert.alert('Error', 'Arduino received the request but returned an error.');
      }
    } catch (error) {
      Alert.alert(
        'Connection Failed', 
        'Could not reach the Arduino. Please make sure your phone is connected to the "IsdaApp_Setup" Wi-Fi network and try again.'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.primary} />
      
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backTxt}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Add New Device</Text>
      </View>

      <View style={styles.container}>
        <View style={styles.iconContainer}>
          <Text style={styles.icon}>📡</Text>
        </View>
        <Text style={styles.title}>Hardware Provisioning</Text>
        <Text style={styles.subtitle}>
          Connect your phone to the <Text style={{fontWeight: 'bold', color: COLORS.primary}}>IsdaApp_Setup</Text> Wi-Fi network, then enter your local farm Wi-Fi details below.
        </Text>

        <Text style={styles.label}>Farm Wi-Fi Name (SSID)</Text>
        <TextInput
          style={styles.input}
          placeholder="e.g. Farm_Network_5G"
          value={ssid}
          onChangeText={setSsid}
          autoCapitalize="none"
          autoCorrect={false}
        />

        <Text style={styles.label}>Wi-Fi Password</Text>
        <TextInput
          style={styles.input}
          placeholder="Enter password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
        />

        <TouchableOpacity 
          style={[styles.btn, loading && { opacity: 0.7 }]} 
          onPress={sendCredentials}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.btnTxt}>Send to Hardware</Text>
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.background },
  header: { backgroundColor: COLORS.primary, padding: 16, flexDirection: 'row', alignItems: 'center' },
  backBtn: { paddingRight: 16 },
  backTxt: { color: COLORS.white, fontSize: 16, fontWeight: '600' },
  headerTitle: { color: COLORS.white, fontSize: 18, fontWeight: 'bold' },
  container: { padding: 24 },
  iconContainer: { alignSelf: 'center', width: 72, height: 72, borderRadius: 36, backgroundColor: '#E1F5EE', alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  icon: { fontSize: 32 },
  title: { fontSize: 22, fontWeight: 'bold', textAlign: 'center', marginBottom: 8, color: COLORS.textPrimary },
  subtitle: { fontSize: 14, textAlign: 'center', color: COLORS.textSecondary, marginBottom: 32, lineHeight: 22 },
  label: { fontSize: 12, fontWeight: 'bold', color: COLORS.textSecondary, textTransform: 'uppercase', marginBottom: 8 },
  input: { borderWidth: 1, borderColor: COLORS.border, borderRadius: 12, padding: 16, fontSize: 16, marginBottom: 20, backgroundColor: COLORS.white },
  btn: { backgroundColor: COLORS.primary, padding: 16, borderRadius: 12, alignItems: 'center', marginTop: 12 },
  btnTxt: { color: COLORS.white, fontSize: 16, fontWeight: 'bold' },
});
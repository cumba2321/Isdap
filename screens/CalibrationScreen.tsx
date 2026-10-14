import { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { metrics, formatValue } from '../metrics';
import { styles } from '../styles';
import {
  AuthResult,
  CalibratableMetricKey,
  PondReading,
  SensorCalibrations,
} from '../types';

type CalibrationGuide = {
  key: CalibratableMetricKey;
  label: string;
  standard: string;
  initialValue: string;
  icon: string;
  color: string;
  instructions: string[];
  note: string;
};

const calibrationGuides: CalibrationGuide[] = [
  {
    key: 'ph',
    label: 'pH',
    standard: 'pH 7.00 buffer',
    initialValue: '7.00',
    icon: 'pH',
    color: '#8F68B8',
    instructions: [
      'Use a fresh, certified pH buffer. A pH 7.00 buffer is a good starting point.',
      'Rinse the probe with distilled water and gently blot it dry. Do not rub the glass bulb.',
      'Place the probe in the buffer, gently stir, and wait for the reading to settle.',
      'Enter the exact pH printed on the buffer bottle at its stated temperature.',
    ],
    note: 'This is a one-point pH offset. For best accuracy across the full pH range, use a proper two-point calibration on the sensor hardware.',
  },
  {
    key: 'tds',
    label: 'TDS',
    standard: 'TDS standard',
    initialValue: '342',
    icon: 'TDS',
    color: '#4486BB',
    instructions: [
      'Use a fresh TDS calibration solution; 342 ppm is a common standard.',
      'Rinse the probe, immerse it to its marked line, and gently stir.',
      'Wait for the value to stabilize, then enter the solution value shown on its label.',
    ],
    note: 'TDS is adjusted using a scale factor. Use a standard close to the values you normally measure.',
  },
  {
    key: 'ec',
    label: 'EC',
    standard: 'EC standard',
    initialValue: '1.413',
    icon: 'EC',
    color: '#C46B77',
    instructions: [
      'Use a fresh conductivity standard. 1.413 mS/cm (1413 µS/cm) is a common choice.',
      'Rinse the probe and cup with a little of the standard before filling the cup.',
      'Immerse the probe, gently stir, wait for a stable reading, and use the temperature-corrected label value.',
    ],
    note: 'Enter the value in mS/cm, matching the EC unit shown on the dashboard.',
  },
  {
    key: 'turbidity',
    label: 'Turbidity',
    standard: 'Turbidity standard',
    initialValue: '100',
    icon: 'NTU',
    color: '#B68A28',
    instructions: [
      'Use a certified turbidity standard, such as 100 NTU, compatible with your probe.',
      'Rinse the sample container and probe. Avoid bubbles, fingerprints, and stray light.',
      'Keep the probe in the same position you use for pond readings and wait for the value to settle.',
      'Enter the standard value from its label.',
    ],
    note: 'A one-point scale adjustment is applied. Keep the optics clean and use a suitable standard for reliable results.',
  },
  {
    key: 'do',
    label: 'Dissolved oxygen',
    standard: 'Known DO reference',
    initialValue: '8.26',
    icon: 'DO',
    color: '#278B8F',
    instructions: [
      'Use a trusted reference DO meter, or prepare air-saturated freshwater using the probe maker’s procedure.',
      'The suggested 8.26 mg/L is only an estimate for freshwater at 25 °C near sea level. Temperature, salinity, and altitude change it.',
      'Keep the probe moving gently if its manual requires flow. Avoid bubbles touching the sensing tip.',
      'Enter the known, temperature-corrected reference value.',
    ],
    note: 'For DO, use a reliable reference value for your water conditions; do not rely on the suggested value if those conditions differ.',
  },
];

type CalibrationScreenProps = {
  deviceName: string | null;
  deviceId: string | null;
  reading: PondReading;
  isLive: boolean;
  calibrations: SensorCalibrations;
  onBack: () => void;
  onSave: (
    key: CalibratableMetricKey,
    referenceValue: number,
    measuredValue: number,
  ) => Promise<AuthResult>;
  onClear: (key: CalibratableMetricKey) => Promise<AuthResult>;
};

export default function CalibrationScreen({
  deviceName,
  deviceId,
  reading,
  isLive,
  calibrations,
  onBack,
  onSave,
  onClear,
}: CalibrationScreenProps) {
  const [selectedKey, setSelectedKey] = useState<CalibratableMetricKey>('ph');
  const [referenceText, setReferenceText] = useState(
    String(calibrations.ph?.referenceValue ?? calibrationGuides[0].initialValue),
  );
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<'save' | 'clear' | null>(null);

  const guide = calibrationGuides.find((item) => item.key === selectedKey) ?? calibrationGuides[0];
  const metric = metrics.find((item) => item.key === selectedKey);
  const currentCalibration = calibrations[selectedKey];
  const measuredValue = reading[selectedKey];

  const selectSensor = (key: CalibratableMetricKey) => {
    setSelectedKey(key);
    const nextGuide = calibrationGuides.find((item) => item.key === key);
    setReferenceText(String(calibrations[key]?.referenceValue ?? nextGuide?.initialValue ?? ''));
    setError(null);
    setNotice(null);
  };

  const handleSave = async () => {
    const referenceValue = Number(referenceText.trim().replace(',', '.'));
    if (!Number.isFinite(referenceValue) || referenceText.trim() === '') {
      setError('Enter the numeric value printed on your calibration solution.');
      return;
    }
    if (referenceValue <= 0 && selectedKey !== 'ph') {
      setError('The reference value must be greater than zero for this sensor.');
      return;
    }
    if (!isLive || !deviceId) {
      setError('Connect a linked sensor and wait for a live reading before calibrating.');
      return;
    }
    if (!Number.isFinite(measuredValue) || (selectedKey !== 'ph' && measuredValue <= 0)) {
      setError('The current sensor reading cannot be used for calibration. Check the probe and try again.');
      return;
    }
    if (selectedKey === 'ph' && (referenceValue < 0 || referenceValue > 14)) {
      setError('Enter a pH reference between 0 and 14.');
      return;
    }

    setBusy('save');
    setError(null);
    setNotice(null);
    try {
      const result = await onSave(selectedKey, referenceValue, measuredValue);
      if (!result.success) {
        setError(result.error);
        return;
      }
      setNotice(`${guide.label} adjustment saved for ${deviceName ?? 'this pond'}.`);
    } catch {
      setError('Could not save this adjustment. Check your connection and try again.');
    } finally {
      setBusy(null);
    }
  };

  const confirmClear = () => {
    Alert.alert(
      'Remove this app adjustment?',
      'This removes only the IsdaApp correction for this sensor. Your existing firmware calibration remains unchanged.',
      [
        { text: 'Keep it', style: 'cancel' },
        {
          text: 'Remove adjustment',
          style: 'destructive',
          onPress: async () => {
            setBusy('clear');
            setError(null);
            setNotice(null);
            try {
              const result = await onClear(selectedKey);
              if (!result.success) {
                setError(result.error);
              } else {
                setNotice(`${guide.label} app adjustment removed. Firmware calibration is unchanged.`);
                setReferenceText(guide.initialValue);
              }
            } catch {
              setError('Could not remove this adjustment. Check your connection and try again.');
            } finally {
              setBusy(null);
            }
          },
        },
      ],
    );
  };

  return (
    <KeyboardAvoidingView
      style={styles.safeArea}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={screenStyles.content} keyboardShouldPersistTaps="handled">
        <Pressable
          onPress={onBack}
          style={({ pressed }) => [screenStyles.backButton, pressed && styles.tabButtonPressed]}
          accessibilityRole="button"
          accessibilityLabel="Back to settings"
        >
          <Text style={screenStyles.backText}>‹  Settings</Text>
        </Pressable>

        <View style={screenStyles.header}>
          <View style={screenStyles.heroIcon}>
            <Text style={screenStyles.heroIconText}>◎</Text>
          </View>
          <Text style={screenStyles.title}>Sensor calibration</Text>
          <Text style={screenStyles.subtitle}>
            A few careful steps help your readings match a trusted reference.
          </Text>
          <View style={screenStyles.devicePill}>
            <View style={[screenStyles.liveDot, isLive && screenStyles.liveDotActive]} />
            <Text style={screenStyles.devicePillText}>
              {deviceName ?? 'No pond selected'} · {isLive ? 'LIVE' : 'WAITING FOR SENSOR'}
            </Text>
          </View>
        </View>

        <View style={screenStyles.preserveCard}>
          <Text style={screenStyles.preserveTitle}>Your existing calibration is safe</Text>
          <Text style={screenStyles.preserveCopy}>
            The calibration values and formulas already in your sensor firmware are not changed.
            These optional adjustments are saved to your account for this pond and applied in
            IsdaApp after readings arrive.
          </Text>
        </View>

        <Text style={screenStyles.sectionTitle}>Choose a sensor</Text>
        <View style={screenStyles.sensorList}>
          {calibrationGuides.map((item) => {
            const isSelected = item.key === selectedKey;
            const sensorMetric = metrics.find((candidate) => candidate.key === item.key);
            const saved = calibrations[item.key];
            return (
              <Pressable
                key={item.key}
                onPress={() => selectSensor(item.key)}
                style={[
                  screenStyles.sensorCard,
                  isSelected && screenStyles.sensorCardSelected,
                ]}
                accessibilityRole="button"
                accessibilityState={{ selected: isSelected }}
              >
                <View style={[screenStyles.sensorIcon, { backgroundColor: `${item.color}1A` }]}>
                  <Text style={[screenStyles.sensorIconText, { color: item.color }]}>{item.icon}</Text>
                </View>
                <View style={screenStyles.sensorBody}>
                  <Text style={screenStyles.sensorName}>{item.label}</Text>
                  <Text style={screenStyles.sensorValue}>
                    {formatValue(reading[item.key], item.key)} {sensorMetric?.unit}
                  </Text>
                </View>
                <View style={[screenStyles.statusPill, saved && screenStyles.statusPillSaved]}>
                  <Text style={[screenStyles.statusText, saved && screenStyles.statusTextSaved]}>
                    {saved ? 'ADJUSTED' : 'NOT SET'}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </View>

        <View style={screenStyles.detailCard}>
          <View style={screenStyles.detailHeading}>
            <View style={[screenStyles.sensorIcon, { backgroundColor: `${guide.color}1A` }]}>
              <Text style={[screenStyles.sensorIconText, { color: guide.color }]}>{guide.icon}</Text>
            </View>
            <View style={screenStyles.detailHeadingBody}>
              <Text style={screenStyles.detailTitle}>{guide.label} calibration</Text>
              <Text style={screenStyles.detailSubtitle}>Reference: {guide.standard}</Text>
            </View>
          </View>

          <View style={screenStyles.readingCard}>
            <Text style={screenStyles.readingLabel}>CURRENT SENSOR READING</Text>
            <Text style={screenStyles.readingValue}>
              {formatValue(measuredValue, selectedKey)}
              <Text style={screenStyles.readingUnit}> {metric?.unit}</Text>
            </Text>
            <Text style={screenStyles.readingHint}>
              {isLive ? 'Let the value settle before saving.' : 'A live sensor reading is needed.'}
            </Text>
          </View>

          <Text style={screenStyles.sectionTitle}>Before you start</Text>
          {guide.instructions.map((instruction, index) => (
            <View key={`${selectedKey}-${index}`} style={screenStyles.instructionRow}>
              <View style={screenStyles.instructionNumber}>
                <Text style={screenStyles.instructionNumberText}>{index + 1}</Text>
              </View>
              <Text style={screenStyles.instructionText}>{instruction}</Text>
            </View>
          ))}

          <View style={screenStyles.careTip}>
            <Text style={screenStyles.careTipTitle}>Helpful tip</Text>
            <Text style={screenStyles.careTipText}>
              Rinse between solutions and use fresh, uncontaminated calibration liquid. Follow
              the sensor maker’s care instructions.
            </Text>
          </View>

          <Text style={[screenStyles.sectionTitle, screenStyles.referenceLabel]}>
            Value from the reference
          </Text>
          <View style={screenStyles.inputRow}>
            <TextInput
              value={referenceText}
              onChangeText={(value) => {
                setReferenceText(value);
                setError(null);
                setNotice(null);
              }}
              placeholder={guide.initialValue}
              placeholderTextColor="#8A9BA0"
              keyboardType="decimal-pad"
              style={screenStyles.input}
              accessibilityLabel={`${guide.label} calibration reference value`}
            />
            <Text style={screenStyles.inputUnit}>{metric?.unit}</Text>
          </View>
          <Text style={screenStyles.noteText}>{guide.note}</Text>

          {currentCalibration ? (
            <View style={screenStyles.savedCard}>
              <Text style={screenStyles.savedTitle}>Adjustment active</Text>
              <Text style={screenStyles.savedCopy}>
                Reference {currentCalibration.referenceValue} {metric?.unit}, measured{' '}
                {formatValue(currentCalibration.measuredValue, selectedKey)} {metric?.unit}
                {'\n'}Saved {new Date(currentCalibration.calibratedAt).toLocaleDateString()}
              </Text>
            </View>
          ) : null}

          {error ? (
            <Text style={screenStyles.errorText} accessibilityRole="alert">{error}</Text>
          ) : null}
          {notice ? (
            <Text style={screenStyles.successText} accessibilityRole="alert">{notice}</Text>
          ) : null}

          <Pressable
            onPress={handleSave}
            disabled={busy !== null || !isLive || !deviceId}
            style={({ pressed }) => [
              styles.primaryButton,
              screenStyles.saveButton,
              (busy !== null || !isLive || !deviceId) && styles.primaryButtonDisabled,
              pressed && styles.tabButtonPressed,
            ]}
            accessibilityRole="button"
          >
            <Text style={styles.primaryButtonText}>
              {busy === 'save' ? 'Saving adjustment…' : `Save ${guide.label} adjustment`}
            </Text>
          </Pressable>

          {currentCalibration ? (
            <Pressable
              onPress={confirmClear}
              disabled={busy !== null}
              style={({ pressed }) => [screenStyles.clearButton, pressed && styles.tabButtonPressed]}
              accessibilityRole="button"
            >
              <Text style={screenStyles.clearButtonText}>
                {busy === 'clear' ? 'Removing…' : 'Remove app adjustment'}
              </Text>
            </Pressable>
          ) : null}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const screenStyles = StyleSheet.create({
  content: {
    padding: 20,
    paddingBottom: 40,
  },
  backButton: {
    alignSelf: 'flex-start',
    paddingHorizontal: 4,
    paddingVertical: 8,
  },
  backText: {
    color: '#087F8C',
    fontSize: 15,
    fontWeight: '700',
  },
  header: {
    alignItems: 'center',
    paddingBottom: 20,
    paddingTop: 12,
  },
  heroIcon: {
    alignItems: 'center',
    backgroundColor: '#DDF1F2',
    borderRadius: 28,
    height: 56,
    justifyContent: 'center',
    width: 56,
  },
  heroIconText: {
    color: '#087F8C',
    fontSize: 32,
    fontWeight: '700',
  },
  title: {
    color: '#172B33',
    fontSize: 26,
    fontWeight: '800',
    marginTop: 12,
    textAlign: 'center',
  },
  subtitle: {
    color: '#60777E',
    fontSize: 14,
    lineHeight: 20,
    marginTop: 6,
    maxWidth: 340,
    textAlign: 'center',
  },
  devicePill: {
    alignItems: 'center',
    backgroundColor: '#EAF1F3',
    borderRadius: 18,
    flexDirection: 'row',
    marginTop: 14,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  liveDot: {
    backgroundColor: '#A87500',
    borderRadius: 4,
    height: 8,
    marginRight: 7,
    width: 8,
  },
  liveDotActive: {
    backgroundColor: '#078A95',
  },
  devicePillText: {
    color: '#334B53',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  preserveCard: {
    backgroundColor: '#E8F5EF',
    borderColor: '#B8DED0',
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 24,
    padding: 15,
  },
  preserveTitle: {
    color: '#176A50',
    fontSize: 14,
    fontWeight: '800',
  },
  preserveCopy: {
    color: '#49656D',
    fontSize: 12,
    lineHeight: 18,
    marginTop: 5,
  },
  sectionTitle: {
    color: '#172B33',
    fontSize: 17,
    fontWeight: '800',
    marginBottom: 10,
  },
  sensorList: {
    gap: 9,
    marginBottom: 22,
  },
  sensorCard: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: '#DDE7EB',
    borderRadius: 15,
    borderWidth: 1,
    flexDirection: 'row',
    padding: 11,
  },
  sensorCardSelected: {
    borderColor: '#078A95',
    borderWidth: 2,
  },
  sensorIcon: {
    alignItems: 'center',
    borderRadius: 12,
    height: 42,
    justifyContent: 'center',
    width: 46,
  },
  sensorIconText: {
    fontSize: 12,
    fontWeight: '900',
  },
  sensorBody: {
    flex: 1,
    marginLeft: 12,
  },
  sensorName: {
    color: '#172B33',
    fontSize: 14,
    fontWeight: '800',
  },
  sensorValue: {
    color: '#60777E',
    fontSize: 12,
    marginTop: 3,
  },
  statusPill: {
    backgroundColor: '#EEF3F5',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  statusPillSaved: {
    backgroundColor: '#E8F5EF',
  },
  statusText: {
    color: '#60777E',
    fontSize: 9,
    fontWeight: '800',
  },
  statusTextSaved: {
    color: '#176A50',
  },
  detailCard: {
    backgroundColor: '#FFFFFF',
    borderColor: '#DDE7EB',
    borderRadius: 20,
    borderWidth: 1,
    padding: 16,
  },
  detailHeading: {
    alignItems: 'center',
    flexDirection: 'row',
    marginBottom: 16,
  },
  detailHeadingBody: {
    flex: 1,
    marginLeft: 12,
  },
  detailTitle: {
    color: '#172B33',
    fontSize: 18,
    fontWeight: '800',
  },
  detailSubtitle: {
    color: '#60777E',
    fontSize: 12,
    marginTop: 3,
  },
  readingCard: {
    backgroundColor: '#F5F8FA',
    borderRadius: 15,
    marginBottom: 20,
    padding: 14,
  },
  readingLabel: {
    color: '#60777E',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  readingValue: {
    color: '#172B33',
    fontSize: 30,
    fontWeight: '800',
    marginTop: 4,
  },
  readingUnit: {
    color: '#60777E',
    fontSize: 15,
    fontWeight: '600',
  },
  readingHint: {
    color: '#60777E',
    fontSize: 11,
    marginTop: 2,
  },
  instructionRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    marginBottom: 12,
  },
  instructionNumber: {
    alignItems: 'center',
    backgroundColor: '#E6F5F5',
    borderRadius: 12,
    height: 24,
    justifyContent: 'center',
    marginRight: 10,
    width: 24,
  },
  instructionNumberText: {
    color: '#087F8C',
    fontSize: 11,
    fontWeight: '800',
  },
  instructionText: {
    color: '#49656D',
    flex: 1,
    fontSize: 13,
    lineHeight: 19,
    paddingTop: 2,
  },
  careTip: {
    backgroundColor: '#FFF7E5',
    borderRadius: 13,
    marginTop: 3,
    padding: 12,
  },
  careTipTitle: {
    color: '#875D12',
    fontSize: 12,
    fontWeight: '800',
  },
  careTipText: {
    color: '#6A5A39',
    fontSize: 12,
    lineHeight: 17,
    marginTop: 4,
  },
  referenceLabel: {
    marginBottom: 8,
    marginTop: 20,
  },
  inputRow: {
    alignItems: 'center',
    backgroundColor: '#F5F8FA',
    borderColor: '#CAD9DE',
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    paddingHorizontal: 13,
  },
  input: {
    color: '#172B33',
    flex: 1,
    fontSize: 17,
    paddingVertical: 13,
  },
  inputUnit: {
    color: '#60777E',
    fontSize: 13,
    fontWeight: '700',
    marginLeft: 8,
  },
  noteText: {
    color: '#60777E',
    fontSize: 11,
    lineHeight: 16,
    marginTop: 8,
  },
  savedCard: {
    backgroundColor: '#E8F5EF',
    borderRadius: 13,
    marginTop: 14,
    padding: 12,
  },
  savedTitle: {
    color: '#176A50',
    fontSize: 12,
    fontWeight: '800',
  },
  savedCopy: {
    color: '#49656D',
    fontSize: 11,
    lineHeight: 17,
    marginTop: 4,
  },
  errorText: {
    color: '#9D3944',
    fontSize: 12,
    lineHeight: 17,
    marginTop: 12,
  },
  successText: {
    color: '#176A50',
    fontSize: 12,
    lineHeight: 17,
    marginTop: 12,
  },
  saveButton: {
    marginTop: 16,
  },
  clearButton: {
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 14,
  },
  clearButtonText: {
    color: '#9D3944',
    fontSize: 13,
    fontWeight: '700',
  },
});

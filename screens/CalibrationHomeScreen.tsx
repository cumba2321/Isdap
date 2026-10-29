import { useEffect, useRef, useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, StatusBar, StyleSheet, Text, TextInput, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Clipboard from 'expo-clipboard';
import FishMascot from '../components/FishMascot';
import { formatValue, metrics } from '../metrics';
import {
  AuthResult,
  CalibrationMethod,
  CalibrationPoint,
  CalibratableMetricKey,
  DeviceSerialLog,
  PondReading,
  SensorCalibrations,
  SensorVoltages,
} from '../types';

type CalibrationOption = {
  method: CalibrationMethod;
  label: string;
  points: { label: string; unit?: string; scaleToMetric?: number }[];
};

const calibrationOptions: Record<CalibratableMetricKey, CalibrationOption[]> = {
  ph: [
    {
      method: 'two-point',
      label: 'Two-point · pH 7 and pH 4 or 10',
      points: [{ label: 'pH 7 buffer' }, { label: 'pH 4 or pH 10 buffer' }],
    },
    {
      method: 'three-point',
      label: 'Three-point · pH 4, 7, and 10',
      points: [{ label: 'pH 4 buffer' }, { label: 'pH 7 buffer' }, { label: 'pH 10 buffer' }],
    },
  ],
  tds: [
    { method: 'one-point', label: 'One-point', points: [{ label: 'TDS standard (max 1000 ppm)' }] },
    {
      method: 'two-point',
      label: 'Two-point · low and high standards',
      points: [{ label: 'Low TDS standard' }, { label: 'High TDS standard' }],
    },
  ],
  ec: [{
    method: 'two-point',
    label: 'Two-point · 1,413 µS/cm and 12.88 mS/cm standards',
    points: [
      { label: 'Low EC standard (1,413 µS/cm)', unit: 'µS/cm', scaleToMetric: 0.001 },
      { label: 'High EC standard (12.88 mS/cm)', unit: 'mS/cm' },
    ],
  }],
  turbidity: [
    { method: 'one-point', label: 'One-point', points: [{ label: 'Turbidity standard' }] },
    {
      method: 'two-point',
      label: 'Two-point · low and high standards',
      points: [{ label: 'Low turbidity standard' }, { label: 'High turbidity standard' }],
    },
  ],
  do: [
    { method: 'do-air', label: 'One-point · air calibration', points: [{ label: 'Air-saturated water' }] },
    {
      method: 'do-air-zero',
      label: 'Two-point · air and zero oxygen',
      points: [{ label: 'Air-saturated water' }, { label: 'Zero-oxygen solution' }],
    },
  ],
};

type CalibrationScreenProps = {
  deviceName: string | null;
  deviceId: string | null;
  firmwareSerialLogs: DeviceSerialLog[];
  onClearSerialMonitor: () => Promise<AuthResult>;
  reading: PondReading;
  rawReading: PondReading;
  voltages: SensorVoltages;
  voltageUpdatedAt: number | null;
  isLive: boolean;
  hasAlert: boolean;
  calibrations: SensorCalibrations;
  onSave: (
    key: CalibratableMetricKey,
    method: CalibrationMethod,
    points: CalibrationPoint[],
  ) => Promise<AuthResult>;
  onClear: (key: CalibratableMetricKey) => Promise<AuthResult>;
  onSaveTemperature: (referenceValue: number, measuredValue: number) => Promise<AuthResult>;
  onClearTemperature: () => Promise<AuthResult>;
};

const calibrationMetrics: CalibratableMetricKey[] = ['ph', 'tds', 'ec', 'turbidity', 'do'];
const maxMonitorLines = 500;

const labels: Record<CalibratableMetricKey, string> = {
  ph: 'pH',
  tds: 'TDS',
  ec: 'EC',
  turbidity: 'Turbidity',
  do: 'Dissolved oxygen',
};

export default function CalibrationScreen({
  deviceName,
  deviceId,
  firmwareSerialLogs,
  onClearSerialMonitor,
  reading,
  rawReading,
  voltages,
  voltageUpdatedAt,
  isLive,
  hasAlert,
  calibrations,
  onSave,
  onClear,
  onSaveTemperature,
  onClearTemperature,
}: CalibrationScreenProps) {
  const insets = useSafeAreaInsets();
  const [selectedIndex, setSelectedIndex] = useState(calibrationMetrics.length);
  const [serialMonitorOpen, setSerialMonitorOpen] = useState(false);
  const [serialMonitorLines, setSerialMonitorLines] = useState<string[]>([]);
  const [serialMonitorNotice, setSerialMonitorNotice] = useState<string | null>(null);
  const [serialMonitorClearing, setSerialMonitorClearing] = useState(false);
  const [voltageSamples, setVoltageSamples] = useState<Partial<Record<CalibratableMetricKey, number[]>>>({});
  const [now, setNow] = useState(Date.now());
  const [calibrationOpen, setCalibrationOpen] = useState(false);
  const [method, setMethod] = useState<CalibrationMethod>(calibrationOptions.ph[0].method);
  const [referenceTexts, setReferenceTexts] = useState<string[]>(calibrationOptions.ph[0].points.map(() => ''));
  const [capturedPoints, setCapturedPoints] = useState<CalibrationPoint[]>([]);
  const [currentPointIndex, setCurrentPointIndex] = useState(0);
  const [calibrationError, setCalibrationError] = useState<string | null>(null);
  const [calibrationNotice, setCalibrationNotice] = useState<string | null>(null);
  const [savingCalibration, setSavingCalibration] = useState(false);
  const [savedInThisSession, setSavedInThisSession] = useState(false);
  const [temperatureReferenceText, setTemperatureReferenceText] = useState('');
  const [temperatureError, setTemperatureError] = useState<string | null>(null);
  const [temperatureNotice, setTemperatureNotice] = useState<string | null>(null);
  const [savingTemperature, setSavingTemperature] = useState(false);
  const lastSampleAt = useRef<number | null>(null);
  const seenSerialLogIds = useRef(new Set<string>());
  const showingTemperature = selectedIndex === calibrationMetrics.length;
  const selectedKey = calibrationMetrics[selectedIndex % calibrationMetrics.length];
  const metric = metrics.find((candidate) => candidate.key === selectedKey)!;
  const displayMetric = showingTemperature
    ? metrics.find((candidate) => candidate.key === 'temp')!
    : metric;
  const displayLabel = showingTemperature ? 'Temperature' : labels[selectedKey];
  const value = isLive ? reading[displayMetric.key] : 0;
  const isOutOfRange = isLive && displayMetric.getSeverity(value) !== null;
  const status = !isLive ? 'Preview' : isOutOfRange ? 'Needs attention' : 'Normal';
  const sensorVoltage = showingTemperature ? undefined : voltages[`${selectedKey}Voltage`];
  const recentVoltageSamples = showingTemperature ? [] : voltageSamples[selectedKey] ?? [];
  const voltageRange = recentVoltageSamples.length === 5
    ? Math.max(...recentVoltageSamples) - Math.min(...recentVoltageSamples)
    : null;
  const voltageIsFresh = voltageUpdatedAt !== null && now - voltageUpdatedAt < 15000;
  const voltageIsStable = sensorVoltage !== undefined &&
    voltageIsFresh &&
    voltageRange !== null &&
    voltageRange <= 0.015;
  const options = calibrationOptions[selectedKey];
  const selectedOption = options.find((option) => option.method === method) ?? options[0];
  const currentPoint = selectedOption.points[currentPointIndex];
  const currentCalibration = calibrations[selectedKey];
  const temperatureCalibration = calibrations.temperature;

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (voltageUpdatedAt === null) {
      lastSampleAt.current = null;
      setVoltageSamples({});
      return;
    }
    if (lastSampleAt.current === voltageUpdatedAt) return;
    const samplesExpired = lastSampleAt.current !== null &&
      voltageUpdatedAt - lastSampleAt.current > 12000;
    lastSampleAt.current = voltageUpdatedAt;
    setVoltageSamples((previous) => {
      const next = samplesExpired ? {} : { ...previous };
      calibrationMetrics.forEach((key) => {
        const sample = voltages[`${key}Voltage`];
        if (sample === undefined || !Number.isFinite(sample)) return;
        next[key] = [...(samplesExpired ? [] : previous[key] ?? []), sample].slice(-5);
      });
      return next;
    });
  }, [voltageUpdatedAt, voltages]);

  useEffect(() => {
    if (!serialMonitorOpen) return;

    const newLines: string[] = [];
    firmwareSerialLogs.forEach((entry) => {
      if (seenSerialLogIds.current.has(entry.id)) return;
      seenSerialLogIds.current.add(entry.id);
      newLines.push(`[${new Date().toLocaleString()}] ${entry.message}`);
    });
    while (seenSerialLogIds.current.size > maxMonitorLines) {
      const oldestId = seenSerialLogIds.current.values().next().value;
      if (oldestId === undefined) break;
      seenSerialLogIds.current.delete(oldestId);
    }
    if (newLines.length > 0) {
      setSerialMonitorLines((previous) => [...previous, ...newLines].slice(-maxMonitorLines));
    }
  }, [firmwareSerialLogs, serialMonitorOpen]);

  const closeSerialMonitor = () => {
    seenSerialLogIds.current = new Set(firmwareSerialLogs.map((entry) => entry.id));
    setSerialMonitorOpen(false);
    setSerialMonitorLines([]);
    setSerialMonitorNotice(null);
  };

  const copySerialMonitor = async () => {
    if (serialMonitorLines.length === 0) {
      setSerialMonitorNotice('No serial output to copy yet.');
      return;
    }
    try {
      await Clipboard.setStringAsync(serialMonitorLines.join('\n'));
      setSerialMonitorNotice('Monitor data copied to the clipboard.');
    } catch {
      Alert.alert('Copy failed', 'Could not copy the monitor data. Please try again.');
    }
  };

  const clearSerialMonitor = () => {
    Alert.alert(
      'Clear serial monitor?',
      'This clears the current session and deletes saved firmware logs from Firebase. The device will keep recording new messages.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: async () => {
            setSerialMonitorClearing(true);
            const result = await onClearSerialMonitor();
            setSerialMonitorClearing(false);
            if (!result.success) {
              Alert.alert('Could not clear serial monitor', result.error);
              return;
            }
            seenSerialLogIds.current = new Set(firmwareSerialLogs.map((entry) => entry.id));
            setSerialMonitorLines([]);
            setSerialMonitorNotice('Saved monitor logs cleared.');
          },
        },
      ],
    );
  };

  const resetCalibration = (key: CalibratableMetricKey) => {
    const option = calibrationOptions[key][0];
    setMethod(option.method);
    setReferenceTexts(option.points.map(() => ''));
    setCapturedPoints([]);
    setCurrentPointIndex(0);
    setCalibrationError(null);
    setCalibrationNotice(null);
    setSavedInThisSession(false);
  };

  const selectMethod = (option: CalibrationOption) => {
    setMethod(option.method);
    setReferenceTexts(option.points.map(() => ''));
    setCapturedPoints([]);
    setCurrentPointIndex(0);
    setCalibrationError(null);
    setCalibrationNotice(null);
    setSavedInThisSession(false);
  };

  const captureCalibrationPoint = async () => {
    const referenceText = referenceTexts[currentPointIndex]?.trim() ?? '';
    const enteredReferenceValue = Number(referenceText.replace(',', '.'));
    const referenceValue = enteredReferenceValue * (currentPoint.scaleToMetric ?? 1);
    const measuredValue = rawReading[selectedKey];
    const zeroReferenceAllowed = selectedOption.points.length === 2 &&
      ((selectedKey === 'do' && method === 'do-air-zero' && currentPointIndex === 1) ||
        ((selectedKey === 'tds' || selectedKey === 'turbidity') &&
          method === 'two-point' && currentPointIndex === 0));

    if (!referenceText || !Number.isFinite(referenceValue)) {
      setCalibrationError('Enter the value printed on your calibration standard.');
      return;
    }
    if (selectedKey === 'ph' && (referenceValue < 0 || referenceValue > 14)) {
      setCalibrationError('pH reference values must be between 0 and 14.');
      return;
    }
    if (selectedKey === 'tds' && (referenceValue < 0 || referenceValue > 1000)) {
      setCalibrationError('TDS references must be between 0 and 1000 ppm.');
      return;
    }
    if (referenceValue < 0 || (referenceValue === 0 && !zeroReferenceAllowed)) {
      setCalibrationError('This calibration point needs a reference value greater than zero.');
      return;
    }
    if (selectedKey === 'do' && method === 'do-air-zero' &&
      currentPointIndex === 1 && referenceValue !== 0) {
      setCalibrationError('The zero-oxygen point must use a 0 mg/L reference.');
      return;
    }
    if (!isLive || !deviceId) {
      setCalibrationError('Connect a pond with a live sensor before calibrating.');
      return;
    }
    if (!voltageIsStable || sensorVoltage === undefined) {
      setCalibrationError(voltageIsFresh
        ? 'Wait until the voltage is stable before capturing this point.'
        : 'The sensor voltage is unavailable or stale. Check the connection and wait for live voltage updates.');
      return;
    }
    if (!Number.isFinite(measuredValue) || measuredValue < 0 ||
      (measuredValue === 0 && !(referenceValue === 0 && zeroReferenceAllowed))) {
      setCalibrationError('This live reading cannot be used for calibration. Check the probe and try again.');
      return;
    }

    const nextPoints = [...capturedPoints, { referenceValue, measuredValue, voltage: sensorVoltage }];
    if (nextPoints.length < selectedOption.points.length) {
      setCapturedPoints(nextPoints);
      setCurrentPointIndex(nextPoints.length);
      setCalibrationError(null);
      setCalibrationNotice(
        `Point ${nextPoints.length} captured. Rinse the probe and prepare ${selectedOption.points[nextPoints.length].label.toLowerCase()}.`,
      );
      return;
    }
    if (nextPoints.length === selectedOption.points.length &&
      nextPoints.some((point, index) => nextPoints.slice(index + 1).some((otherPoint) =>
        Math.abs(point.referenceValue - otherPoint.referenceValue) < 0.000001 ||
        Math.abs(point.measuredValue - otherPoint.measuredValue) < 0.000001))) {
      setCalibrationError(`${selectedOption.points.length}-point calibration needs distinct reference and sensor readings. Check the standards and try again.`);
      return;
    }

    setSavingCalibration(true);
    setCalibrationError(null);
    setCalibrationNotice(null);
    try {
      const result = await onSave(selectedKey, method, nextPoints);
      if (!result.success) {
        setCalibrationError(result.error);
        return;
      }
      setCapturedPoints(nextPoints);
      setSavedInThisSession(true);
      setCalibrationNotice(`${labels[selectedKey]} calibration saved for ${deviceName ?? 'this pond'}.`);
    } catch {
      setCalibrationError('Could not save the calibration. Check your connection and try again.');
    } finally {
      setSavingCalibration(false);
    }
  };

  const clearCalibration = () => {
    Alert.alert(
      'Remove this app adjustment?',
      'This removes only the IsdaApp calibration for this pond. Existing firmware calibration is unchanged.',
      [
        { text: 'Keep calibration', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            const result = await onClear(selectedKey);
            if (!result.success) {
              setCalibrationError(result.error);
              return;
            }
            resetCalibration(selectedKey);
            setCalibrationNotice('App calibration removed. Firmware calibration is unchanged.');
          },
        },
      ],
    );
  };

  const saveTemperatureCalibration = async () => {
    const referenceText = temperatureReferenceText.trim();
    const referenceValue = Number(referenceText.replace(',', '.'));
    const measuredValue = rawReading.temp;
    if (!referenceText || !Number.isFinite(referenceValue) || referenceValue < -55 || referenceValue > 125) {
      setTemperatureError('Enter a thermometer reading between -55 and 125 °C.');
      return;
    }
    if (!isLive || !deviceId) {
      setTemperatureError('Connect a pond with a live temperature reading before calibrating.');
      return;
    }
    if (!Number.isFinite(measuredValue) || measuredValue < -55 || measuredValue > 125) {
      setTemperatureError('The live temperature reading is invalid. Check the probe and try again.');
      return;
    }

    setSavingTemperature(true);
    setTemperatureError(null);
    setTemperatureNotice(null);
    try {
      const result = await onSaveTemperature(referenceValue, measuredValue);
      if (!result.success) {
        setTemperatureError(result.error);
        return;
      }
      const offset = referenceValue - measuredValue;
      setTemperatureNotice(
        `Temperature calibration saved. App correction: ${offset >= 0 ? '+' : ''}${offset.toFixed(2)} °C.`,
      );
    } catch {
      setTemperatureError('Could not save the temperature calibration. Check your connection and try again.');
    } finally {
      setSavingTemperature(false);
    }
  };

  const clearTemperatureCalibration = () => {
    Alert.alert(
      'Remove temperature calibration?',
      'This removes the IsdaApp temperature correction for this pond. The firmware calibration is unchanged.',
      [
        { text: 'Keep calibration', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            const result = await onClearTemperature();
            if (!result.success) {
              setTemperatureError(result.error);
              return;
            }
            setTemperatureReferenceText('');
            setTemperatureError(null);
            setTemperatureNotice('Temperature correction removed. Firmware calibration is unchanged.');
          },
        },
      ],
    );
  };

  const methodInstructions = selectedKey === 'ph'
    ? method === 'three-point'
      ? 'Use pH 4, pH 7, and pH 10 buffers in order. Enter each buffer’s value for its stated temperature and rinse the probe between buffers.'
      : 'Use pH 7 first, then pH 4 or pH 10. Enter each buffer’s value for its stated temperature and rinse the probe between buffers.'
    : selectedKey === 'ec'
      ? 'Use the value for each standard at its current temperature, if specified by its manufacturer. Rinse the probe between standards.'
      : selectedKey === 'do'
        ? method === 'do-air-zero'
          ? 'For the air point, enter the value corrected for current water temperature, salinity, and altitude. Then rinse and capture the zero-oxygen solution.'
          : 'Prepare air-saturated water and enter its temperature-, salinity-, and altitude-corrected value.'
        : method === 'two-point'
          ? 'Use distinct low and high certified standards. Rinse the probe between standards.'
          : 'Use a fresh certified standard and enter the exact value from its label.';

  return (
    <View style={screenStyles.root}>
      <ScrollView contentContainerStyle={screenStyles.content}>
        <View style={screenStyles.deviceHeader}>
          <View style={screenStyles.deviceTitle}>
            <Text numberOfLines={1} style={screenStyles.deviceName}>{deviceName ?? 'Home Test 1'}</Text>
            <View style={[screenStyles.statusBadge, isLive ? screenStyles.liveBadge : screenStyles.previewBadge]}>
              <View style={[screenStyles.statusDot, isLive ? screenStyles.liveDot : screenStyles.previewDot]} />
              <Text style={screenStyles.deviceStatus}>{!isLive ? 'PREVIEW' : hasAlert ? 'NEEDS REVIEW' : 'LIVE'}</Text>
            </View>
          </View>
        </View>

        <Text style={screenStyles.eyebrow}>SENSOR TOOLS</Text>
        <View style={screenStyles.calibrationTitleRow}>
          <Text style={screenStyles.pageTitle}>Calibration</Text>
          {!serialMonitorOpen ? (
            <View style={screenStyles.monitorLaunchRow}>
              <Pressable
                onPress={() => {
                  seenSerialLogIds.current = new Set();
                  setSerialMonitorLines([]);
                  setSerialMonitorNotice(null);
                  setSerialMonitorOpen(true);
                }}
                style={({ pressed }) => [screenStyles.monitorIconButton, pressed && screenStyles.pressed]}
                accessibilityRole="button"
                accessibilityLabel="Open Serial Monitor"
              >
                <Svg width={27} height={27} viewBox="0 0 64 64" accessibilityElementsHidden>
                  <Path
                    d="M27 8.5A24 24 0 0 0 8.5 27M37 8.5A24 24 0 0 1 55.5 27M55.5 37A24 24 0 0 1 37 55.5M27 55.5A24 24 0 0 1 8.5 37"
                    fill="none"
                    stroke="#FFFFFF"
                    strokeLinecap="round"
                    strokeWidth="4"
                  />
                  <Path d="M32 5v9M5 32h9M50 32h9M32 50v9" stroke="#FFFFFF" strokeLinecap="round" strokeWidth="4" />
                  <Circle cx="30" cy="29" r="11" fill="none" stroke="#FFFFFF" strokeWidth="4" />
                  <Path d="m38 37 13 13" stroke="#FFFFFF" strokeLinecap="round" strokeWidth="5" />
                </Svg>
              </Pressable>
              <Pressable
                onPress={() => Alert.alert(
                  'About Serial Monitor',
                  'The Serial Monitor shows recent messages sent by the device firmware, including sensor readings and connection or upload status. Use it to help check what the device is reporting. It is not a live USB serial connection; the device must be online to upload its messages.',
                  [{ text: 'Got it' }],
                )}
                style={({ pressed }) => [screenStyles.monitorHelpButton, pressed && screenStyles.pressed]}
                accessibilityRole="button"
                accessibilityLabel="What is the Serial Monitor?"
                accessibilityHint="Shows an explanation of the Serial Monitor"
              >
                <Text style={screenStyles.monitorHelpText}>?</Text>
              </Pressable>
            </View>
          ) : null}
        </View>
        <Text style={screenStyles.intro}>Choose a sensor, check its live reading, then calibrate against a trusted reference.</Text>
        <Modal
          animationType="slide"
          onRequestClose={closeSerialMonitor}
          presentationStyle="fullScreen"
          navigationBarTranslucent={false}
          statusBarTranslucent
          visible={serialMonitorOpen}
        >
          <View style={[screenStyles.monitorScreen, { paddingBottom: Math.max(insets.bottom, 24) + 16 }]}>
            <StatusBar barStyle="light-content" backgroundColor="#102127" />
            <View style={screenStyles.monitorHeader}>
              <View style={screenStyles.monitorTitleGroup}>
                <View style={[screenStyles.monitorDot, isLive && screenStyles.monitorDotLive]} />
                <Text style={screenStyles.monitorTitle}>Serial Monitor</Text>
              </View>
              <Pressable
                onPress={closeSerialMonitor}
                style={({ pressed }) => [screenStyles.monitorClose, pressed && screenStyles.pressed]}
                accessibilityRole="button"
                accessibilityLabel="Close serial monitor and clear its data"
              >
                <Text style={screenStyles.monitorCloseText}>CLOSE</Text>
              </Pressable>
            </View>
            <Text style={screenStyles.monitorDescription}>
              Firmware messages and sensor readings. Closing the monitor clears this session’s data.
            </Text>
            <ScrollView
              style={screenStyles.monitorLog}
              contentContainerStyle={screenStyles.monitorLogContent}
              nestedScrollEnabled
            >
              {serialMonitorLines.length === 0 ? (
                <Text style={screenStyles.monitorEmpty}>
                  Waiting for firmware serial output…
                </Text>
              ) : serialMonitorLines.map((line, index) => (
                <Text key={`${index}-${line}`} selectable style={screenStyles.monitorLine}>{line}</Text>
              ))}
            </ScrollView>
            <View style={screenStyles.monitorActions}>
              <Pressable
                onPress={copySerialMonitor}
                style={({ pressed }) => [
                  screenStyles.monitorAction,
                  pressed && screenStyles.pressed,
                ]}
                accessibilityRole="button"
              >
                <Text style={screenStyles.monitorActionText}>COPY</Text>
              </Pressable>
              <Pressable
                onPress={clearSerialMonitor}
                disabled={serialMonitorClearing}
                style={({ pressed }) => [
                  screenStyles.monitorAction,
                  serialMonitorClearing && screenStyles.monitorActionDisabled,
                  pressed && screenStyles.pressed,
                ]}
                accessibilityRole="button"
              >
                <Text style={screenStyles.monitorActionText}>{serialMonitorClearing ? 'CLEARING…' : 'CLEAR'}</Text>
              </Pressable>
            </View>
            {serialMonitorNotice ? (
              <Text style={screenStyles.monitorNotice}>{serialMonitorNotice}</Text>
            ) : null}
          </View>
        </Modal>
        <Text style={screenStyles.sectionTitle}>Current reading</Text>
        <Pressable
          onPress={() => {
            const nextIndex = (selectedIndex + 1) % (calibrationMetrics.length + 1);
            setSelectedIndex(nextIndex);
            setCalibrationOpen(false);
            if (nextIndex < calibrationMetrics.length) {
              resetCalibration(calibrationMetrics[nextIndex]);
            }
          }}
          style={[screenStyles.readingCircle, isOutOfRange && screenStyles.readingCircleAlert]}
          accessibilityRole="button"
          accessibilityLabel={`${displayLabel} ${formatValue(value, displayMetric.key)} ${displayMetric.unit}.${showingTemperature ? '' : ` Water temperature ${isLive ? `${formatValue(reading.temp, 'temp')} degrees Celsius` : 'unavailable'}. Sensor voltage ${sensorVoltage === undefined ? 'unavailable' : `${sensorVoltage.toFixed(3)} volts`}, ${voltageIsStable ? 'stable' : 'not stable'}.`} Tap for next sensor.`}
        >
          <Text
            adjustsFontSizeToFit
            minimumFontScale={0.75}
            numberOfLines={2}
            style={screenStyles.metricName}
          >
            {displayLabel}
          </Text>
          <Text style={[screenStyles.readingStatus, isOutOfRange && screenStyles.alertText]}>{status}</Text>
          <Text style={screenStyles.readingValue}>{formatValue(value, displayMetric.key)}</Text>
          <Text style={screenStyles.readingUnit}>{displayMetric.unit}</Text>
          {!showingTemperature ? (
            <>
              <View style={screenStyles.temperatureBadge}>
                <Text style={screenStyles.temperatureLabel}>WATER TEMP</Text>
                <Text style={screenStyles.temperatureValue}>
                  {isLive ? `${formatValue(reading.temp, 'temp')} °C` : '—'}
                </Text>
              </View>
            </>
          ) : null}
        </Pressable>
        {!showingTemperature ? (
          <View style={screenStyles.readingVoltageCard}>
            <Text style={screenStyles.voltageValue}>
              Voltage {sensorVoltage === undefined ? '—' : `${sensorVoltage.toFixed(3)} V`}
            </Text>
            <Text style={[
              screenStyles.voltageHint,
              voltageIsStable && screenStyles.voltageHintStable,
              voltageUpdatedAt !== null && !voltageIsFresh && screenStyles.voltageHintStale,
            ]}>
              {sensorVoltage === undefined
                ? 'Voltage unavailable'
                : !voltageIsFresh
                  ? 'Voltage is stale'
                  : voltageIsStable
                    ? `STABLE · range ${voltageRange?.toFixed(3)} V (limit 0.015 V)`
                    : `STABILIZING · ${recentVoltageSamples.length}/5 samples${voltageRange === null ? '' : ` · range ${voltageRange.toFixed(3)} V`}`}
            </Text>
          </View>
        ) : null}
        <Text style={screenStyles.sensorHint}>
          Tap the circle to view the next {showingTemperature ? 'sensor' : 'sensor, including temperature'}
        </Text>

        {showingTemperature ? (
        <View style={screenStyles.calibrationCard}>
          <View style={screenStyles.calibrationHeader}>
            <View style={screenStyles.calibrationHeading}>
              <Text style={screenStyles.calibrationEyebrow}>ONE-POINT OFFSET</Text>
              <Text style={screenStyles.calibrationTitle}>Temperature</Text>
            </View>
            <View style={screenStyles.liveReadingBadge}>
              <Text style={screenStyles.liveReadingCaption}>PROBE READING</Text>
              <Text style={screenStyles.liveReadingValue}>
                {isLive ? `${formatValue(rawReading.temp, 'temp')} °C` : '—'}
              </Text>
            </View>
          </View>
          <Text style={screenStyles.calibrationCopy}>
            Place a trusted thermometer beside the probe in the same water. Wait for both readings to settle, then enter the thermometer value.
          </Text>
          {temperatureCalibration ? (
            <View style={screenStyles.savedCalibrationRow}>
              <Text style={screenStyles.savedCalibration}>
                Saved correction {temperatureCalibration.offset >= 0 ? '+' : ''}{temperatureCalibration.offset.toFixed(2)} °C · {new Date(temperatureCalibration.calibratedAt).toLocaleDateString()}
              </Text>
              <Pressable
                onPress={clearTemperatureCalibration}
                accessibilityRole="button"
                style={({ pressed }) => [screenStyles.removeButton, pressed && screenStyles.pressed]}
              >
                <Text style={screenStyles.removeButtonText}>Remove</Text>
              </Pressable>
            </View>
          ) : null}
          <Text style={screenStyles.inputLabel}>TRUSTED THERMOMETER VALUE</Text>
          <View style={screenStyles.inputRow}>
            <TextInput
              value={temperatureReferenceText}
              onChangeText={(text) => {
                setTemperatureReferenceText(text);
                setTemperatureError(null);
                setTemperatureNotice(null);
              }}
              placeholder="Enter reference temperature"
              placeholderTextColor="#8A9BA0"
              keyboardType="decimal-pad"
              style={screenStyles.input}
              accessibilityLabel="Trusted thermometer temperature in degrees Celsius"
            />
            <View style={screenStyles.inputUnitBadge}>
              <Text style={screenStyles.inputUnit}>°C</Text>
            </View>
          </View>
          {temperatureError ? (
            <Text style={screenStyles.errorText} accessibilityRole="alert">{temperatureError}</Text>
          ) : null}
          {temperatureNotice ? (
            <Text style={screenStyles.noticeText} accessibilityRole="alert">{temperatureNotice}</Text>
          ) : null}
          <Pressable
            onPress={saveTemperatureCalibration}
            disabled={savingTemperature || !isLive || !deviceId}
            style={({ pressed }) => [
              screenStyles.captureButton,
              (!isLive || !deviceId || savingTemperature) && screenStyles.captureButtonDisabled,
              pressed && screenStyles.pressed,
            ]}
            accessibilityRole="button"
          >
            <Text style={screenStyles.actionText}>
              {savingTemperature ? 'SAVING CALIBRATION…' : 'SAVE TEMPERATURE CALIBRATION'}
            </Text>
          </Pressable>
          {!isLive || !deviceId ? (
            <Text style={screenStyles.captureHint}>A live connected temperature sensor is required.</Text>
          ) : null}
        </View>
        ) : null}

        {!showingTemperature ? (
        <>
        <Pressable
          onPress={() => {
            setCalibrationOpen((open) => !open);
            setCalibrationError(null);
            setCalibrationNotice(null);
          }}
          style={({ pressed }) => [screenStyles.actionButton, pressed && screenStyles.pressed]}
          accessibilityRole="button"
        >
          <Text style={screenStyles.actionText}>
            {calibrationOpen ? 'CLOSE CALIBRATION' : `CALIBRATE ${labels[selectedKey].toUpperCase()}`}
          </Text>
        </Pressable>
        {!calibrationOpen ? (
          <View style={screenStyles.helperCard}>
            <FishMascot
              style={screenStyles.helperMascot}
              accessibilityLabel="Fish mascot offering calibration guidance"
            />
            <Text style={screenStyles.helperText}>
              Need a hand? Follow each step and use a trusted reference when calibrating.
            </Text>
          </View>
        ) : (
          <View style={screenStyles.calibrationCard}>
            <View style={screenStyles.calibrationHeader}>
              <View style={screenStyles.calibrationHeading}>
                <Text style={screenStyles.calibrationEyebrow}>CALIBRATION SETUP</Text>
                <Text style={screenStyles.calibrationTitle}>{labels[selectedKey]}</Text>
              </View>
              <View style={screenStyles.liveReadingBadge}>
                <Text style={screenStyles.liveReadingCaption}>LIVE READING</Text>
                <Text style={screenStyles.liveReadingValue}>
                  {formatValue(rawReading[selectedKey], selectedKey)} {metric.unit}
                </Text>
              </View>
            </View>
            {currentCalibration ? (
              <View style={screenStyles.savedCalibrationRow}>
                <Text style={screenStyles.savedCalibration}>
                  Existing {currentCalibration.method ?? 'one-point'} calibration · {new Date(currentCalibration.calibratedAt).toLocaleDateString()}
                </Text>
                <Pressable
                  onPress={clearCalibration}
                  accessibilityRole="button"
                  style={({ pressed }) => [screenStyles.removeButton, pressed && screenStyles.pressed]}
                >
                  <Text style={screenStyles.removeButtonText}>Remove</Text>
                </Pressable>
              </View>
            ) : null}
            {options.length > 1 ? (
              <View style={screenStyles.methodList}>
                {options.map((option) => (
                  <Pressable
                    key={option.method}
                    onPress={() => selectMethod(option)}
                    style={[screenStyles.methodOption, method === option.method && screenStyles.methodOptionSelected]}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: method === option.method }}
                  >
                    <Text style={[screenStyles.methodText, method === option.method && screenStyles.methodTextSelected]}>
                      {option.label}
                    </Text>
                    <View style={[
                      screenStyles.methodCheck,
                      method === option.method && screenStyles.methodCheckSelected,
                    ]}>
                      {method === option.method ? <Text style={screenStyles.methodCheckText}>✓</Text> : null}
                    </View>
                  </Pressable>
                ))}
              </View>
            ) : (
              <View style={screenStyles.methodSummary}>
                <Text style={screenStyles.methodSummaryLabel}>SELECTED METHOD</Text>
                <Text style={screenStyles.methodSummaryText}>{selectedOption.label}</Text>
              </View>
            )}
            <View style={screenStyles.progressTrack} accessibilityRole="progressbar"
              accessibilityValue={{ min: 0, max: selectedOption.points.length, now: savedInThisSession ? selectedOption.points.length : currentPointIndex }}>
              {selectedOption.points.map((point, index) => {
                const isComplete = savedInThisSession || index < currentPointIndex;
                const isCurrent = !savedInThisSession && index === currentPointIndex;
                return (
                  <View key={`progress-${index}`} style={screenStyles.progressItem}>
                    <View style={[
                      screenStyles.progressMarker,
                      isComplete && screenStyles.progressMarkerComplete,
                      isCurrent && screenStyles.progressMarkerCurrent,
                    ]}>
                      <Text style={[
                        screenStyles.progressMarkerText,
                        (isComplete || isCurrent) && screenStyles.progressMarkerTextActive,
                      ]}>{isComplete ? '✓' : index + 1}</Text>
                    </View>
                    <Text style={[
                      screenStyles.progressLabel,
                      isCurrent && screenStyles.progressLabelCurrent,
                    ]}>{point.label.replace(/\s*\([^)]*\)/g, '')}</Text>
                  </View>
                );
              })}
            </View>
            <Text style={screenStyles.pointLabel}>
              {savedInThisSession ? 'Calibration complete' : `Step ${currentPointIndex + 1} of ${selectedOption.points.length}`}
            </Text>
            <Text style={screenStyles.currentPointTitle}>{currentPoint.label}</Text>
            <Text style={screenStyles.calibrationCopy}>{methodInstructions}</Text>
            {selectedKey === 'ph' ? (
              <Text style={screenStyles.calibrationCopy}>
                This correction is saved in the app and adjusts live pH readings there. It does not change the firmware pH formula.
              </Text>
            ) : null}
            {!savedInThisSession ? (
              <>
                <Text style={screenStyles.inputLabel}>STANDARD VALUE</Text>
                <View style={screenStyles.inputRow}>
                  <TextInput
                    value={referenceTexts[currentPointIndex] ?? ''}
                    onChangeText={(text) => {
                      setReferenceTexts((previous) => previous.map((item, index) =>
                        index === currentPointIndex ? text : item));
                      setCalibrationError(null);
                      setCalibrationNotice(null);
                    }}
                    placeholder={selectedKey === 'do' && currentPoint.label === 'Air-saturated water'
                      ? 'Enter temp-corrected value'
                      : 'Enter value from standard'}
                    placeholderTextColor="#8A9BA0"
                    keyboardType="decimal-pad"
                    style={screenStyles.input}
                    accessibilityLabel={`${labels[selectedKey]} ${currentPoint.label} reference in ${currentPoint.unit ?? metric.unit}`}
                  />
                  <View style={screenStyles.inputUnitBadge}>
                    <Text style={screenStyles.inputUnit}>{currentPoint.unit ?? metric.unit}</Text>
                  </View>
                </View>
              </>
            ) : null}
            <View style={[
              screenStyles.voltageStatusCard,
              voltageIsStable && screenStyles.voltageStatusStable,
              !voltageIsFresh && screenStyles.voltageStatusWaiting,
            ]}>
              <View style={[
                screenStyles.voltageStatusDot,
                voltageIsStable && screenStyles.voltageStatusDotStable,
                !voltageIsFresh && screenStyles.voltageStatusDotWaiting,
              ]} />
              <View style={screenStyles.voltageStatusBody}>
                <Text style={[
                  screenStyles.voltageStatusTitle,
                  voltageIsStable && screenStyles.voltageStatusTitleStable,
                ]}>
                  {voltageIsStable ? 'Voltage is stable' : voltageIsFresh ? 'Stabilizing sensor' : 'Waiting for live voltage'}
                </Text>
                <Text style={screenStyles.voltageStatusCopy}>
                  {!voltageIsFresh
                    ? 'Connect the sensor and wait for fresh voltage samples.'
                    : voltageIsStable
                      ? `Ready to capture at ${sensorVoltage?.toFixed(3)} V.`
                      : `Keep the probe still · ${recentVoltageSamples.length}/5 samples${voltageRange === null ? '' : ` · range ${voltageRange.toFixed(3)} V`}.`}
                </Text>
              </View>
            </View>
            {capturedPoints.map((point, index) => (
              <View key={`${selectedKey}-point-${index}`} style={screenStyles.capturedPoint}>
                <Text style={screenStyles.capturedPointCheck}>✓</Text>
                <View style={screenStyles.capturedPointBody}>
                  <Text style={screenStyles.capturedPointTitle}>Point {index + 1} captured</Text>
                  <Text style={screenStyles.capturedPointCopy}>
                    Reference {point.referenceValue / (selectedOption.points[index].scaleToMetric ?? 1)} {selectedOption.points[index].unit ?? metric.unit}
                    {'  ·  '}Reading {formatValue(point.measuredValue, selectedKey)} {metric.unit}
                    {'  ·  '}{point.voltage.toFixed(3)} V
                  </Text>
                </View>
              </View>
            ))}
            {calibrationError ? (
              <Text style={screenStyles.errorText} accessibilityRole="alert">{calibrationError}</Text>
            ) : null}
            {calibrationNotice ? (
              <Text style={screenStyles.noticeText} accessibilityRole="alert">{calibrationNotice}</Text>
            ) : null}
            <Pressable
              onPress={captureCalibrationPoint}
              disabled={savingCalibration || savedInThisSession || !isLive || !deviceId || !voltageIsStable}
              style={({ pressed }) => [
                screenStyles.captureButton,
                (!isLive || !deviceId || !voltageIsStable || savingCalibration || savedInThisSession) && screenStyles.captureButtonDisabled,
                pressed && screenStyles.pressed,
              ]}
              accessibilityRole="button"
            >
              <Text style={screenStyles.actionText}>
                {savingCalibration
                  ? 'SAVING CALIBRATION…'
                  : savedInThisSession
                    ? 'CALIBRATION SAVED ✓'
                    : currentPointIndex < selectedOption.points.length - 1
                      ? `CAPTURE POINT ${currentPointIndex + 1}`
                      : 'CAPTURE POINT & SAVE'}
              </Text>
            </Pressable>
            {!savedInThisSession ? (
              <Text style={screenStyles.captureHint}>
                {!isLive || !deviceId
                  ? 'A live connected sensor is required.'
                  : !voltageIsStable
                    ? 'Capture becomes available when the voltage is stable.'
                    : currentPointIndex < selectedOption.points.length - 1
                      ? 'The next standard will be requested after this point.'
                      : 'Your correction is saved after this final point.'}
              </Text>
            ) : null}
          </View>
        )}
        </>
        ) : null}
      </ScrollView>
    </View>
  );
}

const screenStyles = StyleSheet.create({
  root: { backgroundColor: '#F5F8FA', flex: 1 },
  deviceHeader: {
    alignSelf: 'stretch',
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  deviceTitle: { alignItems: 'flex-start', flex: 1 },
  deviceName: { color: '#172B33', fontSize: 23, fontWeight: '800' },
  statusBadge: { alignItems: 'center', borderRadius: 20, flexDirection: 'row', gap: 7, marginTop: 7, paddingHorizontal: 12, paddingVertical: 8 },
  liveBadge: { backgroundColor: '#DDE7EB' },
  previewBadge: { backgroundColor: '#DDE7EB' },
  statusDot: { borderRadius: 5, height: 9, width: 9 },
  liveDot: { backgroundColor: '#078A95' },
  previewDot: { backgroundColor: '#A87500' },
  deviceStatus: { color: '#334B53', fontSize: 11, fontWeight: '800', letterSpacing: 1 },
  content: {
    alignItems: 'center',
    flexGrow: 1,
    paddingBottom: 24,
    paddingHorizontal: 22,
    paddingTop: (StatusBar.currentHeight ?? 0) + 14,
  },
  eyebrow: { alignSelf: 'stretch', color: '#60777E', fontSize: 11, fontWeight: '700', letterSpacing: 1.5, marginTop: 10 },
  calibrationTitleRow: {
    alignItems: 'center',
    alignSelf: 'stretch',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 5,
  },
  pageTitle: { color: '#172B33', flex: 1, fontSize: 32, fontWeight: '800' },
  intro: { alignSelf: 'stretch', color: '#60777E', fontSize: 14, lineHeight: 21, marginTop: 8 },
  monitorLaunchRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    marginLeft: 8,
  },
  monitorIconButton: {
    alignItems: 'center',
    backgroundColor: '#173C45',
    borderRadius: 12,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  monitorHelpButton: {
    alignItems: 'center',
    backgroundColor: '#E8F1F2',
    borderColor: '#C8D8DB',
    borderRadius: 18,
    borderWidth: 1,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  monitorHelpText: { color: '#173C45', fontSize: 21, fontWeight: '800', lineHeight: 25 },
  monitorScreen: {
    backgroundColor: '#102127',
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: (StatusBar.currentHeight ?? 0) + 16,
  },
  monitorHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  monitorTitleGroup: { alignItems: 'center', flexDirection: 'row', gap: 8 },
  monitorDot: { backgroundColor: '#D69A3A', borderRadius: 5, height: 9, width: 9 },
  monitorDotLive: { backgroundColor: '#47D18C' },
  monitorTitle: { color: '#E8F1F2', fontSize: 16, fontWeight: '800' },
  monitorClose: { paddingHorizontal: 8, paddingVertical: 5 },
  monitorCloseText: { color: '#9FB4B9', fontSize: 10, fontWeight: '900', letterSpacing: 0.8 },
  monitorDescription: { color: '#B5C7CA', fontSize: 10, lineHeight: 15, marginTop: 6 },
  monitorLog: {
    backgroundColor: '#071216',
    borderColor: '#2C4147',
    borderRadius: 10,
    borderWidth: 1,
    flex: 1,
    marginBottom: 10,
    marginTop: 16,
    minHeight: 76,
  },
  monitorLogContent: { padding: 9 },
  monitorEmpty: { color: '#8FA5AA', fontFamily: 'monospace', fontSize: 10, lineHeight: 16 },
  monitorLine: { color: '#8EE5B3', fontFamily: 'monospace', fontSize: 9, lineHeight: 15, marginBottom: 4 },
  monitorActions: { flexDirection: 'row', gap: 9, marginTop: 9 },
  monitorAction: {
    alignItems: 'center',
    backgroundColor: '#244149',
    borderRadius: 9,
    flex: 1,
    justifyContent: 'center',
    minHeight: 36,
  },
  monitorActionDisabled: { opacity: 0.5 },
  monitorActionText: { color: '#E8F1F2', fontSize: 10, fontWeight: '900', letterSpacing: 0.8 },
  monitorNotice: { color: '#8EE5B3', fontSize: 10, marginTop: 8 },
  sectionTitle: { alignSelf: 'stretch', color: '#172B33', fontSize: 19, fontWeight: '800', marginBottom: 12, marginTop: 18 },
  readingCircle: {
    alignItems: 'center',
    aspectRatio: 1,
    backgroundColor: '#FFFFFF',
    borderColor: '#078A95',
    borderRadius: 999,
    borderWidth: 6,
    elevation: 3,
    justifyContent: 'flex-start',
    maxHeight: 400,
    maxWidth: 400,
    paddingBottom: 20,
    paddingHorizontal: 8,
    paddingTop: 12,
    shadowColor: '#102F36',
    shadowOffset: { height: 5, width: 0 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    width: '96%',
  },
  readingCircleAlert: { borderColor: '#C84F5B' },
  metricName: {
    color: '#172B33',
    flexShrink: 1,
    fontSize: 22,
    fontWeight: '700',
    lineHeight: 26,
    marginTop: 2,
    textAlign: 'center',
    width: '100%',
  },
  readingStatus: { color: '#60777E', fontSize: 14, fontWeight: '500', marginTop: 1 },
  alertText: { color: '#9D3944' },
  readingValue: { color: '#153D46', fontSize: 56, fontWeight: '700', marginTop: 2 },
  readingUnit: { color: '#60777E', fontSize: 17, fontWeight: '500', marginTop: 0 },
  temperatureBadge: {
    alignItems: 'center',
    backgroundColor: '#EAF5F5',
    borderRadius: 12,
    flexDirection: 'row',
    gap: 7,
    marginTop: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  temperatureLabel: { color: '#60777E', fontSize: 9, fontWeight: '800', letterSpacing: 0.5 },
  temperatureValue: { color: '#153D46', fontSize: 14, fontWeight: '800' },
  readingVoltageCard: {
    alignItems: 'center',
    alignSelf: 'stretch',
    backgroundColor: '#FFFFFF',
    borderColor: '#DCE8E8',
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  voltageValue: { color: '#49656D', fontSize: 14, fontWeight: '700' },
  voltageHint: { color: '#A87500', fontSize: 9, fontWeight: '900', letterSpacing: 0.2, marginTop: 3 },
  voltageHintStable: { color: '#14734E' },
  voltageHintStale: { color: '#9D3944' },
  sensorHint: { color: '#60777E', fontSize: 12, marginBottom: 13, marginTop: 9 },
  actionButton: {
    alignItems: 'center',
    backgroundColor: '#173C45',
    borderRadius: 15,
    elevation: 3,
    justifyContent: 'center',
    minHeight: 54,
    shadowColor: '#102F36',
    shadowOffset: { height: 4, width: 0 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    width: '100%',
  },
  actionText: { color: '#FFFFFF', fontSize: 17, fontWeight: '800', letterSpacing: 0.8, textAlign: 'center' },
  helperCard: {
    alignItems: 'center',
    alignSelf: 'stretch',
    backgroundColor: '#FFFFFF',
    borderColor: '#E1E9EC',
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 8,
    marginTop: 11,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  helperMascot: { height: 58, width: 68 },
  helperText: { color: '#60777E', flex: 1, fontSize: 11, lineHeight: 16 },
  calibrationCard: {
    alignSelf: 'stretch',
    backgroundColor: '#FFFFFF',
    borderColor: '#E1E9EC',
    borderRadius: 22,
    borderWidth: 1,
    elevation: 2,
    marginTop: 14,
    padding: 18,
    shadowColor: '#102F36',
    shadowOffset: { height: 4, width: 0 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
  },
  calibrationHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  calibrationHeading: { flex: 1, paddingRight: 8 },
  calibrationEyebrow: { color: '#078A95', fontSize: 9, fontWeight: '900', letterSpacing: 1.2 },
  calibrationTitle: { color: '#172B33', fontSize: 23, fontWeight: '800', marginTop: 3 },
  liveReadingBadge: {
    alignItems: 'flex-end',
    backgroundColor: '#F1F6F7',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  liveReadingCaption: { color: '#71858B', fontSize: 8, fontWeight: '800', letterSpacing: 0.6 },
  liveReadingValue: { color: '#153D46', fontSize: 13, fontWeight: '800', marginTop: 3 },
  calibrationCopy: { color: '#60777E', fontSize: 12, lineHeight: 17, marginTop: 5 },
  savedCalibrationRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
  savedCalibration: { color: '#176A50', flex: 1, fontSize: 11, fontWeight: '700' },
  removeButton: { paddingHorizontal: 8, paddingVertical: 5 },
  removeButtonText: { color: '#A83E49', fontSize: 11, fontWeight: '800' },
  methodList: { gap: 7, marginTop: 12 },
  methodOption: {
    alignItems: 'center',
    backgroundColor: '#F5F8FA',
    borderColor: '#DDE7EB',
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 11,
    paddingVertical: 11,
  },
  methodOptionSelected: { backgroundColor: '#EFF8F3', borderColor: '#078A95' },
  methodText: { color: '#49656D', flex: 1, fontSize: 12, fontWeight: '700', lineHeight: 17 },
  methodTextSelected: { color: '#153D46' },
  methodCheck: { alignItems: 'center', borderColor: '#C9D8DC', borderRadius: 10, borderWidth: 1, height: 20, justifyContent: 'center', width: 20 },
  methodCheckSelected: { backgroundColor: '#078A95', borderColor: '#078A95' },
  methodCheckText: { color: '#FFFFFF', fontSize: 12, fontWeight: '900' },
  methodSummary: { backgroundColor: '#F5F8FA', borderRadius: 12, marginTop: 11, padding: 11 },
  methodSummaryLabel: { color: '#71858B', fontSize: 8, fontWeight: '900', letterSpacing: 0.8 },
  methodSummaryText: { color: '#334B53', fontSize: 11, fontWeight: '700', lineHeight: 16, marginTop: 4 },
  progressTrack: { flexDirection: 'row', gap: 8, marginTop: 18 },
  progressItem: { alignItems: 'center', flex: 1 },
  progressMarker: {
    alignItems: 'center',
    backgroundColor: '#F1F5F6',
    borderColor: '#DDE7EB',
    borderRadius: 16,
    borderWidth: 1,
    height: 32,
    justifyContent: 'center',
    width: 32,
  },
  progressMarkerComplete: { backgroundColor: '#E8F5EF', borderColor: '#A8D7C2' },
  progressMarkerCurrent: { backgroundColor: '#087F8C', borderColor: '#087F8C' },
  progressMarkerText: { color: '#71858B', fontSize: 12, fontWeight: '800' },
  progressMarkerTextActive: { color: '#FFFFFF' },
  progressLabel: { color: '#84969B', fontSize: 9, fontWeight: '600', lineHeight: 13, marginTop: 6, textAlign: 'center' },
  progressLabelCurrent: { color: '#153D46', fontWeight: '800' },
  pointLabel: { color: '#078A95', fontSize: 10, fontWeight: '900', letterSpacing: 0.8, marginTop: 18 },
  currentPointTitle: { color: '#172B33', fontSize: 17, fontWeight: '800', marginTop: 3 },
  inputRow: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: '#C9D8DC',
    borderRadius: 14,
    borderWidth: 1.5,
    flexDirection: 'row',
    marginTop: 6,
    minHeight: 58,
    paddingHorizontal: 14,
  },
  inputLabel: { color: '#49656D', fontSize: 9, fontWeight: '900', letterSpacing: 0.9, marginTop: 15 },
  input: { color: '#172B33', flex: 1, fontSize: 20, fontWeight: '700', paddingVertical: 12 },
  inputUnitBadge: { backgroundColor: '#EAF1F3', borderRadius: 9, paddingHorizontal: 10, paddingVertical: 7 },
  inputUnit: { color: '#334B53', fontSize: 12, fontWeight: '800' },
  voltageStatusCard: {
    alignItems: 'flex-start',
    backgroundColor: '#FFF8E8',
    borderColor: '#F1DFB6',
    borderRadius: 13,
    borderWidth: 1,
    flexDirection: 'row',
    marginTop: 14,
    padding: 11,
  },
  voltageStatusStable: { backgroundColor: '#EFF8F3', borderColor: '#C7E5D4' },
  voltageStatusWaiting: { backgroundColor: '#F5F7F8', borderColor: '#E0E7E9' },
  voltageStatusDot: { backgroundColor: '#B77B08', borderRadius: 5, height: 9, marginRight: 9, marginTop: 3, width: 9 },
  voltageStatusDotStable: { backgroundColor: '#16805B' },
  voltageStatusDotWaiting: { backgroundColor: '#819398' },
  voltageStatusBody: { flex: 1 },
  voltageStatusTitle: { color: '#805909', fontSize: 11, fontWeight: '800' },
  voltageStatusTitleStable: { color: '#176A50' },
  voltageStatusCopy: { color: '#60777E', fontSize: 10, lineHeight: 15, marginTop: 3 },
  capturedPoint: {
    alignItems: 'flex-start',
    backgroundColor: '#F0F8F3',
    borderColor: '#D4EBDD',
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    marginTop: 10,
    padding: 10,
  },
  capturedPointCheck: { color: '#16805B', fontSize: 15, fontWeight: '900', marginRight: 8 },
  capturedPointBody: { flex: 1 },
  capturedPointTitle: { color: '#176A50', fontSize: 11, fontWeight: '800' },
  capturedPointCopy: { color: '#49656D', fontSize: 9, lineHeight: 14, marginTop: 3 },
  errorText: { color: '#A83E49', fontSize: 12, lineHeight: 17, marginTop: 10 },
  noticeText: { color: '#176A50', fontSize: 12, lineHeight: 17, marginTop: 10 },
  captureButton: {
    alignItems: 'center',
    backgroundColor: '#087F8C',
    borderRadius: 13,
    justifyContent: 'center',
    marginTop: 13,
    minHeight: 48,
    paddingHorizontal: 12,
  },
  captureButtonDisabled: { backgroundColor: '#9BAEB2' },
  captureHint: { color: '#71858B', fontSize: 10, lineHeight: 15, marginTop: 8, textAlign: 'center' },
  pressed: { opacity: 0.65 },
});

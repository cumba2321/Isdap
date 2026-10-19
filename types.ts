export type PondReading = {
  temp: number;
  ec: number;
  do: number;
  ph: number;
  tds: number;
  turbidity: number;
};

export type SensorLog = PondReading & {
  id: string;
  recordedAt: number;
};
 
export type TabKey = 'dashboard' | 'history' | 'alert' | 'calibration' | 'settings';

export type MetricKey = keyof PondReading;

export type CalibratableMetricKey = 'ph' | 'tds' | 'ec' | 'turbidity' | 'do';

export type CalibrationMethod = 'one-point' | 'two-point' | 'three-point' | 'do-air' | 'do-air-zero';

export type CalibrationPoint = {
  referenceValue: number;
  measuredValue: number;
  voltage: number;
};

export type SensorCalibration = {
  referenceValue: number;
  measuredValue: number;
  adjustment: number;
  calibratedAt: number;
  method?: CalibrationMethod;
  points?: CalibrationPoint[];
  offset?: number;
};

export type TemperatureCalibration = {
  referenceValue: number;
  measuredValue: number;
  offset: number;
  calibratedAt: number;
};

export type SensorCalibrations = Partial<Record<CalibratableMetricKey, SensorCalibration>> & {
  temperature?: TemperatureCalibration;
};
export type SensorVoltages = Partial<Record<`${CalibratableMetricKey}Voltage`, number>>;

export type Severity = 'critical' | 'warning';
 
export type Metric = {
  key: MetricKey;
  label: string;
  unit: string;
  icon: string;
  color: string;
  range: string;
  /** Returns null when the value is healthy, otherwise the severity of the breach. */
  getSeverity: (value: number) => Severity | null;
};
 
export type ActiveAlert = {
  metric: Metric;
  value: number;
  severity: Severity;
  detectedAt: Date;
};
 
export type Account = {
  email: string;
  authUid?: string;
  firstName?: string;
  lastName?: string;
  countryCode?: string;
  countryName?: string;
  countryCallingCode?: string;
  phoneNumber?: string;
};
 
export type NotificationPreferences = {
  pushNotifications: boolean;
  alertNotifications: boolean;
  warningNotifications: boolean;
  smsNotifications: boolean;
  smsCritical: boolean;
  smsWarning: boolean;
  autoRefresh: boolean;
  soundAlerts: boolean;
};
 
export type AuthResult = { success: true } | { success: false; error: string };

export type GoogleIdentityResult =
  | { success: true; email: string }
  | { success: false; error: string };

export type ManagedDevice = {
  deviceId: string;
  name: string;
};
 
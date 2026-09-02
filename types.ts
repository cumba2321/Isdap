export type PondReading = {
  temp: number;
  ec: number;
  do: number;
  ph: number;
  tds: number;
  turbidity: number;
};
 
export type TabKey = 'dashboard' | 'alert' | 'settings';
 
export type MetricKey = keyof PondReading;
 
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
  password: string;
  farmName: string;
};
 
export type NotificationPreferences = {
  alertNotifications: boolean;
  warningNotifications: boolean;
  maintenanceAlerts: boolean;
  updateNotifications: boolean;
  autoRefresh: boolean;
  soundAlerts: boolean;
};
 
export type AuthResult = { success: true } | { success: false; error: string };
 
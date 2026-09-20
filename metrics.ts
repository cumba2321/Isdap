 import { Metric, MetricKey, PondReading, Severity } from './types';
 
export const demoReading: PondReading = {
  temp: 28.4,
  ec: 1.18,
  do: 6.42,
  ph: 7.32,
  tds: 584,
  turbidity: 3.8,
};
 
export const metrics: Metric[] = [
  {
    key: 'temp',
    label: 'Temperature',
    unit: 'C',
    icon: 'TEMP',
    color: '#f6a85f',
    range: '25 - 32 C',
    getSeverity: (value): Severity | null => {
      if (value < 10 || value > 35) return 'critical';
      if (value < 25 || value > 32) return 'warning';
      return null;
    },
  },
  {
    key: 'do',
    label: 'Dissolved oxygen',
    unit: 'mg/L',
    icon: 'DO',
    color: '#59c3c3',
    range: '> 5 mg/L',
    getSeverity: (value): Severity | null => {
      if (value < 3) return 'critical';
      if (value <= 5) return 'warning';
      return null;
    },
  },
  {
    key: 'ph',
    label: 'pH level',
    unit: 'pH',
    icon: 'pH',
    color: '#c4a7e7',
    range: '6.5 - 9.0 pH',
    getSeverity: (value): Severity | null => {
      if (value < 4 || value > 9) return 'critical';
      if (value < 6.5) return 'warning';
      return null;
    },
  },
  {
    key: 'turbidity',
    label: 'Turbidity',
    unit: 'NTU',
    icon: 'TURB',
    color: '#e8c56a',
    range: '30 - 80 NTU',
    getSeverity: (value): Severity | null => {
      if (value < 10 || value > 150) return 'critical';
      if (value < 30 || value > 80) return 'warning';
      return null;
    },
  },
  {
    key: 'ec',
    label: 'Conductivity',
    unit: 'mS/cm',
    icon: 'EC',
    color: '#ef7d88',
    range: '0.1 - 2.0 mS/cm',
    getSeverity: (value): Severity | null => {
      if (value > 5) return 'critical';
      if (value < 0.1 || value > 2) return 'warning';
      return null;
    },
  },
  {
    key: 'tds',
    label: 'Total dissolved solids',
    unit: 'ppm',
    icon: 'TDS',
    color: '#86bdf2',
    range: '150 - 350 ppm',
    getSeverity: (value): Severity | null => {
      if (value > 350) return 'critical';
      if (value < 150) return 'warning';
      return null;
    },
  },
];
 
export function formatValue(value: number, key: MetricKey) {
  return key === 'tds' || key === 'turbidity' ? value.toFixed(1) : value.toFixed(2);
}
 
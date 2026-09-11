import { FlaskConical, Droplet, CircleDot, Thermometer, Waves } from "lucide-react";
import type { SensorKey } from "./effluent";

export interface SensorConfig {
  key: SensorKey;
  label: string;
  unit: string;
  thresholds: string;
  color: string;
  icon: typeof Droplet;
}

export const sensorConfigs: readonly SensorConfig[] = [
  {
    key: "ph",
    label: "pH",
    unit: "pH",
    thresholds: "Safe: 6.5 - 8.5 | Warning: 5.5 - 9.5",
    color: "var(--ph)",
    icon: FlaskConical,
  },
  {
    key: "tds",
    label: "TDS",
    unit: "ppm",
    thresholds: "Warning: 800 ppm | Critical: 1500 ppm",
    color: "var(--tds)",
    icon: Droplet,
  },
  {
    key: "turbidity",
    label: "Turbidity",
    unit: "NTU",
    thresholds: "Warning: 50 NTU | Critical: 100 NTU",
    color: "var(--turbidity)",
    icon: CircleDot,
  },
  {
    key: "temperature",
    label: "Temperature",
    unit: "°C",
    thresholds: "Warning: 35 °C | Critical: 40 °C",
    color: "var(--temperature)",
    icon: Thermometer,
  },
  {
    key: "flow",
    label: "Flow",
    unit: "L/min",
    thresholds: "Warning: 3.0 | Critical: 5.0 L/min",
    color: "var(--flow)",
    icon: Waves,
  },
] as const;

export const sensorIconMap = {
  ph: FlaskConical,
  tds: Droplet,
  turbidity: CircleDot,
  temperature: Thermometer,
  flow: Waves,
} as const;

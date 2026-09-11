export type SensorKey = "ph" | "tds" | "turbidity" | "temperature" | "flow";
export type Level = "SAFE" | "WARNING" | "CRITICAL";

export const SENSOR_KEYS: readonly SensorKey[] = [
  "ph",
  "tds",
  "turbidity",
  "temperature",
  "flow",
] as const;

export type Reading = Record<SensorKey, number> & {
  id?: number;
  t: number;
  time: string;
  timestamp?: string;
  risk: number;
  status: Level;
  valve_state?: "OPEN" | "CLOSED";
  relay_state?: "INACTIVE" | "ACTIVE";
  discharge_status?: "NORMAL" | "BLOCKED";
};

/**
 * Standard Safe Limits:
 * pH: 6.5 – 8.5
 * TDS: < 800 ppm
 * Turbidity: < 50 NTU
 * Temperature: < 35 °C
 * Flow: < 3.0 L/min
 */
export const SAFE_BOUNDS = {
  ph: { min: 6.5, max: 8.5, dangerousMin: 5.5, dangerousMax: 9.5 },
  tds: { max: 800, dangerous: 1500 },
  turbidity: { max: 50, dangerous: 100 },
  temperature: { max: 35, dangerous: 40 },
  flow: { max: 3.0, dangerous: 5.0 },
} as const;

/** Checks if a specific sensor reading breaches its standard safe threshold. */
export function isBreached(key: SensorKey, v: number): boolean {
  if (key === "ph") return v < SAFE_BOUNDS.ph.min || v > SAFE_BOUNDS.ph.max;
  if (key === "tds") return v >= SAFE_BOUNDS.tds.max;
  if (key === "turbidity") return v >= SAFE_BOUNDS.turbidity.max;
  if (key === "temperature") return v >= SAFE_BOUNDS.temperature.max;
  if (key === "flow") return v >= SAFE_BOUNDS.flow.max;
  return false;
}

/** Checks if a specific sensor reading is severely / highly dangerous. */
export function isHighlyDangerous(key: SensorKey, v: number): boolean {
  if (key === "ph") return v < SAFE_BOUNDS.ph.dangerousMin || v > SAFE_BOUNDS.ph.dangerousMax;
  if (key === "tds") return v >= SAFE_BOUNDS.tds.dangerous;
  if (key === "turbidity") return v >= SAFE_BOUNDS.turbidity.dangerous;
  if (key === "temperature") return v >= SAFE_BOUNDS.temperature.dangerous;
  if (key === "flow") return v >= SAFE_BOUNDS.flow.dangerous;
  return false;
}

/** Determines single sensor level based on safe and dangerous boundaries. */
export function levelOf(key: SensorKey, v: number): Level {
  if (isHighlyDangerous(key, v)) return "CRITICAL";
  if (isBreached(key, v)) return "WARNING";
  return "SAFE";
}

/**
 * Calculate 0-20 risk points contributed by a single sensor.
 */
function points(key: SensorKey, v: number): number {
  if (key === "ph") {
    if (v >= 6.5 && v <= 8.5) {
      const dev = Math.abs(v - 7.0) / 1.5;
      return dev * 5; // 0 to 5 points in safe zone
    }
    if (v >= 5.5 && v <= 9.5) {
      const dev = v < 6.5 ? (6.5 - v) / 1.0 : (v - 8.5) / 1.0;
      return 5 + dev * 8; // 5 to 13 points in warning zone
    }
    const dev = v < 5.5 ? Math.min(1, (5.5 - v) / 5.5) : Math.min(1, (v - 9.5) / 4.5);
    return 13 + dev * 7; // 13 to 20 points in critical zone
  }

  if (key === "tds") {
    if (v < 800) return (v / 800) * 5;
    if (v < 1500) return 5 + ((v - 800) / 700) * 8;
    return 13 + Math.min(1, (v - 1500) / 1500) * 7;
  }

  if (key === "turbidity") {
    if (v < 50) return (v / 50) * 5;
    if (v < 100) return 5 + ((v - 50) / 50) * 8;
    return 13 + Math.min(1, (v - 100) / 100) * 7;
  }

  if (key === "temperature") {
    if (v < 35) return Math.max(0, (v / 35) * 5);
    if (v < 40) return 5 + ((v - 35) / 5) * 8;
    return 13 + Math.min(1, (v - 40) / 20) * 7;
  }

  // flow
  if (v < 3.0) return (v / 3.0) * 5;
  if (v < 5.0) return 5 + ((v - 3.0) / 2.0) * 8;
  return 13 + Math.min(1, (v - 5.0) / 5.0) * 7;
}

/**
 * Composite risk score calculation (0 - 100).
 */
export function riskScore(values: Record<SensorKey, number>): number {
  const breachedCount = SENSOR_KEYS.filter((k) => isBreached(k, values[k])).length;
  const hasDangerous = SENSOR_KEYS.some((k) => isHighlyDangerous(k, values[k]));

  const rawSum = SENSOR_KEYS.reduce((sum, k) => sum + points(k, values[k]), 0);

  // If critical conditions are met, ensure the score reflects high danger (>= 70)
  if (breachedCount >= 2 || hasDangerous) {
    return Math.round(Math.min(100, Math.max(70, rawSum)));
  }

  if (breachedCount === 1) {
    return Math.round(Math.min(65, Math.max(26, rawSum)));
  }

  return Math.round(Math.min(25, Math.max(0, rawSum)));
}

/**
 * Overall status detection rule:
 * - If any sensor exceeds safe threshold: WARNING
 * - If multiple sensors exceed thresholds OR values become highly dangerous: CRITICAL
 * - Otherwise: SAFE
 */
export function overallStatus(values: Record<SensorKey, number>): Level {
  const breachedCount = SENSOR_KEYS.filter((k) => isBreached(k, values[k])).length;
  const hasDangerous = SENSOR_KEYS.some((k) => isHighlyDangerous(k, values[k]));

  if (breachedCount >= 2 || hasDangerous) {
    return "CRITICAL";
  }
  if (breachedCount >= 1) {
    return "WARNING";
  }
  return "SAFE";
}

export const decimals: Record<SensorKey, number> = {
  ph: 2,
  tds: 0,
  turbidity: 0,
  temperature: 1,
  flow: 1,
};

export function fmt(key: SensorKey, v: number): string {
  return v.toFixed(decimals[key]);
}

import type { Level, Reading, SensorKey } from "./effluent";

export type AlertPriorityLevel = 1 | 2 | 3 | 4 | 5;

export type AnomalyState = "NORMAL" | "ANOMALY DETECTED" | "CRITICAL";

export type PredictionState = "SAFE" | "WARNING" | "HIGH RISK" | "CRITICAL";

export type TrendDirection = "RAPID_INCREASE" | "MODERATE_INCREASE" | "STABLE" | "DECREASING";

export interface SensorRateOfChange {
  sensor: SensorKey;
  delta: number;
  ratePerMinute: number;
  percentChange: number;
  direction: "UP" | "DOWN" | "STABLE";
}

export interface MultiWindowTrends {
  window5: {
    tdsRate: number;
    phRate: number;
    turbidityRate: number;
    rapidIncreaseDetected: boolean;
  };
  window10: {
    tdsRate: number;
    phRate: number;
    turbidityRate: number;
    rapidIncreaseDetected: boolean;
  };
  window20: {
    tdsRate: number;
    pollutionGrowthRate: number;
  };
  window50: {
    baselineTds: number;
    baselineTurbidity: number;
    baselinePh: number;
  };
  headline: string;
}

export interface FusionPredictionResult {
  currentHealthScore: number; // 0 - 100 (100 = optimal environmental balance)
  riskScore: number; // 0 - 100
  priorityLevel: AlertPriorityLevel;
  priorityLabel: string;
  anomalyState: AnomalyState;
  anomalyScore: number; // 0 - 100 (higher = more anomalous)
  anomalyDetails: string[];
  predictionState: PredictionState;
  predictedRisk5Min: number;
  predictedRisk10Min: number;
  predictedCriticalInMinutes: number | null;
  trendDirection: TrendDirection;
  trendSummary: string;
  isEarlyWarning: boolean; // True when warning/anomaly/high risk before critical threshold
  sensorRates: Record<SensorKey, SensorRateOfChange>;
  trends: MultiWindowTrends;
  fusionDiagnostics: {
    acidAlkalineShock: boolean;
    solidsSurgeWithFlow: boolean;
    thermalDischargeSpike: boolean;
    compositeSynergyFactor: number;
  };
}

export interface RawSensorData {
  ph: number;
  tds: number;
  turbidity: number;
  temperature: number;
  flow: number;
  timestamp?: string;
}

/**
 * Baseline normal operating benchmarks for industrial effluent
 */
const BASELINE = {
  ph: { mean: 7.2, std: 0.45, minSafe: 6.5, maxSafe: 8.5 },
  tds: { mean: 420, std: 95, safeMax: 800 },
  turbidity: { mean: 18, std: 8, safeMax: 50 },
  temperature: { mean: 26.5, std: 3.5, safeMax: 35 },
  flow: { mean: 1.6, std: 0.45, safeMax: 3.0 },
};

/**
 * Calculates rate of change between readings
 */
function calculateRateOfChange(
  current: number,
  previous: number,
  secondsElapsed: number,
): { delta: number; ratePerMinute: number; percentChange: number } {
  const delta = current - previous;
  const timeInMinutes = Math.max(secondsElapsed / 60, 0.05);
  const ratePerMinute = delta / timeInMinutes;
  const percentChange = previous !== 0 ? ((current - previous) / Math.abs(previous)) * 100 : 0;
  return { delta, ratePerMinute, percentChange };
}

/**
 * Computes linear regression slope (units per sample)
 */
function computeLinearSlope(values: number[]): number {
  const n = values.length;
  if (n < 2) return 0;
  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumX2 = 0;

  for (let i = 0; i < n; i++) {
    sumX += i;
    sumY += values[i];
    sumXY += i * values[i];
    sumX2 += i * i;
  }

  const denominator = n * sumX2 - sumX * sumX;
  if (denominator === 0) return 0;
  return (n * sumXY - sumX * sumY) / denominator;
}

/**
 * SENSOR FUSION ENGINE
 * Combines pH + TDS + Turbidity + Temperature + Flow into a unified environmental health score.
 * Evaluates nonlinear multi-sensor cross-relationships (acid shock, solids surge, thermal load).
 */
export function evaluateSensorFusion(
  current: RawSensorData,
  history: RawSensorData[],
): FusionPredictionResult {
  const ph = Number(current.ph);
  const tds = Number(current.tds);
  const turb = Number(current.turbidity);
  const temp = Number(current.temperature);
  const flow = Number(current.flow);

  // 1. Individual parameter penalty models
  const phDev = Math.abs(ph - BASELINE.ph.mean);
  const phPenalty = Math.min(100, phDev > 0.3 ? Math.pow(phDev / 1.5, 1.8) * 35 : phDev * 10);

  const tdsPenalty = Math.min(
    100,
    tds > 450 ? Math.pow((tds - 400) / 450, 1.4) * 32 : (tds / 450) * 10,
  );

  const turbPenalty = Math.min(
    100,
    turb > 20 ? Math.pow((turb - 15) / 35, 1.3) * 26 : (turb / 20) * 8,
  );

  const tempPenalty = Math.min(100, temp > 28 ? Math.pow((temp - 27) / 8, 1.2) * 18 : 0);

  const flowPenalty = Math.min(100, flow > 2.5 ? Math.pow((flow - 2.2) / 1.8, 1.2) * 16 : 0);

  // 2. Sensor Fusion Relationship Analysis (Cross-sensor interactions)
  // Relationship 1: pH dropping rapidly while TDS is increasing and Flow is high (Unneutralized industrial acid release)
  const prevReading = history.length > 0 ? history[history.length - 1] : null;
  const phDropping = prevReading ? prevReading.ph - ph > 0.15 : false;
  const tdsRising = prevReading ? tds - prevReading.tds > 30 : false;
  const flowElevated = flow > 2.2;

  const acidAlkalineShock =
    (ph < 6.8 || ph > 8.2) && (phDropping || (prevReading && Math.abs(prevReading.ph - ph) > 0.2));
  const solidsSurgeWithFlow = tdsRising && (flowElevated || turb > 30);
  const thermalDischargeSpike = temp > 32 && flow > 2.0;

  // Synergistic multiplier
  let compositeSynergyFactor = 1.0;
  if (acidAlkalineShock && solidsSurgeWithFlow) {
    compositeSynergyFactor = 1.45; // Compound toxicity shock
  } else if (acidAlkalineShock || solidsSurgeWithFlow) {
    compositeSynergyFactor = 1.22;
  }

  const rawSumPenalties =
    (phPenalty + tdsPenalty + turbPenalty + tempPenalty + flowPenalty) * compositeSynergyFactor;

  // Unified Environmental Health Score (0 - 100, 100 being optimal pristine effluent)
  const currentHealthScore = Math.max(0, Math.min(100, Math.round(100 - rawSumPenalties)));

  // Equivalent composite risk score (0 - 100)
  const riskScore = Math.max(0, Math.min(100, Math.round(100 - currentHealthScore)));

  // 3. MULTI-WINDOW TREND ANALYSIS (5, 10, 20, 50 readings from database)
  const window5Readings = history.slice(-5);
  const window10Readings = history.slice(-10);
  const window20Readings = history.slice(-20);
  const window50Readings = history.slice(-50);

  const tds5Values = [...window5Readings.map((r) => r.tds), tds];
  const ph5Values = [...window5Readings.map((r) => r.ph), ph];
  const turb5Values = [...window5Readings.map((r) => r.turbidity), turb];

  const tds10Values = [...window10Readings.map((r) => r.tds), tds];
  const ph10Values = [...window10Readings.map((r) => r.ph), ph];
  const turb10Values = [...window10Readings.map((r) => r.turbidity), turb];

  const tdsSlope5 = computeLinearSlope(tds5Values);
  const tdsSlope10 = computeLinearSlope(tds10Values);
  const phSlope5 = computeLinearSlope(ph5Values);
  const phSlope10 = computeLinearSlope(ph10Values);
  const turbSlope5 = computeLinearSlope(turb5Values);
  const turbSlope10 = computeLinearSlope(turb10Values);

  const rapidIncreaseDetected =
    tdsSlope5 > 25 ||
    (tdsSlope10 > 15 && tds > 500) ||
    turbSlope5 > 8 ||
    (prevReading && tds - prevReading.tds > 70);

  const moderateIncreaseDetected =
    tdsSlope10 > 8 || turbSlope10 > 3 || (prevReading && tds - prevReading.tds > 25);

  let trendDirection: TrendDirection = "STABLE";
  if (rapidIncreaseDetected) {
    trendDirection = "RAPID_INCREASE";
  } else if (moderateIncreaseDetected) {
    trendDirection = "MODERATE_INCREASE";
  } else if (tdsSlope10 < -10 || (prevReading && prevReading.tds - tds > 30)) {
    trendDirection = "DECREASING";
  }

  let headline = "Normal Operating Stability";
  if (rapidIncreaseDetected) {
    headline = "Rapid Pollution Growth Detected";
  } else if (moderateIncreaseDetected) {
    headline = "Upward Effluent Concentration Trend";
  } else if (trendDirection === "DECREASING") {
    headline = "Effluent Quality Recovery In Progress";
  }

  const trends: MultiWindowTrends = {
    window5: {
      tdsRate: Number(tdsSlope5.toFixed(2)),
      phRate: Number(phSlope5.toFixed(3)),
      turbidityRate: Number(turbSlope5.toFixed(2)),
      rapidIncreaseDetected,
    },
    window10: {
      tdsRate: Number(tdsSlope10.toFixed(2)),
      phRate: Number(phSlope10.toFixed(3)),
      turbidityRate: Number(turbSlope10.toFixed(2)),
      rapidIncreaseDetected: tdsSlope10 > 18,
    },
    window20: {
      tdsRate: Number(computeLinearSlope(window20Readings.map((r) => r.tds)).toFixed(2)),
      pollutionGrowthRate: Number(
        (window20Readings.length > 1
          ? (tds - window20Readings[0].tds) / window20Readings.length
          : 0
        ).toFixed(2),
      ),
    },
    window50: {
      baselineTds: Math.round(
        window50Readings.length > 0
          ? window50Readings.reduce((acc, r) => acc + r.tds, 0) / window50Readings.length
          : BASELINE.tds.mean,
      ),
      baselineTurbidity: Math.round(
        window50Readings.length > 0
          ? window50Readings.reduce((acc, r) => acc + r.turbidity, 0) / window50Readings.length
          : BASELINE.turbidity.mean,
      ),
      baselinePh: Number(
        (window50Readings.length > 0
          ? window50Readings.reduce((acc, r) => acc + r.ph, 0) / window50Readings.length
          : BASELINE.ph.mean
        ).toFixed(2),
      ),
    },
    headline,
  };

  // 4. ANOMALY DETECTION (Multivariate Distance & Sudden Derivation Outliers)
  // Calibrated against normal operating distribution:
  const zPh = (ph - BASELINE.ph.mean) / BASELINE.ph.std;
  const zTds = Math.max(0, tds - BASELINE.tds.mean) / BASELINE.tds.std;
  const zTurb = Math.max(0, turb - BASELINE.turbidity.mean) / BASELINE.turbidity.std;
  const zTemp = Math.max(0, temp - BASELINE.temperature.mean) / BASELINE.temperature.std;
  const zFlow = Math.max(0, flow - BASELINE.flow.mean) / BASELINE.flow.std;

  // Weighted Mahalanobis / Euclidean distance proxy
  const distanceSquared =
    1.5 * Math.pow(zPh, 2) +
    1.4 * Math.pow(zTds, 2) +
    1.1 * Math.pow(zTurb, 2) +
    0.8 * Math.pow(zTemp, 2) +
    0.7 * Math.pow(zFlow, 2);

  const multivariateAnomalyScore = Math.min(100, Math.round(Math.sqrt(distanceSquared) * 18));

  const anomalyDetails: string[] = [];
  if (Math.abs(zPh) > 2.2) {
    anomalyDetails.push(
      `pH deviation (${ph.toFixed(2)}) is ${Math.abs(zPh).toFixed(1)}σ from normal operating range`,
    );
  }
  if (zTds > 2.5) {
    anomalyDetails.push(`TDS spike (${tds.toFixed(0)} ppm) is ${zTds.toFixed(1)}σ above baseline`);
  }
  if (zTurb > 2.5) {
    anomalyDetails.push(
      `Turbidity anomaly (${turb.toFixed(0)} NTU) is ${zTurb.toFixed(1)}σ above baseline`,
    );
  }
  if (prevReading) {
    if (Math.abs(ph - prevReading.ph) >= 0.4) {
      anomalyDetails.push(
        `Sudden pH shift of ${(ph - prevReading.ph).toFixed(2)} units detected in single interval`,
      );
    }
    if (tds - prevReading.tds >= 80) {
      anomalyDetails.push(
        `Rapid TDS increase (+${(tds - prevReading.tds).toFixed(0)} ppm) detected`,
      );
    }
    if (turb - prevReading.turbidity >= 25) {
      anomalyDetails.push(
        `Turbidity surge (+${(turb - prevReading.turbidity).toFixed(0)} NTU) detected`,
      );
    }
    if (flow - prevReading.flow >= 1.5) {
      anomalyDetails.push(
        `Abnormal discharge rate surge (+${(flow - prevReading.flow).toFixed(1)} L/min) detected`,
      );
    }
  }

  // Cross-sensor pattern deviation
  if (phDropping && tdsRising && flowElevated) {
    anomalyDetails.push(
      "Sensor Fusion Alert: Simultaneous pH drop, TDS spike, and flow surge indicates industrial wash/discharge breach",
    );
  }

  const isHardCritical =
    ph < 5.5 || ph > 9.5 || tds >= 1500 || turb >= 100 || temp >= 40 || flow >= 5.0;

  let anomalyState: AnomalyState = "NORMAL";
  if (isHardCritical) {
    anomalyState = "CRITICAL";
  } else if (
    multivariateAnomalyScore >= 50 ||
    anomalyDetails.length > 0 ||
    (acidAlkalineShock && solidsSurgeWithFlow)
  ) {
    anomalyState = "ANOMALY DETECTED";
  }

  // 5. PREDICTIVE ANALYTICS (5-min and 10-min projection)
  // Assume reading interval is approximately 3 to 5 seconds per sample.
  // 5 minutes = ~60-100 samples; we extrapolate from the recent rate of change.
  // Damped linear extrapolation to avoid extreme unbounded predictions:
  const dampFactor5Min = 0.75;
  const dampFactor10Min = 0.55;

  const samplesIn5Min = 20; // Effective predictive horizon steps
  const samplesIn10Min = 40;

  const projectedTds5Min = Math.max(0, tds + tdsSlope5 * samplesIn5Min * dampFactor5Min);
  const projectedTds10Min = Math.max(0, tds + tdsSlope10 * samplesIn10Min * dampFactor10Min);

  const projectedPh5Min = Math.max(0, Math.min(14, ph + phSlope5 * samplesIn5Min * dampFactor5Min));
  const projectedPh10Min = Math.max(
    0,
    Math.min(14, ph + phSlope10 * samplesIn10Min * dampFactor10Min),
  );

  // Compute projected risk scores at +5min and +10min
  const projectedDevTds5 = Math.min(100, (projectedTds5Min / 800) * 50);
  const projectedDevPh5 = Math.min(
    100,
    Math.abs(projectedPh5Min - 7.2) > 1.3
      ? Math.pow(Math.abs(projectedPh5Min - 7.2) / 1.5, 2) * 50
      : 0,
  );
  const predictedRisk5Min = Math.min(
    100,
    Math.max(riskScore, Math.round(projectedDevTds5 + projectedDevPh5)),
  );

  const projectedDevTds10 = Math.min(100, (projectedTds10Min / 800) * 55);
  const projectedDevPh10 = Math.min(
    100,
    Math.abs(projectedPh10Min - 7.2) > 1.3
      ? Math.pow(Math.abs(projectedPh10Min - 7.2) / 1.5, 2) * 55
      : 0,
  );
  const predictedRisk10Min = Math.min(
    100,
    Math.max(predictedRisk5Min, Math.round(projectedDevTds10 + projectedDevPh10)),
  );

  let predictedCriticalInMinutes: number | null = null;
  if (predictedRisk5Min >= 75) {
    predictedCriticalInMinutes = 5;
  } else if (predictedRisk10Min >= 75) {
    predictedCriticalInMinutes = 10;
  }

  let predictionState: PredictionState = "SAFE";
  if (isHardCritical || riskScore >= 70) {
    predictionState = "CRITICAL";
  } else if (predictedRisk5Min >= 70 || (rapidIncreaseDetected && riskScore >= 45)) {
    predictionState = "HIGH RISK";
  } else if (
    predictedRisk10Min >= 50 ||
    moderateIncreaseDetected ||
    anomalyState === "ANOMALY DETECTED"
  ) {
    predictionState = "WARNING";
  }

  // 6. ALERT PRIORITY LEVELS (Level 1 to Level 5)
  // LEVEL 1: SAFE
  // LEVEL 2: WARNING
  // LEVEL 3: ANOMALY DETECTED
  // LEVEL 4: HIGH RISK PREDICTION
  // LEVEL 5: CRITICAL
  let priorityLevel: AlertPriorityLevel = 1;
  let priorityLabel = "LEVEL 1: SAFE";

  if (isHardCritical || riskScore >= 70) {
    priorityLevel = 5;
    priorityLabel = "LEVEL 5: CRITICAL";
  } else if (predictionState === "HIGH RISK" || predictedCriticalInMinutes !== null) {
    priorityLevel = 4;
    priorityLabel = "LEVEL 4: HIGH RISK PREDICTION";
  } else if (anomalyState === "ANOMALY DETECTED") {
    priorityLevel = 3;
    priorityLabel = "LEVEL 3: ANOMALY DETECTED";
  } else if (predictionState === "WARNING" || currentHealthScore < 70) {
    priorityLevel = 2;
    priorityLabel = "LEVEL 2: WARNING";
  } else {
    priorityLevel = 1;
    priorityLabel = "LEVEL 1: SAFE";
  }

  // Early warning condition: Level 2, 3, or 4 active before actual critical threshold breach
  const isEarlyWarning =
    !isHardCritical && (priorityLevel === 3 || priorityLevel === 4 || priorityLevel === 2);

  // Calculate specific sensor delta rates
  const elapsedSeconds = 5; // standard polling delta
  const sensorRates: Record<SensorKey, SensorRateOfChange> = {
    ph: {
      sensor: "ph",
      delta: prevReading ? Number((ph - prevReading.ph).toFixed(2)) : 0,
      ratePerMinute: prevReading
        ? Number(calculateRateOfChange(ph, prevReading.ph, elapsedSeconds).ratePerMinute.toFixed(2))
        : 0,
      percentChange: prevReading
        ? Number(calculateRateOfChange(ph, prevReading.ph, elapsedSeconds).percentChange.toFixed(1))
        : 0,
      direction:
        prevReading && ph > prevReading.ph + 0.05
          ? "UP"
          : prevReading && ph < prevReading.ph - 0.05
            ? "DOWN"
            : "STABLE",
    },
    tds: {
      sensor: "tds",
      delta: prevReading ? Math.round(tds - prevReading.tds) : 0,
      ratePerMinute: prevReading
        ? Math.round(calculateRateOfChange(tds, prevReading.tds, elapsedSeconds).ratePerMinute)
        : 0,
      percentChange: prevReading
        ? Number(
            calculateRateOfChange(tds, prevReading.tds, elapsedSeconds).percentChange.toFixed(1),
          )
        : 0,
      direction:
        prevReading && tds > prevReading.tds + 10
          ? "UP"
          : prevReading && tds < prevReading.tds - 10
            ? "DOWN"
            : "STABLE",
    },
    turbidity: {
      sensor: "turbidity",
      delta: prevReading ? Math.round(turb - prevReading.turbidity) : 0,
      ratePerMinute: prevReading
        ? Math.round(
            calculateRateOfChange(turb, prevReading.turbidity, elapsedSeconds).ratePerMinute,
          )
        : 0,
      percentChange: prevReading
        ? Number(
            calculateRateOfChange(
              turb,
              prevReading.turbidity,
              elapsedSeconds,
            ).percentChange.toFixed(1),
          )
        : 0,
      direction:
        prevReading && turb > prevReading.turbidity + 3
          ? "UP"
          : prevReading && turb < prevReading.turbidity - 3
            ? "DOWN"
            : "STABLE",
    },
    temperature: {
      sensor: "temperature",
      delta: prevReading ? Number((temp - prevReading.temperature).toFixed(1)) : 0,
      ratePerMinute: prevReading
        ? Number(
            calculateRateOfChange(
              temp,
              prevReading.temperature,
              elapsedSeconds,
            ).ratePerMinute.toFixed(1),
          )
        : 0,
      percentChange: prevReading
        ? Number(
            calculateRateOfChange(
              temp,
              prevReading.temperature,
              elapsedSeconds,
            ).percentChange.toFixed(1),
          )
        : 0,
      direction:
        prevReading && temp > prevReading.temperature + 0.5
          ? "UP"
          : prevReading && temp < prevReading.temperature - 0.5
            ? "DOWN"
            : "STABLE",
    },
    flow: {
      sensor: "flow",
      delta: prevReading ? Number((flow - prevReading.flow).toFixed(1)) : 0,
      ratePerMinute: prevReading
        ? Number(
            calculateRateOfChange(flow, prevReading.flow, elapsedSeconds).ratePerMinute.toFixed(1),
          )
        : 0,
      percentChange: prevReading
        ? Number(
            calculateRateOfChange(flow, prevReading.flow, elapsedSeconds).percentChange.toFixed(1),
          )
        : 0,
      direction:
        prevReading && flow > prevReading.flow + 0.2
          ? "UP"
          : prevReading && flow < prevReading.flow - 0.2
            ? "DOWN"
            : "STABLE",
    },
  };

  const trendSummary = rapidIncreaseDetected
    ? `Rapid pollution growth detected: TDS rising at ${tdsSlope5 > 0 ? "+" : ""}${tdsSlope5.toFixed(1)} ppm/sample, Turbidity ${turbSlope5 > 0 ? "+" : ""}${turbSlope5.toFixed(1)} NTU/sample`
    : moderateIncreaseDetected
      ? `Moderate upward trend across last 10 readings: TDS rate +${tdsSlope10.toFixed(1)} ppm/sample`
      : trendDirection === "DECREASING"
        ? "Pollution markers subsiding across recent measurement windows"
        : "Steady baseline conditions maintained across all 5 sensor vectors";

  return {
    currentHealthScore,
    riskScore,
    priorityLevel,
    priorityLabel,
    anomalyState,
    anomalyScore: multivariateAnomalyScore,
    anomalyDetails,
    predictionState,
    predictedRisk5Min,
    predictedRisk10Min,
    predictedCriticalInMinutes,
    trendDirection,
    trendSummary,
    isEarlyWarning,
    sensorRates,
    trends,
    fusionDiagnostics: {
      acidAlkalineShock,
      solidsSurgeWithFlow,
      thermalDischargeSpike,
      compositeSynergyFactor,
    },
  };
}

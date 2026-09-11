import {
  type Level,
  type SensorKey,
  SENSOR_KEYS,
  isBreached,
  isHighlyDangerous,
  riskScore,
  overallStatus,
} from "./effluent";
import {
  evaluateSensorFusion,
  type FusionPredictionResult,
  type AlertPriorityLevel,
  type AnomalyState,
  type PredictionState,
  type TrendDirection,
} from "./ml-engine";

export interface StoredSensorReading {
  id: number;
  timestamp: string;
  ph: number;
  tds: number;
  turbidity: number;
  temperature: number;
  flow_rate: number;
  flow: number;
  pollution_score: number;
  status: Level;
  valve_state: "OPEN" | "CLOSED";
  relay_state: "INACTIVE" | "ACTIVE";
  discharge_status: "NORMAL" | "BLOCKED";
  // AI / ML Analysis
  ai_health_score: number;
  anomaly_state: AnomalyState;
  prediction_state: PredictionState;
  trend_direction: TrendDirection;
  priority_level: AlertPriorityLevel;
  priority_label: string;
  is_early_warning: boolean;
  predicted_risk_5min: number;
  predicted_risk_10min: number;
}

export interface StoredAlertLog {
  id: number;
  reading_id: number;
  severity: "CRITICAL" | "WARNING" | "ANOMALY" | "PREDICTION";
  receiver_emails: string[];
  alert_type: string;
  risk_score: number;
  priority_level?: number;
  priority_label?: string;
  valve_state: "OPEN" | "CLOSED";
  relay_status: "INACTIVE" | "ACTIVATED";
  discharge_status: "NORMAL" | "BLOCKED";
  message: string;
  sent_at: string;
}

export interface SystemSafetyState {
  currentStatus: Level;
  riskScore: number;
  valveState: "OPEN" | "CLOSED";
  relayState: "INACTIVE" | "ACTIVE";
  dischargeStatus: "NORMAL" | "BLOCKED";
  lastAlertTime: string | null;
  manualOverride: boolean;
  // Advanced AI / ML fields
  aiHealthScore: number;
  anomalyStatus: AnomalyState;
  predictionStatus: PredictionState;
  trendDirection: TrendDirection;
  priorityLevel: AlertPriorityLevel;
  priorityLabel: string;
  isEarlyWarning: boolean;
  predictedRisk5Min: number;
  predictedRisk10Min: number;
  trendHeadline: string;
}

class SensorDatabaseStore {
  private readings: StoredSensorReading[] = [];
  private alerts: StoredAlertLog[] = [];
  private nextId = 1;
  private nextAlertId = 1;

  // SCADA State
  private valveState: "OPEN" | "CLOSED" = "OPEN";
  private relayState: "INACTIVE" | "ACTIVE" = "INACTIVE";
  private dischargeStatus: "NORMAL" | "BLOCKED" = "NORMAL";
  private lastAlertTime: string | null = null;
  private manualOverride = false;

  // AI / ML Engine Cache & Throttling
  private latestMl: FusionPredictionResult | null = null;
  private lastEmailSentTimes: Record<string, number> = {};

  public evaluateMetrics(
    ph: number,
    tds: number,
    turbidity: number,
    temperature: number,
    flow: number,
  ): { pollution_score: number; status: Level } {
    const values: Record<SensorKey, number> = {
      ph,
      tds,
      turbidity,
      temperature,
      flow,
    };

    const status = overallStatus(values);
    const score = riskScore(values);

    return { pollution_score: score, status };
  }

  public addReading(payload: {
    ph: number;
    tds: number;
    turbidity: number;
    temperature: number;
    flow?: number;
    flow_rate?: number;
  }): StoredSensorReading {
    const flowVal = Number(payload.flow ?? payload.flow_rate ?? 0);
    const phVal = Number(payload.ph);
    const tdsVal = Number(payload.tds);
    const turbVal = Number(payload.turbidity);
    const tempVal = Number(payload.temperature);

    const { pollution_score, status } = this.evaluateMetrics(
      phVal,
      tdsVal,
      turbVal,
      tempVal,
      flowVal,
    );

    const nowIso = new Date().toISOString();
    const nowMs = Date.now();

    // 1. RUN ADVANCED SENSOR FUSION & ML ENGINE ON REAL DATABASE HISTORY
    const historyData = this.readings.map((r) => ({
      ph: r.ph,
      tds: r.tds,
      turbidity: r.turbidity,
      temperature: r.temperature,
      flow: r.flow,
      timestamp: r.timestamp,
    }));

    const ml = evaluateSensorFusion(
      {
        ph: phVal,
        tds: tdsVal,
        turbidity: turbVal,
        temperature: tempVal,
        flow: flowVal,
        timestamp: nowIso,
      },
      historyData,
    );
    this.latestMl = ml;

    const readingId = this.nextId++;

    // 2. AUTOMATIC SAFETY ACTIONS
    // Alerts stay quiet during normal operation and only trigger when pollution_score >= DEFAULT_CRITICAL_THRESHOLD
    const criticalThreshold = Number(process.env.DEFAULT_CRITICAL_THRESHOLD || 75.0);
    const isCritical = pollution_score >= criticalThreshold || status === "CRITICAL";

    if (isCritical) {
      this.valveState = "CLOSED";
      this.relayState = "ACTIVE";
      this.dischargeStatus = "BLOCKED";
      this.lastAlertTime = nowIso;
    } else if (!this.manualOverride) {
      // Normal safe discharge
      this.valveState = "OPEN";
      this.relayState = "INACTIVE";
      this.dischargeStatus = "NORMAL";
    }

    const reading: StoredSensorReading = {
      id: readingId,
      timestamp: nowIso,
      ph: phVal,
      tds: tdsVal,
      turbidity: turbVal,
      temperature: tempVal,
      flow_rate: flowVal,
      flow: flowVal,
      pollution_score,
      status,
      valve_state: this.valveState,
      relay_state: this.relayState,
      discharge_status: this.dischargeStatus,
      ai_health_score: ml.currentHealthScore,
      anomaly_state: ml.anomalyState,
      prediction_state: ml.predictionState,
      trend_direction: ml.trendDirection,
      priority_level: ml.priorityLevel,
      priority_label: ml.priorityLabel,
      is_early_warning: ml.isEarlyWarning,
      predicted_risk_5min: ml.predictedRisk5Min,
      predicted_risk_10min: ml.predictedRisk10Min,
    };

    this.readings.push(reading);

    // Keep up to 2000 records in memory
    if (this.readings.length > 2000) {
      this.readings.shift();
    }

    return reading;
  }

  public getSafetyState(): SystemSafetyState {
    const latest = this.getLatest();
    return {
      currentStatus: latest?.status ?? "SAFE",
      riskScore: latest?.pollution_score ?? 0,
      valveState: this.valveState,
      relayState: this.relayState,
      dischargeStatus: this.dischargeStatus,
      lastAlertTime: this.lastAlertTime,
      manualOverride: this.manualOverride,
      aiHealthScore: latest?.ai_health_score ?? this.latestMl?.currentHealthScore ?? 100,
      anomalyStatus: latest?.anomaly_state ?? this.latestMl?.anomalyState ?? "NORMAL",
      predictionStatus: latest?.prediction_state ?? this.latestMl?.predictionState ?? "SAFE",
      trendDirection: latest?.trend_direction ?? this.latestMl?.trendDirection ?? "STABLE",
      priorityLevel: latest?.priority_level ?? this.latestMl?.priorityLevel ?? 1,
      priorityLabel: latest?.priority_label ?? this.latestMl?.priorityLabel ?? "LEVEL 1: SAFE",
      isEarlyWarning: latest?.is_early_warning ?? this.latestMl?.isEarlyWarning ?? false,
      predictedRisk5Min: latest?.predicted_risk_5min ?? this.latestMl?.predictedRisk5Min ?? 0,
      predictedRisk10Min: latest?.predicted_risk_10min ?? this.latestMl?.predictedRisk10Min ?? 0,
      trendHeadline: this.latestMl?.trends?.headline ?? "Normal Operating Stability",
    };
  }

  public getMlAnalysis(): FusionPredictionResult | null {
    if (this.latestMl) return this.latestMl;
    const latest = this.getLatest();
    if (!latest) return null;
    return evaluateSensorFusion(
      {
        ph: latest.ph,
        tds: latest.tds,
        turbidity: latest.turbidity,
        temperature: latest.temperature,
        flow: latest.flow,
        timestamp: latest.timestamp,
      },
      this.readings.slice(0, -1),
    );
  }

  public setManualValve(state: "OPEN" | "CLOSED"): SystemSafetyState {
    this.manualOverride = true;
    this.valveState = state;
    this.relayState = state === "CLOSED" ? "ACTIVE" : "INACTIVE";
    this.dischargeStatus = state === "CLOSED" ? "BLOCKED" : "NORMAL";
    return this.getSafetyState();
  }

  public resetSafetyInterlock(): SystemSafetyState {
    this.manualOverride = false;
    this.valveState = "OPEN";
    this.relayState = "INACTIVE";
    this.dischargeStatus = "NORMAL";
    return this.getSafetyState();
  }

  public clearAll(): void {
    this.readings = [];
    this.alerts = [];
    this.valveState = "OPEN";
    this.relayState = "INACTIVE";
    this.dischargeStatus = "NORMAL";
    this.lastAlertTime = null;
    this.manualOverride = false;
    this.latestMl = null;
  }

  public getLatest(): StoredSensorReading | null {
    if (this.readings.length === 0) return null;
    return this.readings[this.readings.length - 1];
  }

  public getHistory(
    limit = 50,
    offset = 0,
    statusFilter?: Level,
  ): { total: number; readings: StoredSensorReading[] } {
    let list = this.readings.slice();
    if (statusFilter) {
      list = list.filter((r) => r.status === statusFilter);
    }
    const total = list.length;
    const reversed = list.reverse();
    const paginated = reversed.slice(offset, offset + limit);
    return { total, readings: paginated };
  }

  public getStatistics() {
    const total = this.readings.length;
    let safeCount = 0;
    let warnCount = 0;
    let critCount = 0;
    let sumPh = 0;
    let sumTds = 0;
    let sumTurb = 0;
    let sumTemp = 0;
    let sumFlow = 0;
    let sumRisk = 0;

    for (const r of this.readings) {
      if (r.status === "SAFE") safeCount++;
      else if (r.status === "WARNING") warnCount++;
      else if (r.status === "CRITICAL") critCount++;

      sumPh += r.ph;
      sumTds += r.tds;
      sumTurb += r.turbidity;
      sumTemp += r.temperature;
      sumFlow += r.flow_rate;
      sumRisk += r.pollution_score;
    }

    const avg = (sum: number) => (total > 0 ? Number((sum / total).toFixed(2)) : 0);

    const averages = {
      ph: avg(sumPh),
      tds: avg(sumTds),
      turbidity: avg(sumTurb),
      temperature: avg(sumTemp),
      flow_rate: avg(sumFlow),
      pollution_score: avg(sumRisk),
      sample_count: total,
    };

    return {
      daily_pollution_avg: averages.pollution_score,
      weekly_pollution_avg: averages.pollution_score,
      monthly_pollution_avg: averages.pollution_score,
      total_alerts: this.alerts.length,
      safe_readings_count: safeCount,
      warning_readings_count: warnCount,
      critical_readings_count: critCount,
      total_readings: total,
      daily_metric_averages: averages,
      weekly_metric_averages: averages,
      monthly_metric_averages: averages,
      safety_state: this.getSafetyState(),
    };
  }

  public getAlerts(limit = 50, offset = 0) {
    const reversed = this.alerts.slice().reverse();
    return reversed.slice(offset, offset + limit);
  }
}

export const sensorDbStore = new SensorDatabaseStore();

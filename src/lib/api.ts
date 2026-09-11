import type { Level, Reading, SensorKey } from "./effluent";
import type { FusionPredictionResult } from "./ml-engine";

export interface BackendSensorReading {
  id: number;
  timestamp: string;
  ph: number;
  tds: number;
  turbidity: number;
  temperature: number;
  flow?: number;
  flow_rate?: number;
  pollution_score: number;
  status: Level;
  ai_health_score?: number;
  anomaly_state?: string;
  prediction_state?: string;
  trend_direction?: string;
  priority_level?: number;
  priority_label?: string;
  is_early_warning?: boolean;
  predicted_risk_5min?: number;
  predicted_risk_10min?: number;
}

export interface BackendSafetyState {
  currentStatus: Level;
  riskScore: number;
  valveState: "OPEN" | "CLOSED";
  relayState: "INACTIVE" | "ACTIVE";
  dischargeStatus: "NORMAL" | "BLOCKED";
  lastAlertTime: string | null;
  manualOverride: boolean;
  aiHealthScore: number;
  anomalyStatus: string;
  predictionStatus: string;
  trendDirection: string;
  priorityLevel: number;
  priorityLabel: string;
  isEarlyWarning: boolean;
  predictedRisk5Min: number;
  predictedRisk10Min: number;
  trendHeadline: string;
}

export interface BackendAiAnalyticsResponse {
  ai_analysis: FusionPredictionResult | null;
  safety_state: BackendSafetyState;
  timestamp: string;
}

export interface BackendHistoryResponse {
  total: number;
  readings: BackendSensorReading[];
}

export interface MetricAverage {
  ph: number;
  tds: number;
  turbidity: number;
  temperature: number;
  flow_rate: number;
  pollution_score: number;
  sample_count: number;
}

export interface BackendStatistics {
  daily_pollution_avg: number;
  weekly_pollution_avg: number;
  monthly_pollution_avg: number;
  total_alerts: number;
  safe_readings_count: number;
  warning_readings_count: number;
  critical_readings_count: number;
  total_readings: number;
  daily_metric_averages?: MetricAverage;
  weekly_metric_averages?: MetricAverage;
  monthly_metric_averages?: MetricAverage;
}

export interface BackendAlertLog {
  id: number;
  reading_id?: number;
  receiver_email: string;
  alert_type: string;
  message: string;
  sent_at: string;
}

// Automatically resolve API URL (relative in browser/container)
const API_BASE = "";

export function mapBackendToReading(b: BackendSensorReading, index = 0): Reading {
  const d = new Date(b.timestamp);
  const timeStr = isNaN(d.getTime())
    ? new Date().toLocaleTimeString([], { hour12: false })
    : d.toLocaleTimeString([], { hour12: false });
  const flowVal = b.flow ?? b.flow_rate ?? 0;

  return {
    id: b.id,
    t: index,
    time: timeStr,
    timestamp: b.timestamp,
    ph: Number(b.ph),
    tds: Number(b.tds),
    turbidity: Number(b.turbidity),
    temperature: Number(b.temperature),
    flow: Number(flowVal),
    risk: Math.round(Number(b.pollution_score)),
    status: b.status,
  };
}

export async function fetchLatestReading(): Promise<BackendSensorReading | null> {
  try {
    const res = await fetch(`${API_BASE}/api/sensors/current`, {
      headers: { Accept: "application/json" },
    });
    if (res.status === 404 || res.status === 204) {
      return null;
    }
    if (!res.ok) {
      // Try fallback route
      const fallback = await fetch(`${API_BASE}/api/latest-reading`);
      if (fallback.status === 404 || fallback.status === 204) return null;
      if (!fallback.ok) return null;
      return await fallback.json();
    }
    const data = await res.json();
    if (!data || data.id === undefined || data.id === 0) return null;
    return data;
  } catch {
    return null;
  }
}

export async function fetchHistory(
  limit = 50,
  offset = 0,
  status?: Level,
): Promise<{ total: number; readings: BackendSensorReading[] }> {
  try {
    const params = new URLSearchParams({
      limit: String(limit),
      offset: String(offset),
    });
    if (status) params.append("status", status);

    let res = await fetch(`${API_BASE}/api/sensors/history?${params.toString()}`);
    if (!res.ok) {
      res = await fetch(`${API_BASE}/api/history?${params.toString()}`);
    }
    if (!res.ok) {
      return { total: 0, readings: [] };
    }
    const data = await res.json();
    return {
      total: data.total ?? (Array.isArray(data.readings) ? data.readings.length : 0),
      readings: Array.isArray(data.readings) ? data.readings : [],
    };
  } catch {
    return { total: 0, readings: [] };
  }
}

export async function fetchStatistics(): Promise<BackendStatistics | null> {
  try {
    const res = await fetch(`${API_BASE}/api/statistics`);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function fetchAlerts(limit = 50): Promise<BackendAlertLog[]> {
  try {
    const res = await fetch(`${API_BASE}/api/alerts?limit=${limit}`);
    if (!res.ok) return [];
    return await res.json();
  } catch {
    return [];
  }
}

export async function fetchAiAnalytics(): Promise<BackendAiAnalyticsResponse | null> {
  try {
    const res = await fetch(`${API_BASE}/api/ai/analytics`);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function fetchSafetyStatus(): Promise<BackendSafetyState | null> {
  try {
    const res = await fetch(`${API_BASE}/api/safety/status`);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function ingestSensorReading(payload: {
  ph: number;
  tds: number;
  turbidity: number;
  temperature: number;
  flow: number;
}): Promise<BackendSensorReading | null> {
  try {
    const res = await fetch(`${API_BASE}/api/sensors/data`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const fallback = await fetch(`${API_BASE}/api/sensor-data`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...payload,
          flow_rate: payload.flow,
        }),
      });
      if (!fallback.ok) return null;
      return await fallback.json();
    }
    return await res.json();
  } catch {
    return null;
  }
}

export interface GroqDiagnosisPayload {
  summary: string;
  rootCause: string;
  severityLevel: "CRITICAL" | "WARNING" | "ATTENTION" | "OPTIMAL";
  immediateRemedies: string[];
  preventiveMeasures: string[];
  complianceRisk: string;
  analyzedAt: string;
  model: string;
}

export interface GroqStatusResponse {
  configured: boolean;
  model: string;
  provider: string;
}

export async function fetchGroqStatus(): Promise<GroqStatusResponse | null> {
  try {
    const res = await fetch(`${API_BASE}/api/ai/groq/status`);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function requestGroqDiagnosis(
  telemetry?: Partial<Reading>,
): Promise<{ diagnosis: GroqDiagnosisPayload; telemetry: Record<string, unknown> } | null> {
  try {
    const res = await fetch(`${API_BASE}/api/ai/groq/diagnose`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(telemetry || {}),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function sendGroqCopilotMessage(
  message: string,
  history: Array<{ role: "user" | "assistant" | "system"; content: string }> = [],
): Promise<{ reply: string } | null> {
  try {
    const res = await fetch(`${API_BASE}/api/ai/groq/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, history }),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

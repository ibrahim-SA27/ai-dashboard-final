import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useRef,
  useMemo,
  type ReactNode,
} from "react";
import { type SensorKey, type Level, type Reading, overallStatus, riskScore } from "@/lib/effluent";
import {
  fetchLatestReading,
  fetchHistory,
  fetchStatistics,
  mapBackendToReading,
  type BackendSensorReading,
} from "@/lib/api";
import {
  evaluateSensorFusion,
  type FusionPredictionResult,
  type AlertPriorityLevel,
  type AnomalyState,
  type PredictionState,
  type TrendDirection,
} from "@/lib/ml-engine";

export interface RealtimeSensorContextType {
  values: Record<SensorKey, number> | null;
  latestReading: Reading | null;
  risk: number;
  status: Level;
  // Exact user requirements
  currentStatus: Level;
  riskScore: number;
  valveState: "OPEN" | "CLOSED";
  relayState: "INACTIVE" | "ACTIVE";
  dischargeStatus: "NORMAL" | "BLOCKED";
  lastAlertTime: string | null;

  // Aliases for compatibility
  valve: "OPEN" | "CLOSED";
  relay: "ACTIVE" | "INACTIVE";
  discharge: "ALLOWED" | "BLOCKED";

  // Advanced AI / Machine Learning Engine
  aiHealthScore: number;
  anomalyStatus: AnomalyState;
  anomalyScore: number;
  anomalyDetails: string[];
  predictionStatus: PredictionState;
  predictedRisk5Min: number;
  predictedRisk10Min: number;
  predictedCriticalInMinutes: number | null;
  trendDirection: TrendDirection;
  trendSummary: string;
  trendHeadline: string;
  priorityLevel: AlertPriorityLevel;
  priorityLabel: string;
  isEarlyWarning: boolean;
  mlAnalysis: FusionPredictionResult | null;

  history: Reading[];
  stats: {
    totalAlerts: number;
    criticalEvents: number;
    blockedEvents: number;
    sampleCount: number;
  };
  isConnected: boolean;
  isInitialLoading: boolean;
  lastUpdated: string | null;
  systemMode: "AUTO" | "MANUAL";
  manualCutoff: boolean;
  setSystemMode: (mode: "AUTO" | "MANUAL") => void;
  toggleManualCutoff: () => void;
  resetSafetyInterlock: () => Promise<void>;
  refresh: () => Promise<void>;
}

const RealtimeSensorContext = createContext<RealtimeSensorContextType | null>(null);

export function RealtimeSensorProvider({ children }: { children: ReactNode }) {
  const [latestReading, setLatestReading] = useState<Reading | null>(null);
  const [history, setHistory] = useState<Reading[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [systemMode, setSystemMode] = useState<"AUTO" | "MANUAL">("AUTO");
  const [manualCutoff, setManualCutoff] = useState(false);
  const [lastAlertTime, setLastAlertTime] = useState<string | null>(null);
  const [stats, setStats] = useState({
    totalAlerts: 0,
    criticalEvents: 0,
    blockedEvents: 0,
    sampleCount: 0,
  });

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const processIncomingReading = useCallback((b: BackendSensorReading) => {
    const reading = mapBackendToReading(b);
    setLatestReading(reading);
    setLastUpdated(new Date().toLocaleTimeString([], { hour12: false }));

    if (reading.status === "CRITICAL" || reading.risk >= 70) {
      setLastAlertTime(reading.timestamp || new Date().toISOString());
    }

    setHistory((prev) => {
      // Avoid duplicate consecutive identical IDs
      if (prev.length > 0 && prev[prev.length - 1].id === reading.id && reading.id !== undefined) {
        return prev;
      }
      const updated = [...prev, reading];
      return updated.slice(-100);
    });

    // Update stats
    setStats((prev) => {
      const isCrit = reading.status === "CRITICAL" || reading.risk >= 70;
      return {
        totalAlerts: isCrit ? prev.totalAlerts + 1 : prev.totalAlerts,
        criticalEvents: isCrit ? prev.criticalEvents + 1 : prev.criticalEvents,
        blockedEvents: isCrit ? prev.blockedEvents + 1 : prev.blockedEvents,
        sampleCount: prev.sampleCount + 1,
      };
    });
  }, []);

  const loadInitialData = useCallback(async () => {
    try {
      const [latest, histRes, statsRes] = await Promise.all([
        fetchLatestReading(),
        fetchHistory(60),
        fetchStatistics(),
      ]);

      if (histRes.readings.length > 0) {
        const mapped = histRes.readings
          .slice()
          .reverse()
          .map((r, i) => mapBackendToReading(r, i));
        setHistory(mapped);
      }

      if (latest) {
        processIncomingReading(latest);
      } else if (histRes.readings.length > 0) {
        processIncomingReading(histRes.readings[0]);
      }

      if (statsRes) {
        setStats({
          totalAlerts: statsRes.total_alerts || 0,
          criticalEvents: statsRes.critical_readings_count || 0,
          blockedEvents: statsRes.critical_readings_count || 0,
          sampleCount: statsRes.total_readings || histRes.total || 0,
        });
      }

      // Check alerts endpoint to fetch last alert time if available
      try {
        const alertsRes = await fetch("/api/alerts?limit=1");
        if (alertsRes.ok) {
          const alertData = await alertsRes.json();
          const list = Array.isArray(alertData) ? alertData : alertData?.alerts;
          if (Array.isArray(list) && list.length > 0) {
            setLastAlertTime(list[0].sent_at);
          }
        }
      } catch {
        // Ignored
      }
    } catch {
      // Network/initialization error handled gracefully
    } finally {
      setIsInitialLoading(false);
    }
  }, [processIncomingReading]);

  // Connect to live WebSocket stream
  useEffect(() => {
    let unmounted = false;

    function connectWs() {
      if (unmounted) return;
      if (typeof window === "undefined") return;

      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const host = window.location.host || "localhost:3000";
      const wsUrl = `${protocol}//${host}/ws/realtime`;

      try {
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
          if (unmounted) {
            ws.close();
            return;
          }
          setIsConnected(true);
        };

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            if (data.type === "pong" || data.type === "init") return;

            if (data.type === "DATA_CLEARED") {
              setLatestReading(null);
              setHistory([]);
              setStats({
                totalAlerts: 0,
                criticalEvents: 0,
                blockedEvents: 0,
                sampleCount: 0,
              });
              setLastAlertTime(null);
              return;
            }

            if (data.type === "SAFETY_RESET") {
              if (data.safety_state) {
                setSafetyState(data.safety_state);
              }
              return;
            }

            // Ingest incoming real sensor update
            if (data.ph !== undefined && data.tds !== undefined) {
              processIncomingReading({
                id: data.id ?? Date.now(),
                timestamp: data.timestamp ?? new Date().toISOString(),
                ph: Number(data.ph),
                tds: Number(data.tds),
                turbidity: Number(data.turbidity),
                temperature: Number(data.temperature),
                flow_rate: Number(data.flow_rate ?? data.flow ?? 0),
                flow: Number(data.flow ?? data.flow_rate ?? 0),
                pollution_score: Number(data.pollution_score ?? 0),
                status: data.status,
              });
            }
          } catch {
            // Non-JSON frame
          }
        };

        ws.onerror = () => {
          setIsConnected(false);
        };

        ws.onclose = () => {
          setIsConnected(false);
          wsRef.current = null;
          if (!unmounted) {
            reconnectTimerRef.current = setTimeout(connectWs, 3000);
          }
        };
      } catch {
        setIsConnected(false);
        if (!unmounted) {
          reconnectTimerRef.current = setTimeout(connectWs, 3000);
        }
      }
    }

    connectWs();

    return () => {
      unmounted = true;
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [processIncomingReading]);

  // Initial load
  useEffect(() => {
    loadInitialData();
  }, [loadInitialData]);

  // Values from reading
  const values: Record<SensorKey, number> | null = latestReading
    ? {
        ph: latestReading.ph,
        tds: latestReading.tds,
        turbidity: latestReading.turbidity,
        temperature: latestReading.temperature,
        flow: latestReading.flow,
      }
    : null;

  const status: Level = values ? overallStatus(values) : "SAFE";
  const risk: number = values ? (latestReading?.risk ?? riskScore(values)) : 0;

  // Real Sensor Fusion & ML Evaluation using real database / historical readings
  const mlAnalysis = useMemo<FusionPredictionResult | null>(() => {
    if (!latestReading) return null;
    return evaluateSensorFusion(
      {
        ph: latestReading.ph,
        tds: latestReading.tds,
        turbidity: latestReading.turbidity,
        temperature: latestReading.temperature,
        flow: latestReading.flow,
        timestamp: latestReading.timestamp,
      },
      history.slice(0, -1).map((r) => ({
        ph: r.ph,
        tds: r.tds,
        turbidity: r.turbidity,
        temperature: r.temperature,
        flow: r.flow,
        timestamp: r.timestamp,
      })),
    );
  }, [latestReading, history]);

  const aiHealthScore = mlAnalysis?.currentHealthScore ?? 100;
  const anomalyStatus = mlAnalysis?.anomalyState ?? "NORMAL";
  const anomalyScore = mlAnalysis?.anomalyScore ?? 0;
  const anomalyDetails = mlAnalysis?.anomalyDetails ?? [];
  const predictionStatus = mlAnalysis?.predictionState ?? "SAFE";
  const predictedRisk5Min = mlAnalysis?.predictedRisk5Min ?? 0;
  const predictedRisk10Min = mlAnalysis?.predictedRisk10Min ?? 0;
  const predictedCriticalInMinutes = mlAnalysis?.predictedCriticalInMinutes ?? null;
  const trendDirection = mlAnalysis?.trendDirection ?? "STABLE";
  const trendSummary = mlAnalysis?.trendSummary ?? "Stable baseline readings";
  const trendHeadline = mlAnalysis?.trends?.headline ?? "Normal Operating Stability";
  const priorityLevel = mlAnalysis?.priorityLevel ?? 1;
  const priorityLabel = mlAnalysis?.priorityLabel ?? "LEVEL 1: SAFE";
  const isEarlyWarning = mlAnalysis?.isEarlyWarning ?? false;

  // AUTOMATIC SAFETY ACTIONS:
  // When CRITICAL:
  // 1. status = CRITICAL
  // 2. risk score (0-100)
  // 3. activate relay output -> relayState = "ACTIVE"
  // 4. valve state = CLOSED -> valveState = "CLOSED"
  // 5. discharge status = BLOCKED -> dischargeStatus = "BLOCKED"
  const isEmergency = status === "CRITICAL" || risk >= 70 || priorityLevel === 5 || manualCutoff;
  const valveState: "OPEN" | "CLOSED" = isEmergency ? "CLOSED" : "OPEN";
  const relayState: "INACTIVE" | "ACTIVE" = isEmergency ? "ACTIVE" : "INACTIVE";
  const dischargeStatus: "NORMAL" | "BLOCKED" = isEmergency ? "BLOCKED" : "NORMAL";

  const toggleManualCutoff = useCallback(() => {
    setManualCutoff((prev) => {
      const nextState = !prev;
      // Also notify backend server
      fetch(nextState ? "/api/safety/cutoff" : "/api/safety/reset", { method: "POST" }).catch(
        () => {},
      );
      return nextState;
    });
  }, []);

  const resetSafetyInterlock = useCallback(async () => {
    setManualCutoff(false);
    setSystemMode("AUTO");
    try {
      const res = await fetch("/api/safety/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (res.ok) {
        const data = await res.json();
        if (data.reading) {
          processIncomingReading(data.reading);
        }
      }
    } catch (err) {
      console.warn("Reset error:", err);
    }
  }, [processIncomingReading]);

  return (
    <RealtimeSensorContext.Provider
      value={{
        values,
        latestReading,
        risk,
        status,
        currentStatus: status,
        riskScore: risk,
        valveState,
        relayState,
        dischargeStatus,
        lastAlertTime,
        valve: valveState,
        relay: relayState,
        discharge: isEmergency ? "BLOCKED" : "ALLOWED",
        aiHealthScore,
        anomalyStatus,
        anomalyScore,
        anomalyDetails,
        predictionStatus,
        predictedRisk5Min,
        predictedRisk10Min,
        predictedCriticalInMinutes,
        trendDirection,
        trendSummary,
        trendHeadline,
        priorityLevel,
        priorityLabel,
        isEarlyWarning,
        mlAnalysis,
        history,
        stats,
        isConnected,
        isInitialLoading,
        lastUpdated,
        systemMode,
        manualCutoff,
        setSystemMode,
        toggleManualCutoff,
        resetSafetyInterlock,
        refresh: loadInitialData,
      }}
    >
      {children}
    </RealtimeSensorContext.Provider>
  );
}

export function useRealtimeSensors(): RealtimeSensorContextType {
  const ctx = useContext(RealtimeSensorContext);
  if (!ctx) {
    throw new Error("useRealtimeSensors must be used within RealtimeSensorProvider");
  }
  return ctx;
}

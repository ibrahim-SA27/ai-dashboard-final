try {
  process.loadEnvFile?.();
} catch {
  // .env is optional or already in environment
}

import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";
import { sensorDbStore } from "./lib/db-store";
import type { Level } from "./lib/effluent";
import {
  ensureDatabaseSchema,
  persistSensorReading,
  getLatestSensorReading,
  getSensorReadingHistory,
  getSensorStatistics,
  getAlertLogs,
  querySensorReadingsForExport,
  formatSensorReadingsCsv,
} from "./lib/postgres";
import {
  handleRegister,
  handleLogin,
  handleRefreshToken,
  handleGetMe,
  handleChangePassword,
} from "./lib/auth-service";
import { realtimeBroadcaster } from "./lib/realtime-broadcaster";
import { dispatchSafetyAlertEmail } from "./lib/email-notifier";
import {
  isGroqConfigured,
  generateEffluentDiagnosis,
  chatWithPlantCopilot,
  type TelemetryContext,
  type GroqDiagnosisResult,
} from "./lib/groq-service";

// Initialize PostgreSQL schema against Supabase Postgres on server boot
ensureDatabaseSchema().catch((err) => {
  console.error("[Fatal]: Failed to connect or initialize Supabase Postgres schema:", err.message);
});

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m.default ?? m) as ServerEntry,
    );
  }
  return serverEntryPromise;
}

// Global cache for the latest Groq root-cause diagnosis
let latestGroqDiagnosis: GroqDiagnosisResult | null = null;

// JSON response helper
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });

// Handle API requests directly
async function handleApiRequest(request: Request, url: URL): Promise<Response | null> {
  const pathname = url.pathname;
  const method = request.method;

  if (method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
      },
    });
  }

  // 1. Health check
  if (pathname === "/api/health") {
    const stats = await getSensorStatistics().catch(() => sensorDbStore.getStatistics());
    return json({
      status: "healthy",
      database: "Supabase PostgreSQL",
      timestamp: new Date().toISOString(),
      total_readings: stats.total_readings,
      safety_state: sensorDbStore.getSafetyState(),
      groq_enabled: isGroqConfigured(),
    });
  }

  // 2. JWT Authentication Routes (matching both /api/* and /api/auth/*)
  if ((pathname === "/api/register" || pathname === "/api/auth/register") && method === "POST") {
    try {
      const body = await request.json();
      const res = await handleRegister(body);
      return json(res.data || { error: res.error }, res.status);
    } catch {
      return json({ error: "Invalid JSON body" }, 400);
    }
  }

  if ((pathname === "/api/login" || pathname === "/api/auth/login") && method === "POST") {
    try {
      const body = await request.json();
      const res = await handleLogin(body);
      return json(res.data || { error: res.error }, res.status);
    } catch {
      return json({ error: "Invalid JSON body" }, 400);
    }
  }

  if ((pathname === "/api/refresh" || pathname === "/api/auth/refresh") && method === "POST") {
    try {
      const body = await request.json();
      const res = await handleRefreshToken(body.refresh_token || "");
      return json(res.data || { error: res.error }, res.status);
    } catch {
      return json({ error: "Invalid JSON body" }, 400);
    }
  }

  if ((pathname === "/api/me" || pathname === "/api/auth/me") && method === "GET") {
    const authHeader = request.headers.get("Authorization");
    const res = await handleGetMe(authHeader);
    return json(res.data || { error: res.error }, res.status);
  }

  if (
    (pathname === "/api/change-password" || pathname === "/api/auth/change-password") &&
    method === "POST"
  ) {
    try {
      const authHeader = request.headers.get("Authorization");
      const body = await request.json();
      const res = await handleChangePassword(authHeader, body);
      return json(res.data || { error: res.error }, res.status);
    } catch {
      return json({ error: "Invalid JSON body" }, 400);
    }
  }

  // 3. Safety System Status & SCADA Controls
  if (pathname === "/api/safety/status" && method === "GET") {
    return json(sensorDbStore.getSafetyState());
  }

  if (pathname === "/api/safety/cutoff" && method === "POST") {
    const updated = sensorDbStore.setManualValve("CLOSED");
    return json(updated);
  }

  if (pathname === "/api/safety/reset" && method === "POST") {
    const safetyState = sensorDbStore.resetSafetyInterlock();

    // Broadcast updated safety state to connected WebSocket clients
    realtimeBroadcaster.broadcast({
      type: "SAFETY_RESET",
      safety_state: safetyState,
      valve_state: "OPEN",
      relay_state: "INACTIVE",
      discharge_status: "NORMAL",
    });

    return json({
      status: "success",
      message: "Safety interlock reset; normal discharge authorized.",
      safety_state: safetyState,
    });
  }

  // Clear all sensor readings (for maintenance or testing cleanup)
  if (pathname === "/api/sensors/clear" && method === "POST") {
    try {
      const pool = (await import("./lib/postgres")).getPostgresPool();
      await pool.query("DELETE FROM alert_logs");
      await pool.query("DELETE FROM sensor_readings");
      sensorDbStore.clearAll();

      realtimeBroadcaster.broadcast({
        type: "DATA_CLEARED",
        message: "All sensor readings have been cleared.",
      });

      return json({ status: "success", message: "All sensor readings and alert logs cleared." });
    } catch (err) {
      return json({ error: "Failed to clear readings" }, 500);
    }
  }

  // 4. Email Receivers status (from server-side env)
  if (pathname === "/api/settings/receivers" && method === "GET") {
    const raw = process.env.EMAIL_RECEIVERS || "";
    const list = raw
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0 && s.includes("@"));
    return json({
      configured: list.length > 0,
      count: list.length,
      receivers: list,
      enabled: (process.env.ENABLE_EMAIL_ALERTS || "true").toLowerCase() !== "false",
      location:
        process.env.PLANT_LOCATION || "Industrial Effluent Treatment Outfall - Monitoring Zone 1",
    });
  }

  // 5. Sensor Data Ingestion Endpoint (POST from SCADA / ESP32 / Simulator)
  if (
    (pathname === "/api/sensors/data" ||
      pathname === "/api/sensor-data" ||
      pathname === "/api/sensor/data" ||
      pathname === "/api/reading") &&
    method === "POST"
  ) {
    try {
      const body = await request.json();
      if (
        body.ph === undefined ||
        body.tds === undefined ||
        body.turbidity === undefined ||
        body.temperature === undefined
      ) {
        return json(
          { error: "Missing required sensor fields (ph, tds, turbidity, temperature)" },
          400,
        );
      }

      const phVal = Number(body.ph);
      const tdsVal = Number(body.tds);
      const turbVal = Number(body.turbidity);
      const tempVal = Number(body.temperature);
      const flowVal = body.flow !== undefined ? Number(body.flow) : Number(body.flow_rate ?? 0);

      // In-memory store handles evaluation, ML sensor fusion, and local state
      const memoryReading = sensorDbStore.addReading({
        ph: phVal,
        tds: tdsVal,
        turbidity: turbVal,
        temperature: tempVal,
        flow: flowVal,
        flow_rate: flowVal,
      });

      // Persist in Supabase Postgres
      let persistedId = memoryReading.id;
      let persistedTimestamp = memoryReading.timestamp;
      try {
        const saved = await persistSensorReading({
          ph: phVal,
          tds: tdsVal,
          turbidity: turbVal,
          temperature: tempVal,
          flow_rate: flowVal,
          pollution_score: memoryReading.pollution_score,
          status: memoryReading.status,
        });
        persistedId = saved.id;
        persistedTimestamp =
          typeof saved.timestamp === "string" ? saved.timestamp : saved.timestamp.toISOString();
      } catch (dbErr) {
        console.error("[PostgreSQL Error]: Could not persist sensor reading to Supabase:", dbErr);
      }

      const wsPayload = {
        ...memoryReading,
        id: persistedId,
        timestamp: persistedTimestamp,
      };

      // 5. Alert Policy: Alerts stay quiet during normal operation.
      // Only fire WebSocket alert event + Gmail email via EMAIL_RECEIVERS when pollution_score >= DEFAULT_CRITICAL_THRESHOLD.
      const criticalThreshold = Number(process.env.DEFAULT_CRITICAL_THRESHOLD || 75.0);
      const isCritical = memoryReading.pollution_score >= criticalThreshold;

      if (isCritical) {
        // Broadcast WebSocket alert event
        realtimeBroadcaster.broadcast({
          ...wsPayload,
          alert_event: true,
          type: "CRITICAL_ALERT",
          alert_type: "CRITICAL_POLLUTION",
          alert_message: `CRITICAL ALERT: Effluent pollution score ${memoryReading.pollution_score.toFixed(1)} exceeded safety threshold (${criticalThreshold}). Emergency cutoff triggered.`,
        });

        // Trigger Groq AI root-cause diagnosis
        if (isGroqConfigured()) {
          const telemetry: TelemetryContext = {
            ph: phVal,
            tds: tdsVal,
            turbidity: turbVal,
            temperature: tempVal,
            flow: flowVal,
            status: memoryReading.status,
            riskScore: memoryReading.pollution_score,
            valve: memoryReading.valve_state,
            discharge: memoryReading.discharge_status === "BLOCKED" ? "BLOCKED" : "ALLOWED",
          };
          const ml = sensorDbStore.getMlAnalysis();
          const safety = sensorDbStore.getSafetyState();

          generateEffluentDiagnosis(telemetry, ml, safety)
            .then((diagnosis) => {
              latestGroqDiagnosis = diagnosis;
              console.info(
                `[Groq AI]: Root cause diagnosis generated for threshold breach (Score: ${memoryReading.pollution_score.toFixed(1)})`,
              );
            })
            .catch((err) => {
              console.warn("[Groq AI Error]: Diagnosis generation failed:", err);
            });
        }

        // Send Email Alert: When ENABLE_EMAIL_ALERTS is true
        const isEmailEnabled =
          (process.env.ENABLE_EMAIL_ALERTS || "true").toLowerCase() !== "false";
        if (isEmailEnabled) {
          const actionMsg =
            "Automatic Emergency Shutdown Triggered: Discharge Solenoid Valve Closed, Safety Relay Activated, Effluent Outflow Blocked to prevent environmental contamination.";

          dispatchSafetyAlertEmail({
            readingId: persistedId,
            severity: "CRITICAL",
            priorityLevel: 5,
            priorityLabel: "LEVEL 5: CRITICAL",
            riskScore: memoryReading.pollution_score,
            valveState: "CLOSED",
            relayStatus: "ACTIVATED",
            dischargeStatus: "BLOCKED",
            timestamp: persistedTimestamp,
            readings: {
              ph: phVal,
              tds: tdsVal,
              turbidity: turbVal,
              temperature: tempVal,
              flow: flowVal,
            },
            safetyAction: actionMsg,
          }).catch((err) => {
            console.error("[Email Alert Error]: Failed to dispatch SMTP alert:", err);
          });
        }
      } else {
        // Normal/safe operation: Quiet mode.
        // Broadcast telemetry update only. No alerts, no emails.
        realtimeBroadcaster.broadcast(wsPayload);
      }

      return json(wsPayload, 201);
    } catch {
      return json({ error: "Invalid JSON body" }, 400);
    }
  }

  // 6. Current latest sensor reading
  if (
    (pathname === "/api/sensors/current" ||
      pathname === "/api/latest-reading" ||
      pathname === "/api/latest") &&
    method === "GET"
  ) {
    // Check postgres first, fall back to memory
    try {
      const dbRow = await getLatestSensorReading();
      if (dbRow) {
        const safety = sensorDbStore.getSafetyState();
        return json({
          id: dbRow.id,
          timestamp:
            typeof dbRow.timestamp === "string" ? dbRow.timestamp : dbRow.timestamp.toISOString(),
          ph: dbRow.ph,
          tds: dbRow.tds,
          turbidity: dbRow.turbidity,
          temperature: dbRow.temperature,
          flow: dbRow.flow_rate,
          flow_rate: dbRow.flow_rate,
          pollution_score: dbRow.pollution_score,
          status: dbRow.status,
          valve_state: safety.valveState,
          relay_state: safety.relayState,
          discharge_status: safety.dischargeStatus,
        });
      }
    } catch (err) {
      console.warn("[PostgreSQL]: getLatest fallback to memory:", err);
    }

    const latest = sensorDbStore.getLatest();
    if (!latest) {
      return new Response(null, { status: 204 });
    }
    return json(latest);
  }

  // 7. Server-Sent Events (SSE) live telemetry stream
  if (
    (pathname === "/api/sensors/stream" || pathname === "/api/realtime/stream") &&
    method === "GET"
  ) {
    const clientId = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        realtimeBroadcaster.addSseClient(clientId, controller);
      },
      cancel() {
        realtimeBroadcaster.removeSseClient(clientId);
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "Access-Control-Allow-Origin": "*",
      },
    });
  }

  // 8. History endpoint (backed by Supabase Postgres)
  if ((pathname === "/api/sensors/history" || pathname === "/api/history") && method === "GET") {
    const limit = Number(url.searchParams.get("limit") || 50);
    const offset = Number(url.searchParams.get("offset") || 0);
    const statusParam = url.searchParams.get("status") || undefined;

    try {
      const historyData = await getSensorReadingHistory(limit, offset, statusParam);
      return json({
        readings: historyData.readings.map((r) => ({
          ...r,
          flow: r.flow_rate,
          timestamp: typeof r.timestamp === "string" ? r.timestamp : r.timestamp.toISOString(),
        })),
        total: historyData.total,
        limit,
        offset,
      });
    } catch (err) {
      console.warn("[Postgres History fallback to memory]:", err);
      const memHistory = sensorDbStore.getHistory(limit, offset, statusParam as Level);
      return json(memHistory);
    }
  }

  // 8b. CSV Sensor Readings Export endpoint (backed by Supabase Postgres)
  if (
    (pathname === "/api/sensors/export" ||
      pathname === "/api/export/csv" ||
      pathname === "/api/export") &&
    method === "GET"
  ) {
    const statusParam = url.searchParams.get("status") || undefined;
    const startDate =
      url.searchParams.get("startDate") || url.searchParams.get("start") || undefined;
    const endDate = url.searchParams.get("endDate") || url.searchParams.get("end") || undefined;
    const format = url.searchParams.get("format") || "csv";

    try {
      const rows = await querySensorReadingsForExport({
        status: statusParam,
        startDate,
        endDate,
      });

      if (format === "json") {
        return json({
          total: rows.length,
          readings: rows.map((r) => ({
            ...r,
            timestamp: typeof r.timestamp === "string" ? r.timestamp : r.timestamp.toISOString(),
          })),
        });
      }

      // Format CSV with columns for timestamp, ph, tds, turbidity, temperature, flow_rate, pollution_score, and status
      const csvContent = formatSensorReadingsCsv(rows);

      return new Response(csvContent, {
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="sensor_readings_${(statusParam || "all").toLowerCase()}_${Date.now()}.csv"`,
          "Access-Control-Allow-Origin": "*",
        },
      });
    } catch (err) {
      console.error("[Export CSV Error]:", err);
      return json({ error: "Failed to export sensor readings" }, 500);
    }
  }

  // 8c. Dedicated Report Download Endpoint (Supabase Postgres -> Filter -> CSV Output)
  if (
    (pathname === "/api/reports/download" ||
      pathname === "/api/reports/export" ||
      pathname === "/api/reports/sensor-readings") &&
    method === "GET"
  ) {
    const statusParam = url.searchParams.get("status") || undefined;
    const startDate =
      url.searchParams.get("startDate") || url.searchParams.get("start") || undefined;
    const endDate = url.searchParams.get("endDate") || url.searchParams.get("end") || undefined;
    const minScoreParam = url.searchParams.get("minScore");
    const minScore = minScoreParam ? parseFloat(minScoreParam) : undefined;
    const maxScoreParam = url.searchParams.get("maxScore");
    const maxScore = maxScoreParam ? parseFloat(maxScoreParam) : undefined;
    const limitParam = url.searchParams.get("limit");
    const limit = limitParam ? parseInt(limitParam, 10) : 50000;

    try {
      let rows = await querySensorReadingsForExport({
        status: statusParam,
        startDate,
        endDate,
        minScore,
        maxScore,
        limit,
      });

      // Fallback to in-memory store if database temporarily yields no rows but in-memory has telemetry
      if (rows.length === 0) {
        const memReadings = sensorDbStore.getHistory(limit, 0, statusParam as Level);
        if (memReadings.length > 0) {
          rows = memReadings.map((m) => ({
            id: m.id,
            timestamp: m.timestamp,
            ph: m.ph,
            tds: m.tds,
            turbidity: m.turbidity,
            temperature: m.temperature,
            flow_rate: m.flow_rate ?? m.flow,
            pollution_score: m.pollution_score,
            status: m.status,
          }));
        }
      }

      const csvContent = formatSensorReadingsCsv(rows);
      const label = (statusParam || "all").toLowerCase();
      const filename = `effluent_sensor_report_${label}_${Date.now()}.csv`;

      return new Response(csvContent, {
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="${filename}"`,
          "Access-Control-Allow-Origin": "*",
          "Cache-Control": "no-cache, no-store, must-revalidate",
        },
      });
    } catch (err) {
      console.error("[Report Download API Error]:", err);
      return json({ error: "Failed to generate report from Supabase database" }, 500);
    }
  }

  // 9. Statistics / Analytics endpoint (backed by Supabase Postgres)
  if ((pathname === "/api/statistics" || pathname === "/api/analytics") && method === "GET") {
    try {
      const stats = await getSensorStatistics();
      return json(stats);
    } catch {
      const stats = sensorDbStore.getStatistics();
      return json(stats);
    }
  }

  // 10. Alerts endpoint (backed by Supabase Postgres alert_logs table)
  if (pathname === "/api/alerts" && method === "GET") {
    const limit = Number(url.searchParams.get("limit") || 50);
    const offset = Number(url.searchParams.get("offset") || 0);
    try {
      const alerts = await getAlertLogs(limit, offset);
      return json({
        alerts: alerts.map((a) => ({
          ...a,
          sent_at: typeof a.sent_at === "string" ? a.sent_at : a.sent_at.toISOString(),
        })),
        limit,
        offset,
      });
    } catch {
      const alerts = sensorDbStore.getAlerts(limit, offset);
      return json(alerts);
    }
  }

  // 11. AI Sensor Fusion, Predictive Analytics & Groq Explanation
  if (
    (pathname === "/api/ai/analytics" ||
      pathname === "/api/ai-analytics" ||
      pathname === "/api/ai/analysis" ||
      pathname === "/api/ai/explain") &&
    method === "GET"
  ) {
    const ml = sensorDbStore.getMlAnalysis();
    const safety = sensorDbStore.getSafetyState();
    const latest = sensorDbStore.getLatest();
    let aiExplanation = latestGroqDiagnosis;

    const wantsExplanation =
      url.searchParams.get("explain") === "true" || pathname === "/api/ai/explain";

    if (wantsExplanation && isGroqConfigured() && latest) {
      try {
        aiExplanation = await generateEffluentDiagnosis(
          {
            ph: latest.ph,
            tds: latest.tds,
            turbidity: latest.turbidity,
            temperature: latest.temperature,
            flow: latest.flow_rate ?? latest.flow ?? 0,
            status: safety.currentStatus,
            riskScore: safety.riskScore,
            valve: safety.valveState,
            discharge: safety.dischargeStatus === "BLOCKED" ? "BLOCKED" : "ALLOWED",
          },
          ml,
          safety,
        );
        latestGroqDiagnosis = aiExplanation;
      } catch (err) {
        console.warn("Groq explanation generation error:", err);
      }
    }

    return json({
      ai_analysis: ml,
      safety_state: safety,
      ai_explanation: aiExplanation,
      groq_enabled: isGroqConfigured(),
      timestamp: new Date().toISOString(),
    });
  }

  // 12. Groq AI Status
  if (pathname === "/api/ai/groq/status" && method === "GET") {
    return json({
      configured: isGroqConfigured(),
      model: "qwen/qwen3.8-27b",
      provider: "Groq LPU Inference Engine",
      critical_threshold: Number(process.env.DEFAULT_CRITICAL_THRESHOLD || 75.0),
    });
  }

  // 13. Groq AI Chemical & SCADA Effluent Diagnosis
  if (pathname === "/api/ai/groq/diagnose" && method === "POST") {
    try {
      if (!isGroqConfigured()) {
        return json({ error: "GROQ_API_KEY is not configured on the server." }, 503);
      }

      const body = await request.json().catch(() => ({}));
      const latest = sensorDbStore.getLatest();
      const safety = sensorDbStore.getSafetyState();
      const ml = sensorDbStore.getMlAnalysis();

      const telemetry: TelemetryContext = {
        ph: body.ph !== undefined ? Number(body.ph) : (latest?.ph ?? 7.0),
        tds: body.tds !== undefined ? Number(body.tds) : (latest?.tds ?? 420),
        turbidity:
          body.turbidity !== undefined ? Number(body.turbidity) : (latest?.turbidity ?? 8.5),
        temperature:
          body.temperature !== undefined ? Number(body.temperature) : (latest?.temperature ?? 28),
        flow:
          body.flow !== undefined ? Number(body.flow) : (latest?.flow_rate ?? latest?.flow ?? 12),
        status: body.status || safety.currentStatus,
        riskScore: body.riskScore !== undefined ? Number(body.riskScore) : safety.riskScore,
        valve: safety.valveState,
        discharge: safety.dischargeStatus === "BLOCKED" ? "BLOCKED" : "ALLOWED",
      };

      const diagnosis = await generateEffluentDiagnosis(telemetry, ml, safety);
      latestGroqDiagnosis = diagnosis;
      return json({ diagnosis, telemetry });
    } catch (err: unknown) {
      console.error("Groq diagnosis error:", err);
      const msg = err instanceof Error ? err.message : "Diagnosis failed";
      return json({ error: msg }, 500);
    }
  }

  // 14. Groq AI SCADA Plant Copilot Chat
  if (pathname === "/api/ai/groq/chat" && method === "POST") {
    try {
      if (!isGroqConfigured()) {
        return json({ error: "GROQ_API_KEY is not configured on the server." }, 503);
      }

      const body = (await request.json().catch(() => ({}))) as {
        message?: string;
        history?: Array<{ role: "user" | "assistant" | "system"; content: string }>;
      };

      if (!body.message || typeof body.message !== "string") {
        return json({ error: "Missing message in request body" }, 400);
      }

      const latest = sensorDbStore.getLatest();
      const safety = sensorDbStore.getSafetyState();
      const ml = sensorDbStore.getMlAnalysis();

      const telemetry: TelemetryContext | null = latest
        ? {
            ph: latest.ph,
            tds: latest.tds,
            turbidity: latest.turbidity,
            temperature: latest.temperature,
            flow: latest.flow_rate ?? latest.flow ?? 0,
            status: safety.currentStatus,
            riskScore: safety.riskScore,
            valve: safety.valveState,
            discharge: safety.dischargeStatus === "BLOCKED" ? "BLOCKED" : "ALLOWED",
          }
        : null;

      const reply = await chatWithPlantCopilot(body.message, body.history || [], {
        telemetry,
        fusion: ml,
        safetyState: safety,
      });

      return json({ reply, timestamp: new Date().toISOString() });
    } catch (err: unknown) {
      console.error("Groq copilot error:", err);
      const msg = err instanceof Error ? err.message : "Copilot failed";
      return json({ error: msg }, 500);
    }
  }

  return null;
}

// h3 error normalization
async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!isH3SwallowedErrorBody(body)) return response;

  console.error(consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`));
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function isH3SwallowedErrorBody(body: string): boolean {
  try {
    const payload = JSON.parse(body) as { unhandled?: unknown; message?: unknown };
    return payload.unhandled === true && payload.message === "HTTPError";
  } catch {
    return false;
  }
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    try {
      const url = new URL(request.url);
      if (url.pathname.startsWith("/api/")) {
        const apiResponse = await handleApiRequest(request, url);
        if (apiResponse) return apiResponse;
      }

      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      return await normalizeCatastrophicSsrResponse(response);
    } catch (error) {
      console.error(error);
      return new Response(renderErrorPage(), {
        status: 500,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }
  },
};

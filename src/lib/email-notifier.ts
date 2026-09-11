import nodemailer from "nodemailer";
import { persistAlertLog } from "./postgres";

export interface AlertEmailPayload {
  readingId?: number | null;
  severity: "CRITICAL" | "WARNING" | "ANOMALY" | "PREDICTION";
  riskScore: number;
  priorityLevel?: number;
  priorityLabel?: string;
  aiHealthScore?: number;
  trendAnalysis?: string;
  predictedRisk?: {
    risk5Min: number;
    risk10Min: number;
    predictionState: string;
  };
  anomalyDetails?: string[];
  valveState: "OPEN" | "CLOSED";
  relayStatus: "INACTIVE" | "ACTIVATED";
  dischargeStatus: "NORMAL" | "BLOCKED";
  location?: string;
  timestamp: string;
  readings: {
    ph: number;
    tds: number;
    turbidity: number;
    temperature: number;
    flow: number;
  };
  safetyAction: string;
}

export function isEmailAlertsEnabled(): boolean {
  const val = process.env.ENABLE_EMAIL_ALERTS;
  if (!val) return true;
  const clean = val.trim().toLowerCase();
  return clean === "true" || clean === "1" || clean === "yes";
}

export function getEmailReceivers(): string[] {
  const raw = process.env.EMAIL_RECEIVERS || "";
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && s.includes("@"));
}

export function formatSafetyAlertEmail(data: AlertEmailPayload): {
  subject: string;
  text: string;
} {
  const location =
    data.location ||
    process.env.PLANT_LOCATION ||
    "Industrial Effluent Treatment Outfall - Monitoring Zone 1";

  const priorityBadge = data.priorityLabel
    ? `[${data.priorityLabel.toUpperCase()}]`
    : `[SEVERITY: ${data.severity}]`;

  const subject = `🚨 EFFLUENT AI DASHBOARD - ${priorityBadge} SAFETY ALERT`;

  const trendSection = data.trendAnalysis ? `\nTREND ANALYSIS:\n- ${data.trendAnalysis}\n` : "";

  const predictionSection = data.predictedRisk
    ? `PREDICTIVE RISK FORECAST:\n- Status: ${data.predictedRisk.predictionState}\n- 5-Min Horizon Projected Risk: ${data.predictedRisk.risk5Min}/100\n- 10-Min Horizon Projected Risk: ${data.predictedRisk.risk10Min}/100\n`
    : "";

  const anomalySection =
    data.anomalyDetails && data.anomalyDetails.length > 0
      ? `ANOMALY DETECTION DETAILS:\n${data.anomalyDetails.map((d) => `- ${d}`).join("\n")}\n\n`
      : "";

  const healthScoreLine =
    data.aiHealthScore !== undefined ? `[AI HEALTH SCORE]: ${data.aiHealthScore}/100\n` : "";

  const text = `[SEVERITY LEVEL]: ${data.severity}
[ALERT PRIORITY]: ${data.priorityLabel || data.severity}
${healthScoreLine}[POLLUTION RISK SCORE]: ${Math.round(data.riskScore)}/100
[VALVE STATE]: ${data.valveState}
[RELAY STATUS]: ${data.relayStatus}
[DISCHARGE STATUS]: ${data.dischargeStatus}
[LOCATION]: ${location}
[TIMESTAMP]: ${data.timestamp}

CURRENT SENSOR READINGS:
- pH: ${data.readings.ph.toFixed(2)}
- TDS: ${data.readings.tds.toFixed(0)} ppm
- Turbidity: ${data.readings.turbidity.toFixed(0)} NTU
- Temperature: ${data.readings.temperature.toFixed(1)} °C
- Flow: ${data.readings.flow.toFixed(1)} L/min
${trendSection}
${predictionSection}
${anomalySection}SAFETY ACTION PERFORMED:
${data.safetyAction}
`;

  return { subject, text };
}

let transporterInstance: nodemailer.Transporter | null = null;

function getTransporter(): nodemailer.Transporter | null {
  const host = process.env.SMTP_HOST || "smtp.gmail.com";
  const port = parseInt(process.env.SMTP_PORT || "587", 10);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASSWORD;

  if (!user || !pass || pass.startsWith("YOUR_") || pass.includes("APP_PASSWORD")) {
    return null;
  }

  if (!transporterInstance) {
    transporterInstance = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: {
        user,
        pass,
      },
    });
  }

  return transporterInstance;
}

export async function dispatchSafetyAlertEmail(
  payload: AlertEmailPayload,
): Promise<{ sent: boolean; receivers: string[]; logMessage: string }> {
  if (!isEmailAlertsEnabled()) {
    const msg = "[SAFETY ALERT] Skipped email dispatch: ENABLE_EMAIL_ALERTS is false.";
    console.info(msg);
    return { sent: false, receivers: [], logMessage: msg };
  }

  const receivers = getEmailReceivers();
  const { subject, text } = formatSafetyAlertEmail(payload);

  if (receivers.length === 0) {
    const msg = `[SAFETY ALERT] Triggered with risk ${payload.riskScore}/100. No recipients configured in EMAIL_RECEIVERS.`;
    console.warn(msg);
    return { sent: false, receivers: [], logMessage: msg };
  }

  const transporter = getTransporter();

  // Log in Supabase Postgres alert_logs table
  for (const receiver of receivers) {
    try {
      await persistAlertLog({
        reading_id: payload.readingId ?? null,
        receiver_email: receiver,
        alert_type: payload.severity === "CRITICAL" ? "CRITICAL_POLLUTION" : "ABNORMAL_DISCHARGE",
        message: text,
      });
    } catch (dbErr) {
      console.warn("[Database]: Failed to persist alert log to Supabase Postgres:", dbErr);
    }
  }

  if (!transporter) {
    const logMsg = `[SIMULATED DISPATCH] Alert email formatted for ${receivers.join(", ")} (SMTP_USER/SMTP_PASSWORD not configured).`;
    console.info(logMsg);
    console.info(`Subject: ${subject}\n${text}`);
    return { sent: true, receivers, logMessage: logMsg };
  }

  try {
    const fromAddress =
      process.env.SMTP_FROM_EMAIL ||
      process.env.SMTP_USER ||
      "effluent-safety-system@plant.internal";

    await transporter.sendMail({
      from: `"Effluent Safety SCADA" <${fromAddress}>`,
      to: receivers.join(", "),
      subject,
      text,
    });

    const successMsg = `Safety alert email successfully dispatched via Gmail SMTP to: ${receivers.join(", ")}`;
    console.info(successMsg);
    return { sent: true, receivers, logMessage: successMsg };
  } catch (err) {
    const errorMsg = `Failed to deliver safety alert email via SMTP: ${err instanceof Error ? err.message : String(err)}`;
    console.error(errorMsg);
    return { sent: false, receivers, logMessage: errorMsg };
  }
}

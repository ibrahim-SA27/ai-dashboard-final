import type { FusionPredictionResult } from "./ml-engine";
import type { BackendSafetyState } from "./api";

export interface GroqDiagnosisResult {
  summary: string;
  rootCause: string;
  severityLevel: "CRITICAL" | "WARNING" | "ATTENTION" | "OPTIMAL";
  immediateRemedies: string[];
  preventiveMeasures: string[];
  complianceRisk: string;
  analyzedAt: string;
  model: string;
}

export interface TelemetryContext {
  ph: number;
  tds: number;
  turbidity: number;
  temperature: number;
  flow: number;
  status: string;
  riskScore: number;
  valve: string;
  discharge: string;
}

const DEFAULT_MODEL = "qwen/qwen3.8-27b";

export function getGroqApiKey(): string | null {
  return process.env.GROQ_API_KEY?.trim() || null;
}

export function isGroqConfigured(): boolean {
  const key = getGroqApiKey();
  return Boolean(key && key.startsWith("gsk_"));
}

export async function generateEffluentDiagnosis(
  telemetry: TelemetryContext,
  fusionResult: FusionPredictionResult | null,
  safetyState?: BackendSafetyState | null,
): Promise<GroqDiagnosisResult> {
  const apiKey = getGroqApiKey();
  if (!apiKey) {
    throw new Error("GROQ_API_KEY environment variable is not configured on the server.");
  }

  const prompt = `You are a Senior Industrial Wastewater Process Engineer and SCADA Automation Specialist.
Analyze the following real-time telemetry from an industrial effluent monitoring and treatment plant:

Telemetry Readings:
- pH: ${telemetry.ph.toFixed(2)} (Standard Safe Range: 6.5 - 8.5)
- Total Dissolved Solids (TDS): ${telemetry.tds.toFixed(0)} ppm (Threshold: ≤ 500 ppm safe, > 750 ppm warning, > 1000 ppm critical)
- Turbidity: ${telemetry.turbidity.toFixed(1)} NTU (Threshold: ≤ 10 NTU safe, > 25 NTU critical)
- Temperature: ${telemetry.temperature.toFixed(1)} °C (Threshold: ≤ 35 °C safe, > 40 °C critical)
- Flow Rate: ${telemetry.flow.toFixed(1)} m³/h
- Plant Risk Score: ${telemetry.riskScore}/100
- Safety Status: ${telemetry.status}
- Automated Cutoff Valve: ${telemetry.valve}
- Outfall Discharge: ${telemetry.discharge}

AI Sensor Fusion Analytics:
- Composite Health: ${fusionResult?.currentHealthScore ?? 100}/100
- Anomaly State: ${fusionResult?.anomalyState ?? "NORMAL"}
- Anomaly Triggers: ${fusionResult?.anomalyDetails?.join(", ") || "None"}
- 5-Min Predicted Risk: ${fusionResult?.predictedRisk5Min ?? 0}/100
- 10-Min Predicted Risk: ${fusionResult?.predictedRisk10Min ?? 0}/100
- Trend Momentum: ${fusionResult?.trendDirection ?? "STABLE"} (${fusionResult?.trends?.headline ?? "Stable"})

Respond strictly in valid JSON format without markdown wrapping, matching this exact schema:
{
  "summary": "1-2 sentence executive overview of effluent conditions",
  "rootCause": "Detailed technical root cause analysis explaining which physical or chemical process failure is occurring (e.g., neutralizing reagent depletion, clarifier overload, heat exchanger leak, coagulant under-dosing)",
  "severityLevel": "CRITICAL" | "WARNING" | "ATTENTION" | "OPTIMAL",
  "immediateRemedies": [
    "3-4 prioritized, actionable tactical steps for operators (e.g., chemical dosing adjustments, valve throttle, flocculator bypass)"
  ],
  "preventiveMeasures": [
    "2-3 long-term operational or maintenance engineering recommendations"
  ],
  "complianceRisk": "Assessment of legal environmental discharge statutory limits (CPCB/EPA/ISO 14001)"
}`;

  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: DEFAULT_MODEL,
      messages: [
        {
          role: "system",
          content:
            "You are an industrial wastewater process automation engineer. Always return valid JSON only without codeblock ticks.",
        },
        { role: "user", content: prompt },
      ],
      temperature: 0.1,
      response_format: { type: "json_object" },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Groq API error (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  const rawContent = data.choices?.[0]?.message?.content || "{}";

  try {
    const cleaned = rawContent.replace(/^```json\s*/, "").replace(/\s*```$/, "");
    const parsed = JSON.parse(cleaned);

    return {
      summary: parsed.summary || "Effluent analysis completed.",
      rootCause: parsed.rootCause || "Normal operating parameters observed.",
      severityLevel: parsed.severityLevel || (telemetry.riskScore > 70 ? "CRITICAL" : "OPTIMAL"),
      immediateRemedies: Array.isArray(parsed.immediateRemedies)
        ? parsed.immediateRemedies
        : ["Continue routine SCADA sensor surveillance."],
      preventiveMeasures: Array.isArray(parsed.preventiveMeasures)
        ? parsed.preventiveMeasures
        : ["Maintain scheduled calibration cycles."],
      complianceRisk:
        parsed.complianceRisk || "Discharge parameters currently comply with standards.",
      analyzedAt: new Date().toISOString(),
      model: data.model || DEFAULT_MODEL,
    };
  } catch (err) {
    return {
      summary: "Processed telemetry analysis.",
      rootCause: rawContent.slice(0, 300),
      severityLevel: telemetry.riskScore > 70 ? "CRITICAL" : "WARNING",
      immediateRemedies: ["Review sensor readings and verify calibration."],
      preventiveMeasures: ["Regular sensor maintenance."],
      complianceRisk: "Review local environmental regulations.",
      analyzedAt: new Date().toISOString(),
      model: DEFAULT_MODEL,
    };
  }
}

export async function chatWithPlantCopilot(
  userMessage: string,
  history: Array<{ role: "user" | "assistant" | "system"; content: string }>,
  currentContext: {
    telemetry: TelemetryContext | null;
    fusion: FusionPredictionResult | null;
    safetyState?: BackendSafetyState | null;
  },
): Promise<string> {
  const apiKey = getGroqApiKey();
  if (!apiKey) {
    throw new Error("GROQ_API_KEY is not configured.");
  }

  const telemetryStr = currentContext.telemetry
    ? `Current Plant Telemetry:
- pH: ${currentContext.telemetry.ph}
- TDS: ${currentContext.telemetry.tds} ppm
- Turbidity: ${currentContext.telemetry.turbidity} NTU
- Temperature: ${currentContext.telemetry.temperature} °C
- Flow Rate: ${currentContext.telemetry.flow} m³/h
- Overall Risk Score: ${currentContext.telemetry.riskScore}/100
- Outfall Valve: ${currentContext.telemetry.valve}
- Relay Actuator: ${currentContext.safetyState?.relayState ?? "INACTIVE"}
- Discharge Status: ${currentContext.telemetry.discharge}`
    : "No live telemetry reading yet.";

  const fusionStr = currentContext.fusion
    ? `AI Sensor Fusion State:
- Health Score: ${currentContext.fusion.currentHealthScore}/100
- Priority Level: ${currentContext.fusion.priorityLabel}
- Anomaly State: ${currentContext.fusion.anomalyState} (Score: ${currentContext.fusion.anomalyScore}/100)
- 5-Min Predicted Risk: ${currentContext.fusion.predictedRisk5Min}/100
- 10-Min Predicted Risk: ${currentContext.fusion.predictedRisk10Min}/100
- Trend Momentum: ${currentContext.fusion.trendDirection}
- Diagnostic Triggers: ${currentContext.fusion.anomalyDetails.join("; ") || "None"}`
    : "No fusion data available.";

  const systemMessage = `You are the SCADA Plant AI Copilot for this Industrial Effluent Treatment Facility.
You have real-time access to the live sensor feed, automated valve interlocks, sensor fusion analytics, and predictive early-warning engines.

${telemetryStr}

${fusionStr}

Provide clear, technically precise, and concise answers to the operator.
Guide them on chemical stoichiometry, statutory environmental thresholds (pH 6.5-8.5, TDS < 1000 ppm, Turbidity < 25 NTU, Temp < 40°C), clarifier operation, dosing pumps (NaOH, H2SO4, Alum, PAC, Polymer), and safety protocols. Keep answers scannable and direct.`;

  const messages = [
    { role: "system", content: systemMessage },
    ...history.slice(-6).map((h) => ({ role: h.role, content: h.content })),
    { role: "user", content: userMessage },
  ];

  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: DEFAULT_MODEL,
      messages,
      temperature: 0.2,
      max_tokens: 600,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Groq Copilot API error (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || "No response generated from the plant copilot.";
}

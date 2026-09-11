import { useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  ShieldCheck,
  ShieldAlert,
  Droplet,
  Zap,
  Mail,
  FlaskConical,
  Waves,
  Thermometer,
  CircleDot,
  BarChart3,
  ScanSearch,
  Cog,
  Check,
  AlertTriangle,
  Shield,
  Pipette,
  Radio,
  Lock,
  Unlock,
  Clock,
  Brain,
  TrendingUp,
  TrendingDown,
  Cpu,
  Layers,
  Activity,
  ArrowUpRight,
  ArrowDownRight,
  ArrowRight,
  Download,
} from "lucide-react";
import { Gauge } from "./Gauge";
import { sensorConfigs, sensorIconMap } from "@/lib/sensor-config";
import { useRealtimeSensors } from "@/context/RealtimeSensorContext";
import { fmt, levelOf, type Level, type SensorKey } from "@/lib/effluent";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export function CriticalAlertBanner() {
  const {
    currentStatus,
    riskScore,
    valveState,
    relayState,
    dischargeStatus,
    lastAlertTime,
    values,
    resetSafetyInterlock,
  } = useRealtimeSensors();

  if (currentStatus !== "CRITICAL" || !values) {
    return null;
  }

  const alertTimeString = lastAlertTime
    ? new Date(lastAlertTime).toLocaleTimeString([], { hour12: false })
    : "Active";

  return (
    <div
      role="alert"
      className="relative overflow-hidden rounded-xl border-2 border-critical bg-critical/15 p-4 shadow-[0_0_25px_rgba(239,68,68,0.3)] animate-pulse"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-critical text-black font-bold">
            <AlertTriangle className="h-7 w-7 text-black" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded bg-critical px-2 py-0.5 font-display text-xs font-black tracking-wider text-black">
                CRITICAL SAFETY ALERT
              </span>
              <span className="font-mono text-xs font-semibold text-critical">
                [POLLUTION RISK SCORE]: {Math.round(riskScore)}/100
              </span>
            </div>
            <p className="mt-1 text-sm font-bold text-foreground">
              Automated Emergency Shutdown Triggered — Effluent Outflow Blocked
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              [SEVERITY LEVEL]: <span className="font-bold text-critical">CRITICAL</span> | [VALVE
              STATE]: <span className="font-bold text-critical">{valveState}</span> | [RELAY
              STATUS]: <span className="font-bold text-critical">{relayState}</span> | [DISCHARGE
              STATUS]: <span className="font-bold text-critical">{dischargeStatus}</span>
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <div className="flex items-center gap-2 rounded-lg border border-critical/40 bg-critical/20 px-3 py-1.5 text-xs font-mono text-critical">
            <Clock className="h-4 w-4" />
            <span>Last Alert: {alertTimeString}</span>
          </div>
          <button
            onClick={async () => {
              await resetSafetyInterlock();
              toast.success(
                "Safety Interlock Reset: Plant effluent restored to normal safe operating parameters (pH 7.20, TDS 360 ppm, Flow 1.8 L/min). Discharge valve OPEN.",
              );
            }}
            className="flex items-center gap-1.5 rounded-lg border border-safe/60 bg-safe/25 px-3 py-1.5 font-display text-xs font-bold tracking-wider text-safe hover:bg-safe/40 transition-colors shadow-sm"
          >
            <Cog className="h-3.5 w-3.5" />
            RESET TO NORMAL SAFE
          </button>
        </div>
      </div>
    </div>
  );
}

export function AiEarlyWarningBanner() {
  const {
    isEarlyWarning,
    priorityLabel,
    priorityLevel,
    currentStatus,
    predictedRisk5Min,
    predictedRisk10Min,
    predictedCriticalInMinutes,
    trendHeadline,
    anomalyStatus,
    anomalyDetails,
  } = useRealtimeSensors();

  if (!isEarlyWarning || currentStatus === "CRITICAL") {
    return null;
  }

  const isLevel4 = priorityLevel === 4;

  return (
    <div
      role="alert"
      className={cn(
        "relative overflow-hidden rounded-xl border-2 p-4 shadow-lg transition-all",
        isLevel4
          ? "border-amber-500 bg-amber-500/10 shadow-[0_0_20px_rgba(245,158,11,0.2)] animate-pulse"
          : "border-cyan/70 bg-cyan/10 shadow-[0_0_20px_rgba(6,182,212,0.15)]",
      )}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <div
            className={cn(
              "grid h-11 w-11 shrink-0 place-items-center rounded-lg font-bold",
              isLevel4 ? "bg-amber-500 text-black" : "bg-cyan text-black",
            )}
          >
            <Brain className="h-6 w-6" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={cn(
                  "rounded px-2 py-0.5 font-display text-xs font-black tracking-wider",
                  isLevel4 ? "bg-amber-500 text-black" : "bg-cyan text-black",
                )}
              >
                AI EARLY WARNING
              </span>
              <span
                className={cn(
                  "rounded border px-2 py-0.5 font-mono text-xs font-semibold",
                  isLevel4
                    ? "border-amber-500/50 bg-amber-500/20 text-amber-300"
                    : "border-cyan/50 bg-cyan/20 text-cyan",
                )}
              >
                {priorityLabel}
              </span>
              {predictedCriticalInMinutes !== null && (
                <span className="rounded bg-critical/20 border border-critical/40 px-2 py-0.5 font-mono text-xs font-bold text-critical">
                  CRITICAL IN ~{predictedCriticalInMinutes} MIN
                </span>
              )}
            </div>
            <p className="mt-1 text-sm font-bold text-foreground">
              {trendHeadline} — Pre-Threshold Anomaly & Predictive Alert Active
            </p>
            <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <span>
                5-Min Projected Risk:{" "}
                <strong className={isLevel4 ? "text-amber-300" : "text-cyan"}>
                  {predictedRisk5Min}/100
                </strong>
              </span>
              <span>
                10-Min Projected Risk:{" "}
                <strong className={isLevel4 ? "text-amber-300" : "text-cyan"}>
                  {predictedRisk10Min}/100
                </strong>
              </span>
              <span>
                Anomaly State: <strong className="text-foreground">{anomalyStatus}</strong>
              </span>
              {anomalyDetails.length > 0 && (
                <span className="text-muted-foreground">
                  Trigger: <span className="text-foreground/90">{anomalyDetails[0]}</span>
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <div className="flex items-center gap-2 rounded-lg border border-border/80 bg-background/60 px-3 py-1.5 text-xs font-mono text-muted-foreground">
            <Activity className="h-4 w-4 text-cyan" />
            <span>Early Warning Dispatched</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function levelVar(level: Level) {
  return level === "CRITICAL"
    ? "var(--critical)"
    : level === "WARNING"
      ? "var(--warn)"
      : "var(--safe)";
}

function glow(level: Level) {
  return level === "CRITICAL"
    ? "text-glow-critical"
    : level === "WARNING"
      ? "text-glow-warn"
      : "text-glow-safe";
}

function levelText(level: Level) {
  return level === "CRITICAL" ? "text-critical" : level === "WARNING" ? "text-warn" : "text-safe";
}

export function StatusPanel() {
  const { risk, status, values, isConnected, lastUpdated } = useRealtimeSensors();
  const Icon = status === "SAFE" ? ShieldCheck : ShieldAlert;

  const displayStatus = values ? status : "AWAITING DATA";
  const displaySubtitle = !values
    ? "Awaiting ESP32 hardware telemetry on /api/sensors/data"
    : status === "SAFE"
      ? "All effluent metrics within legal compliance limits"
      : status === "WARNING"
        ? "Warning threshold breach detected in live stream"
        : "Critical effluent pollution — safety discharge blocked";

  return (
    <section className="scada-panel grid grid-cols-1 items-center gap-4 px-6 py-5 sm:grid-cols-[1fr_auto]">
      <div className="flex min-w-0 flex-col items-center gap-4 sm:flex-row sm:gap-6">
        <Icon
          className={cn("h-16 w-16 shrink-0", values ? levelText(status) : "text-cyan")}
          style={{
            filter: `drop-shadow(0 0 12px color-mix(in oklab, ${values ? levelVar(status) : "var(--cyan)"} 55%, transparent))`,
          }}
        />
        <div className="min-w-0 text-center sm:text-left">
          <div className="flex items-center justify-center sm:justify-start gap-2">
            <p className="panel-title text-sm">System Status</p>
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold",
                isConnected
                  ? "bg-safe/15 text-safe border border-safe/30"
                  : "bg-muted text-muted-foreground border border-border",
              )}
            >
              <Radio className="h-3 w-3 animate-pulse" />
              {isConnected ? "ESP32 Stream Active" : "Waiting for Ingestion"}
            </span>
          </div>
          <p
            className={cn(
              "font-display text-4xl sm:text-5xl leading-none font-bold mt-1",
              values ? glow(status) : "text-foreground",
            )}
          >
            {displayStatus}
          </p>
          <p className="mt-2 text-sm text-muted-foreground">{displaySubtitle}</p>
        </div>
      </div>
      <div className="flex flex-col items-center gap-2 border-t border-border/60 pt-4 sm:border-l sm:border-t-0 sm:pl-8 sm:pt-0">
        <p className="panel-title text-sm">Composite Risk</p>
        <Gauge value={values ? risk : 0} color={values ? levelVar(status) : "var(--cyan)"}>
          <span className="font-display text-3xl font-bold text-foreground">
            {values ? String(risk).padStart(2, "0") : "--"}
          </span>
          <span className="text-xs text-muted-foreground">/100</span>
        </Gauge>
      </div>
    </section>
  );
}

export function ControlStripPanel() {
  const { valveState, relayState, dischargeStatus, currentStatus, values, lastAlertTime } =
    useRealtimeSensors();
  const critical = currentStatus === "CRITICAL" && values !== null;

  const alertTimeFormatted = lastAlertTime
    ? new Date(lastAlertTime).toLocaleTimeString([], { hour12: false })
    : "None";

  const controlTiles = [
    {
      label: "Discharge Status",
      value: values ? dischargeStatus : "STANDBY",
      tone: critical ? "critical" : values ? "safe" : "muted",
      icon: Droplet,
      note: critical ? "Discharge Blocked" : values ? "Discharge Normal" : "Awaiting Data",
    },
    {
      label: "Valve State",
      value: values ? valveState : "CLOSED",
      tone: critical ? "critical" : values ? "safe" : "muted",
      icon: Pipette,
      note: critical ? "Emergency Cutoff" : values ? "Solenoid Open" : "Standby Position",
    },
    {
      label: "Relay State",
      value: values ? relayState : "INACTIVE",
      tone: critical ? "critical" : "muted",
      icon: Zap,
      note: critical ? "Relay Activated" : "Relay Inactive",
    },
    {
      label: "Last Alert Time",
      value: alertTimeFormatted,
      tone: lastAlertTime ? (critical ? "critical" : "muted") : "muted",
      icon: Clock,
      note: critical ? "Active Alert Event" : "Last Logged Event",
    },
  ];

  return (
    <section className="scada-panel grid grid-cols-2 divide-border/60 px-2 py-5 sm:grid-cols-4 sm:divide-x">
      {controlTiles.map(({ label, value, tone, icon: Icon, note }) => (
        <div key={label} className="flex flex-col items-center gap-1.5 px-3 py-2 text-center">
          <p className="label-caps">{label}</p>
          <p
            className={cn(
              "font-display text-xl sm:text-2xl font-bold",
              tone === "safe"
                ? "text-glow-safe"
                : tone === "critical"
                  ? "text-glow-critical"
                  : "text-foreground",
            )}
          >
            {value}
          </p>
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Icon className="h-4 w-4 shrink-0 text-cyan" />
            {note}
          </p>
        </div>
      ))}
    </section>
  );
}

export function SensorCards() {
  const { values, history, lastUpdated } = useRealtimeSensors();

  return (
    <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-5">
      {sensorConfigs.map((s) => {
        const key = s.key;
        const Icon = sensorIconMap[key] ?? Droplet;
        const hasVal = values !== null && values[key] !== undefined;
        const value = hasVal ? values[key] : 0;
        const level = hasVal ? levelOf(key, value) : "SAFE";
        const data = history.slice(-60).map((r, i) => ({ t: i, v: r[key] }));

        return (
          <article key={key} className="scada-panel flex flex-col p-4">
            <header className="flex items-center gap-3">
              <span
                className="grid h-10 w-10 shrink-0 place-items-center rounded-full"
                style={{ background: `color-mix(in oklab, ${s.color} 22%, transparent)` }}
              >
                <Icon className="h-5 w-5" style={{ color: s.color }} />
              </span>
              <h3 className="min-w-0 truncate text-base font-semibold">{s.label}</h3>
            </header>

            <p className="mt-3 flex items-baseline gap-2">
              <span className="font-display text-4xl font-bold tracking-tight">
                {hasVal ? fmt(key, value) : "--"}
              </span>
              <span className="text-sm text-muted-foreground">{s.unit}</span>
            </p>
            <p
              className={cn(
                "mt-1 font-display text-sm font-semibold tracking-widest",
                hasVal ? glow(level) : "text-muted-foreground",
              )}
            >
              {hasVal ? level : "AWAITING"}
            </p>
            <p className="mt-2 text-[11px] text-muted-foreground">{s.thresholds}</p>

            <div className="mt-3 h-14">
              {data.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={data}>
                    <defs>
                      <linearGradient id={`g-${key}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={s.color} stopOpacity={0.35} />
                        <stop offset="100%" stopColor={s.color} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <Area
                      type="linear"
                      dataKey="v"
                      stroke={s.color}
                      strokeWidth={1.4}
                      fill={`url(#g-${key})`}
                      dot={false}
                      isAnimationActive={false}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex h-full items-center justify-center rounded border border-dashed border-border/40 text-[11px] text-muted-foreground">
                  Awaiting telemetry
                </div>
              )}
            </div>

            <footer className="mt-2 flex items-center justify-between border-t border-border/50 pt-2">
              <span className="text-[11px] text-muted-foreground">
                {lastUpdated ? `Updated ${lastUpdated}` : "Waiting for ESP32"}
              </span>
              <span
                className="h-2 w-2 rounded-full"
                style={{
                  background: hasVal ? levelVar(level) : "var(--muted-foreground)",
                  boxShadow: hasVal ? `0 0 8px ${levelVar(level)}` : "none",
                }}
              />
            </footer>
          </article>
        );
      })}
    </section>
  );
}

const ranges = ["5 MIN", "15 MIN", "1 HOUR", "24 HOURS"];

type MetricKey = SensorKey | "risk";

const metrics: {
  label: string;
  key: MetricKey;
  domain: [number, number];
  ticks: number[];
  warn: number;
  crit: number;
  unit: string;
}[] = [
  {
    label: "pH",
    key: "ph",
    domain: [0, 14],
    ticks: [0, 4, 7, 10, 14],
    warn: 8.5,
    crit: 9.5,
    unit: "",
  },
  {
    label: "TDS (ppm)",
    key: "tds",
    domain: [0, 2000],
    ticks: [0, 500, 1000, 1500, 2000],
    warn: 800,
    crit: 1500,
    unit: "ppm",
  },
  {
    label: "Turbidity (NTU)",
    key: "turbidity",
    domain: [0, 200],
    ticks: [0, 50, 100, 150, 200],
    warn: 50,
    crit: 100,
    unit: "NTU",
  },
  {
    label: "Temperature (°C)",
    key: "temperature",
    domain: [0, 50],
    ticks: [0, 10, 20, 30, 40, 50],
    warn: 35,
    crit: 40,
    unit: "°C",
  },
  {
    label: "Flow (L/min)",
    key: "flow",
    domain: [0, 8],
    ticks: [0, 2, 4, 6, 8],
    warn: 3,
    crit: 5,
    unit: "L/min",
  },
  {
    label: "Pollution Risk Score",
    key: "risk",
    domain: [0, 100],
    ticks: [0, 25, 50, 75, 100],
    warn: 50,
    crit: 75,
    unit: "/100",
  },
];

const rangePoints: Record<string, number> = {
  "5 MIN": 60,
  "15 MIN": 120,
  "1 HOUR": 240,
  "24 HOURS": 400,
};

interface CustomDotProps {
  cx?: number;
  cy?: number;
  payload?: {
    time?: string;
    value?: number;
    status?: string;
    risk?: number;
    isCritical?: boolean;
  };
}

export function TrendPanel() {
  const [range, setRange] = useState("5 MIN");
  const [metric, setMetric] = useState("TDS (ppm)");
  const { history, isConnected } = useRealtimeSensors();

  const m = metrics.find((x) => x.label === metric) ?? metrics[1]!;
  const data = history.slice(-(rangePoints[range] ?? 60)).map((r) => {
    const val = m.key === "risk" ? (r.risk ?? 0) : r[m.key];
    const isCritical =
      r.status === "CRITICAL" ||
      (r.risk !== undefined && r.risk >= 75) ||
      (m.crit !== undefined && typeof val === "number" && val >= m.crit);
    return {
      time: r.time,
      value: typeof val === "number" ? Number(val.toFixed(2)) : val,
      status: r.status,
      risk: r.risk,
      isCritical,
    };
  });

  const color =
    m.key === "risk"
      ? "var(--critical, #ef4444)"
      : (sensorConfigs.find((s) => s.key === m.key)?.color ?? "var(--tds)");

  // Custom dot renderer: highlights CRITICAL points with distinct red pulsing marker
  const renderDot = (props: CustomDotProps) => {
    const { cx, cy, payload } = props;
    if (!cx || !cy) return null;

    if (payload?.isCritical) {
      return (
        <g key={`crit-dot-${payload.time}-${cx}`}>
          <circle cx={cx} cy={cy} r={7} fill="#ef4444" opacity={0.35} className="animate-ping" />
          <circle cx={cx} cy={cy} r={5} fill="#ef4444" stroke="#ffffff" strokeWidth={1.8} />
        </g>
      );
    }
    return null;
  };

  return (
    <section className="scada-panel flex flex-col p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="panel-title flex items-center gap-2 text-sm">
          <BarChart3 className="h-4 w-4 text-cyan" />
          Real-time Sensor Trend (Database Telemetry)
        </h2>
        <div className="flex items-center gap-2">
          <a
            href="/api/reports/download"
            download
            className="flex items-center gap-1.5 rounded-lg border border-border bg-secondary px-2.5 py-1 text-[11px] font-semibold text-foreground transition-colors hover:bg-accent"
            title="Download full CSV report of database sensor readings"
          >
            <Download className="h-3.5 w-3.5 text-cyan" />
            <span>CSV Export</span>
          </a>
          <span
            className={cn(
              "rounded-lg border px-3 py-1 text-[11px] font-semibold tracking-widest",
              isConnected
                ? "border-safe/50 bg-safe/10 text-safe"
                : "border-border bg-secondary text-muted-foreground",
            )}
          >
            {isConnected ? "LIVE STREAM" : "POLLING"}
          </span>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <select
          value={metric}
          onChange={(e) => setMetric(e.target.value)}
          className="rounded-lg border border-border bg-secondary px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
        >
          {metrics.map((x) => (
            <option key={x.label} value={x.label}>
              {x.label}
            </option>
          ))}
        </select>
        <div className="flex flex-wrap gap-2">
          {ranges.map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={cn(
                "rounded-lg border px-3 py-2 text-xs font-semibold tracking-wider transition-colors",
                range === r
                  ? "border-primary/60 bg-primary/15 text-cyan"
                  : "border-border bg-secondary text-muted-foreground hover:text-foreground",
              )}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-5 h-[280px]">
        {data.length > 0 ? (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 8, right: 56, left: 0, bottom: 0 }}>
              <CartesianGrid
                stroke="color-mix(in oklab, var(--border) 55%, transparent)"
                vertical={false}
              />
              <XAxis
                dataKey="time"
                interval={Math.max(0, Math.floor(data.length / 5))}
                tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
                stroke="var(--border)"
              />
              <YAxis
                domain={m.domain}
                ticks={m.ticks}
                tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
                stroke="var(--border)"
              />
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const pt = payload[0].payload;
                  const crit = pt.isCritical;
                  return (
                    <div className="rounded-lg border border-border bg-popover/95 p-2.5 text-xs shadow-xl backdrop-blur">
                      <div className="flex items-center justify-between gap-3 border-b border-border/50 pb-1.5 mb-1.5 font-mono">
                        <span className="text-muted-foreground">{pt.time}</span>
                        <span
                          className={cn(
                            "rounded px-1.5 py-0.5 text-[10px] font-bold uppercase",
                            crit
                              ? "bg-critical/20 text-critical border border-critical/50"
                              : "bg-safe/20 text-safe border border-safe/50",
                          )}
                        >
                          {crit ? "CRITICAL BREACH" : pt.status || "SAFE"}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-4">
                        <span className="text-muted-foreground">{m.label}:</span>
                        <span
                          className={cn(
                            "font-mono font-bold text-sm",
                            crit ? "text-critical" : "text-foreground",
                          )}
                        >
                          {pt.value} {m.unit}
                        </span>
                      </div>
                      {pt.risk !== undefined && (
                        <div className="flex items-center justify-between gap-4 mt-1">
                          <span className="text-muted-foreground">Pollution Score:</span>
                          <span
                            className={cn(
                              "font-mono font-bold",
                              pt.risk >= 75 ? "text-critical" : "text-cyan",
                            )}
                          >
                            {Number(pt.risk).toFixed(1)}/100
                          </span>
                        </div>
                      )}
                    </div>
                  );
                }}
              />
              <ReferenceLine
                y={m.crit}
                stroke="var(--critical)"
                strokeDasharray="6 5"
                label={{
                  value: `CRITICAL (${m.crit} ${m.unit})`.trim(),
                  position: "insideTopRight",
                  fill: "var(--critical)",
                  fontSize: 10,
                }}
              />
              <ReferenceLine
                y={m.warn}
                stroke="var(--warn)"
                strokeDasharray="6 5"
                label={{
                  value: `WARNING (${m.warn} ${m.unit})`.trim(),
                  position: "insideTopRight",
                  fill: "var(--warn)",
                  fontSize: 10,
                }}
              />
              <Line
                type="linear"
                dataKey="value"
                stroke={color}
                strokeWidth={1.6}
                dot={renderDot}
                activeDot={{ r: 5, stroke: "#ffffff", strokeWidth: 1.8 }}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex h-full flex-col items-center justify-center rounded-xl border border-dashed border-border/50 text-center p-6">
            <BarChart3 className="h-8 w-8 text-muted-foreground/50 mb-2" />
            <p className="text-sm font-medium text-foreground">Awaiting Real Telemetry Data</p>
            <p className="text-xs text-muted-foreground mt-1 max-w-sm">
              Live chart will plot database records as soon as ESP32 sends telemetry to POST
              /api/sensors/data
            </p>
          </div>
        )}
      </div>
    </section>
  );
}

export function RiskPanel() {
  const { risk, status, values } = useRealtimeSensors();

  return (
    <section className="scada-panel flex flex-col p-5">
      <h2 className="panel-title flex items-center gap-2 text-sm">
        <ScanSearch className="h-4 w-4 text-cyan" />
        Pollution Risk Analysis
      </h2>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-6">
        <div className="flex flex-col items-center">
          <Gauge
            value={values ? risk : 0}
            size={132}
            stroke={12}
            color={values ? levelVar(status) : "var(--cyan)"}
          >
            <span className="font-display text-4xl font-bold">
              {values ? String(risk).padStart(2, "0") : "--"}
            </span>
            <span className="text-xs text-muted-foreground">/100</span>
          </Gauge>
          <p
            className={cn(
              "mt-2 font-display text-2xl font-bold",
              values ? glow(status) : "text-muted-foreground",
            )}
          >
            {values ? status : "STANDBY"}
          </p>
        </div>
        <ul className="flex min-w-[160px] flex-1 flex-col gap-3">
          {sensorConfigs.map((s) => {
            const hasVal = values !== null && values[s.key] !== undefined;
            const level = hasVal ? levelOf(s.key, values[s.key]) : "SAFE";
            return (
              <li key={s.key} className="flex items-center gap-2 text-sm">
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{
                    background: hasVal ? levelVar(level) : "var(--muted-foreground)",
                    boxShadow: hasVal ? `0 0 8px ${levelVar(level)}` : "none",
                  }}
                />
                <span className="min-w-0 flex-1 truncate text-foreground">{s.label}</span>
                <span
                  className={cn(
                    "text-[11px] font-semibold tracking-widest",
                    hasVal ? levelText(level) : "text-muted-foreground",
                  )}
                >
                  {hasVal ? (level === "SAFE" ? "NORMAL" : level) : "AWAITING"}
                </span>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="mt-6 border-t border-border/60 pt-4">
        <p className="label-caps">Detection</p>
        <p className="mt-2 flex items-center gap-2 text-sm text-foreground">
          {!values ? (
            <span className="text-muted-foreground">
              Waiting for sensor input from ESP32 telemetry feed.
            </span>
          ) : status === "SAFE" ? (
            <>
              <Check className="h-4 w-4 text-safe" />
              All parameters within legal effluent discharge standards.
            </>
          ) : (
            <>
              <AlertTriangle className={cn("h-4 w-4", levelText(status))} />
              {sensorConfigs
                .filter((s) => levelOf(s.key, values[s.key]) !== "SAFE")
                .map((s) => s.label)
                .join(", ")}{" "}
              out of safe range.
            </>
          )}
        </p>
      </div>
    </section>
  );
}

export function DischargePanel() {
  const {
    valveState,
    relayState,
    dischargeStatus,
    currentStatus,
    values,
    systemMode,
    setSystemMode,
    manualCutoff,
    toggleManualCutoff,
    resetSafetyInterlock,
  } = useRealtimeSensors();
  const critical = (currentStatus === "CRITICAL" && values !== null) || manualCutoff;

  return (
    <section className="scada-panel flex flex-col p-5">
      <div className="flex items-center justify-between">
        <h2 className="panel-title flex items-center gap-2 text-sm">
          <Cog className="h-4 w-4 text-cyan" />
          SCADA Discharge Safety Interlock
        </h2>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setSystemMode(systemMode === "AUTO" ? "MANUAL" : "AUTO")}
            className={cn(
              "rounded px-2.5 py-1 text-[11px] font-bold tracking-wider transition-colors border",
              systemMode === "AUTO"
                ? "border-primary/50 bg-primary/10 text-cyan"
                : "border-warn/50 bg-warn/10 text-warn",
            )}
          >
            MODE: {systemMode}
          </button>
        </div>
      </div>

      <p className="mt-4 text-sm text-muted-foreground">
        Current Operational State:{" "}
        <span
          className={cn(
            "ml-2 font-display font-bold tracking-wider",
            critical ? "text-critical" : "text-cyan",
          )}
        >
          {critical ? "CUTOFF ENGAGED" : "AUTHORIZED DISCHARGE"}
        </span>
      </p>

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div
          className={cn(
            "flex items-center gap-3 rounded-xl p-4",
            critical
              ? "border border-critical/40 bg-critical/8"
              : "border border-safe/40 bg-safe/8",
          )}
        >
          <Pipette className={cn("h-7 w-7 shrink-0", critical ? "text-critical" : "text-safe")} />
          <div className="min-w-0">
            <p className="truncate text-sm text-muted-foreground">Valve State</p>
            <p
              className={cn(
                "font-display text-xl font-bold",
                critical ? "text-glow-critical" : "text-glow-safe",
              )}
            >
              {valveState}
            </p>
          </div>
        </div>
        <div
          className={cn(
            "flex items-center gap-3 rounded-xl p-4",
            critical
              ? "border border-critical/40 bg-critical/8"
              : "border border-border bg-secondary/60",
          )}
        >
          <Zap
            className={cn("h-7 w-7 shrink-0", critical ? "text-critical" : "text-muted-foreground")}
          />
          <div className="min-w-0">
            <p className="truncate text-sm text-muted-foreground">Relay State</p>
            <p
              className={cn(
                "font-display text-xl font-bold",
                critical ? "text-glow-critical" : "text-foreground",
              )}
            >
              {relayState}
            </p>
          </div>
        </div>
      </div>

      <div
        className={cn(
          "mt-4 flex items-center gap-3 rounded-xl p-4",
          critical
            ? "border border-critical/40 bg-critical/8"
            : "border border-primary/35 bg-primary/8",
        )}
      >
        <Droplet className={cn("h-7 w-7 shrink-0", critical ? "text-critical" : "text-cyan")} />
        <div className="min-w-0">
          <p className="truncate text-sm text-muted-foreground">Discharge Status</p>
          <p
            className={cn(
              "font-display text-xl font-bold",
              critical ? "text-glow-critical" : "text-glow-safe",
            )}
          >
            {dischargeStatus}
          </p>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <button
          onClick={toggleManualCutoff}
          className={cn(
            "flex items-center justify-center gap-2 rounded-xl border px-4 py-3 font-display text-xs font-bold tracking-widest transition-colors",
            manualCutoff
              ? "border-safe/50 bg-safe/12 text-safe hover:bg-safe/20"
              : "border-critical/50 bg-critical/12 text-critical hover:bg-critical/20",
          )}
        >
          {manualCutoff ? (
            <Unlock className="h-4 w-4 shrink-0" />
          ) : (
            <Lock className="h-4 w-4 shrink-0" />
          )}
          {manualCutoff ? "RELEASE MANUAL CUTOFF" : "EMERGENCY VALVE CUTOFF"}
        </button>
        <button
          onClick={async () => {
            await resetSafetyInterlock();
            toast.success(
              "Safety Interlock Reset: Plant effluent restored to normal safe operating parameters (pH 7.20, TDS 360 ppm, Flow 1.8 L/min). Discharge valve OPEN.",
            );
          }}
          className="flex items-center justify-center gap-2 rounded-xl border border-primary/50 bg-primary/12 px-4 py-3 font-display text-xs font-bold tracking-widest text-cyan transition-colors hover:bg-primary/20 shadow-sm"
        >
          <Cog className="h-4 w-4 shrink-0" />
          RESET TO AUTO SAFE
        </button>
      </div>

      <div className="mt-5 flex items-start gap-3 border-t border-border/60 pt-4">
        <Shield
          className={cn("mt-0.5 h-5 w-5 shrink-0", critical ? "text-critical" : "text-safe")}
        />
        <div>
          <p className="text-sm font-semibold text-foreground">Automatic SCADA interlock active.</p>
          <p className="mt-1 text-sm text-muted-foreground">
            System automatically cuts discharge relay and closes safety valve if composite pollution
            score &ge; 70.0.
          </p>
        </div>
      </div>
    </section>
  );
}

export function AiSensorFusionDashboard() {
  const {
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
    priorityLabel,
    priorityLevel,
    mlAnalysis,
  } = useRealtimeSensors();

  // Color mappings
  const healthTier =
    aiHealthScore >= 80
      ? { label: "OPTIMAL", color: "text-safe", bg: "bg-safe/15 border-safe/40", bar: "bg-safe" }
      : aiHealthScore >= 60
        ? { label: "GOOD", color: "text-cyan", bg: "bg-cyan/15 border-cyan/40", bar: "bg-cyan" }
        : aiHealthScore >= 40
          ? {
              label: "DEGRADED",
              color: "text-amber-400",
              bg: "bg-amber-500/15 border-amber-500/40",
              bar: "bg-amber-400",
            }
          : {
              label: "HAZARDOUS",
              color: "text-critical",
              bg: "bg-critical/15 border-critical/40",
              bar: "bg-critical",
            };

  const anomalyTier =
    anomalyStatus === "CRITICAL"
      ? { label: "CRITICAL", color: "text-critical", bg: "bg-critical/20 border-critical/50" }
      : anomalyStatus === "ANOMALY DETECTED"
        ? {
            label: "ANOMALY DETECTED",
            color: "text-amber-300",
            bg: "bg-amber-500/20 border-amber-500/50",
          }
        : { label: "NORMAL", color: "text-safe", bg: "bg-safe/15 border-safe/30" };

  const predictionTier =
    predictionStatus === "CRITICAL"
      ? { label: "CRITICAL", color: "text-critical", bg: "bg-critical/20 border-critical/50" }
      : predictionStatus === "HIGH RISK"
        ? {
            label: "HIGH RISK",
            color: "text-amber-300",
            bg: "bg-amber-500/20 border-amber-500/50 animate-pulse",
          }
        : predictionStatus === "WARNING"
          ? { label: "WARNING", color: "text-amber-400", bg: "bg-amber-500/15 border-amber-500/30" }
          : { label: "SAFE", color: "text-safe", bg: "bg-safe/15 border-safe/30" };

  const trendTier =
    trendDirection === "RAPID_INCREASE"
      ? {
          label: "RAPID INCREASE",
          color: "text-critical",
          bg: "bg-critical/20 border-critical/50",
          icon: TrendingUp,
        }
      : trendDirection === "MODERATE_INCREASE"
        ? {
            label: "MODERATE INCREASE",
            color: "text-amber-400",
            bg: "bg-amber-500/20 border-amber-500/40",
            icon: TrendingUp,
          }
        : trendDirection === "DECREASING"
          ? {
              label: "DECREASING",
              color: "text-safe",
              bg: "bg-safe/15 border-safe/30",
              icon: TrendingDown,
            }
          : {
              label: "STABLE",
              color: "text-cyan",
              bg: "bg-cyan/15 border-cyan/30",
              icon: Activity,
            };

  const TrendIcon = trendTier.icon;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2 px-1">
        <div className="flex items-center gap-2">
          <Brain className="h-5 w-5 text-cyan" />
          <h2 className="panel-title text-sm tracking-wider text-cyan">
            Advanced AI & Sensor Fusion Engine
          </h2>
        </div>
        <div className="flex items-center gap-2 text-xs font-mono">
          <span className="rounded border border-border/80 bg-background/80 px-2 py-0.5 text-muted-foreground">
            {priorityLabel}
          </span>
          <span className="flex items-center gap-1.5 text-safe">
            <span className="h-2 w-2 rounded-full bg-safe shadow-[0_0_8px_var(--safe)]" />
            ML Pipeline Active
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {/* CARD 1: AI HEALTH SCORE */}
        <div className="scada-panel flex flex-col justify-between p-4 transition-all">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono font-medium tracking-wider text-muted-foreground uppercase">
                AI Health Score
              </span>
              <span
                className={cn(
                  "rounded border px-2 py-0.5 font-mono text-[10px] font-bold tracking-wider",
                  healthTier.bg,
                  healthTier.color,
                )}
              >
                {healthTier.label}
              </span>
            </div>

            <div className="mt-3 flex items-baseline gap-2">
              <span
                className={cn("font-display text-4xl font-black tracking-tight", healthTier.color)}
              >
                {aiHealthScore}
              </span>
              <span className="font-mono text-sm text-muted-foreground">/ 100</span>
            </div>

            {/* Health Bar */}
            <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-secondary/80">
              <div
                className={cn("h-full transition-all duration-500", healthTier.bar)}
                style={{ width: `${Math.max(5, aiHealthScore)}%` }}
              />
            </div>
          </div>

          <div className="mt-4 border-t border-border/60 pt-3 text-xs">
            <p className="font-semibold text-foreground flex items-center gap-1.5">
              <Layers className="h-3.5 w-3.5 text-cyan" />
              Sensor Fusion Synthesis
            </p>
            <p className="mt-0.5 text-muted-foreground leading-relaxed">
              Unified cross-correlation of pH, TDS, Turbidity, Temp, & Flow without isolated blind
              spots.
            </p>
            {mlAnalysis?.fusionDiagnostics?.acidAlkalineShock && (
              <span className="mt-2 inline-block rounded bg-amber-500/20 border border-amber-500/40 px-1.5 py-0.5 font-mono text-[10px] text-amber-300">
                Acid/Alkaline Dynamic Shift Detected
              </span>
            )}
          </div>
        </div>

        {/* CARD 2: ANOMALY STATUS */}
        <div className="scada-panel flex flex-col justify-between p-4 transition-all">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono font-medium tracking-wider text-muted-foreground uppercase">
                Anomaly Status
              </span>
              <span
                className={cn(
                  "rounded border px-2 py-0.5 font-mono text-[10px] font-bold tracking-wider",
                  anomalyTier.bg,
                  anomalyTier.color,
                )}
              >
                {anomalyTier.label}
              </span>
            </div>

            <div className="mt-3 flex items-baseline gap-2">
              <span
                className={cn("font-display text-3xl font-black tracking-tight", anomalyTier.color)}
              >
                {anomalyStatus === "ANOMALY DETECTED"
                  ? "DETECTED"
                  : anomalyStatus === "CRITICAL"
                    ? "CRITICAL"
                    : "NORMAL"}
              </span>
            </div>

            <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground font-mono">
              <span>Deviation Score:</span>
              <span className="font-bold text-foreground">{anomalyScore}/100</span>
            </div>
          </div>

          <div className="mt-4 border-t border-border/60 pt-3 text-xs">
            <p className="font-semibold text-foreground flex items-center gap-1.5">
              <Cpu className="h-3.5 w-3.5 text-cyan" />
              Multivariate Isolation Engine
            </p>
            <div className="mt-1">
              {anomalyDetails.length > 0 ? (
                <p className="text-amber-300/90 leading-snug line-clamp-2">{anomalyDetails[0]}</p>
              ) : (
                <p className="text-muted-foreground">
                  Operating within calibrated baseline statistical thresholds (Mahalanobis / LOF).
                </p>
              )}
            </div>
          </div>
        </div>

        {/* CARD 3: PREDICTION STATUS */}
        <div className="scada-panel flex flex-col justify-between p-4 transition-all">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono font-medium tracking-wider text-muted-foreground uppercase">
                Prediction Status
              </span>
              <span
                className={cn(
                  "rounded border px-2 py-0.5 font-mono text-[10px] font-bold tracking-wider",
                  predictionTier.bg,
                  predictionTier.color,
                )}
              >
                {predictionTier.label}
              </span>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2">
              <div className="rounded-lg border border-border/80 bg-background/50 p-2">
                <span className="text-[10px] font-mono text-muted-foreground uppercase block">
                  5-Min Risk
                </span>
                <span
                  className={cn(
                    "font-display text-xl font-black",
                    predictedRisk5Min >= 70
                      ? "text-critical"
                      : predictedRisk5Min >= 50
                        ? "text-amber-400"
                        : "text-foreground",
                  )}
                >
                  {predictedRisk5Min}
                  <span className="text-xs font-normal text-muted-foreground font-mono">/100</span>
                </span>
              </div>
              <div className="rounded-lg border border-border/80 bg-background/50 p-2">
                <span className="text-[10px] font-mono text-muted-foreground uppercase block">
                  10-Min Risk
                </span>
                <span
                  className={cn(
                    "font-display text-xl font-black",
                    predictedRisk10Min >= 70
                      ? "text-critical"
                      : predictedRisk10Min >= 50
                        ? "text-amber-400"
                        : "text-foreground",
                  )}
                >
                  {predictedRisk10Min}
                  <span className="text-xs font-normal text-muted-foreground font-mono">/100</span>
                </span>
              </div>
            </div>
          </div>

          <div className="mt-4 border-t border-border/60 pt-3 text-xs">
            <p className="font-semibold text-foreground flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5 text-cyan" />
              Trend Forecast Horizon
            </p>
            <p className="mt-0.5 text-muted-foreground leading-snug">
              {predictedCriticalInMinutes !== null ? (
                <span className="font-bold text-critical">
                  Critical breach projected in ~{predictedCriticalInMinutes} minutes based on real
                  history.
                </span>
              ) : predictedRisk10Min >= 50 ? (
                <span className="text-amber-300">
                  Elevating risk trajectory across current sampling window.
                </span>
              ) : (
                "Steady state forecast; no critical conditions projected within 10 min."
              )}
            </p>
          </div>
        </div>

        {/* CARD 4: TREND DIRECTION */}
        <div className="scada-panel flex flex-col justify-between p-4 transition-all">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono font-medium tracking-wider text-muted-foreground uppercase">
                Trend Direction
              </span>
              <span
                className={cn(
                  "rounded border px-2 py-0.5 font-mono text-[10px] font-bold tracking-wider flex items-center gap-1",
                  trendTier.bg,
                  trendTier.color,
                )}
              >
                <TrendIcon className="h-3 w-3" />
                {trendTier.label}
              </span>
            </div>

            <div className="mt-3">
              <p className="font-display text-base font-bold text-foreground truncate">
                {trendHeadline}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground truncate">{trendSummary}</p>
            </div>
          </div>

          <div className="mt-4 border-t border-border/60 pt-3 text-xs">
            <p className="font-semibold text-foreground flex items-center gap-1.5">
              <Activity className="h-3.5 w-3.5 text-cyan" />
              Rate of Change Windows
            </p>
            <div className="mt-1.5 grid grid-cols-2 gap-x-2 gap-y-1 font-mono text-[11px]">
              <div className="flex justify-between text-muted-foreground">
                <span>Last 5:</span>
                <span className="text-foreground">
                  {mlAnalysis?.trends?.window5?.tdsRate && mlAnalysis.trends.window5.tdsRate > 0
                    ? "+"
                    : ""}
                  {mlAnalysis?.trends?.window5?.tdsRate ?? 0} ppm/s
                </span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>Last 10:</span>
                <span className="text-foreground">
                  {mlAnalysis?.trends?.window10?.tdsRate && mlAnalysis.trends.window10.tdsRate > 0
                    ? "+"
                    : ""}
                  {mlAnalysis?.trends?.window10?.tdsRate ?? 0} ppm/s
                </span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>Last 20:</span>
                <span className="text-foreground">
                  {mlAnalysis?.trends?.window20?.pollutionGrowthRate &&
                  mlAnalysis.trends.window20.pollutionGrowthRate > 0
                    ? "+"
                    : ""}
                  {mlAnalysis?.trends?.window20?.pollutionGrowthRate ?? 0} Δ
                </span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>Base TDS:</span>
                <span className="text-foreground">
                  {mlAnalysis?.trends?.window50?.baselineTds ?? 420} ppm
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

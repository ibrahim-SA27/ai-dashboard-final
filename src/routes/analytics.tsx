import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { BarChart3, Bell, AlertTriangle, Ban, RefreshCw, Database } from "lucide-react";
import { Sidebar } from "@/components/dashboard/Sidebar";
import { useRealtimeSensors } from "@/context/RealtimeSensorContext";
import { sensorConfigs } from "@/lib/sensor-config";
import { fetchStatistics, type BackendStatistics } from "@/lib/api";
import { fmt, type SensorKey } from "@/lib/effluent";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/analytics")({
  head: () => ({
    meta: [
      { title: "Database Analytics — Industrial Effluent SCADA" },
      {
        name: "description",
        content:
          "Real aggregated effluent metrics and event counts calculated from stored database records: mean pH, TDS, turbidity, temperature, flow, risk score, alerts and blocked discharge events.",
      },
      { property: "og:title", content: "Database Analytics — Industrial Effluent SCADA" },
      {
        property: "og:description",
        content:
          "Average sensor readings, composite risk score and actual pollution event counts for the effluent system.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AnalyticsPage,
});

function AnalyticsPage() {
  const { history, stats: liveStats } = useRealtimeSensors();
  const [dbStats, setDbStats] = useState<BackendStatistics | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const loadStats = async () => {
    setIsLoading(true);
    try {
      const data = await fetchStatistics();
      if (data) setDbStats(data);
    } catch {
      // Handled
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadStats();
  }, []);

  const totalSamples = dbStats?.total_readings ?? history.length;
  const n = totalSamples || 1;

  const avgFromHistory = (pick: (r: (typeof history)[number]) => number) =>
    history.length > 0 ? history.reduce((s, r) => s + pick(r), 0) / history.length : 0;

  const getMetricAvg = (key: SensorKey): number => {
    if (
      dbStats?.daily_metric_averages &&
      dbStats.daily_metric_averages[key as keyof typeof dbStats.daily_metric_averages] !== undefined
    ) {
      return Number(
        dbStats.daily_metric_averages[key as keyof typeof dbStats.daily_metric_averages] ?? 0,
      );
    }
    return avgFromHistory((r) => r[key]);
  };

  const avgRisk = dbStats?.daily_pollution_avg ?? avgFromHistory((r) => r.risk);

  const events = [
    {
      label: "Total Alerts Logged",
      value: dbStats?.total_alerts ?? liveStats.totalAlerts,
      icon: Bell,
    },
    {
      label: "Critical Events",
      value: dbStats?.critical_readings_count ?? liveStats.criticalEvents,
      icon: AlertTriangle,
    },
    {
      label: "Blocked Discharge Events",
      value: dbStats?.critical_readings_count ?? liveStats.blockedEvents,
      icon: Ban,
    },
  ];

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="flex flex-col gap-4 lg:flex-row">
        <Sidebar />
        <main className="flex min-w-0 flex-1 flex-col gap-4">
          <section className="scada-panel flex flex-col p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="panel-title flex items-center gap-2 text-sm">
                <BarChart3 className="h-4 w-4 text-cyan" />
                Aggregated Sensor Readings ({totalSamples} database samples)
              </h2>

              <button
                onClick={loadStats}
                disabled={isLoading}
                className="flex items-center gap-1.5 rounded-lg border border-border bg-secondary px-3 py-1.5 text-xs font-semibold text-foreground transition-colors hover:bg-accent disabled:opacity-50"
              >
                <RefreshCw className={cn("h-3.5 w-3.5 text-cyan", isLoading && "animate-spin")} />
                Refresh
              </button>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {sensorConfigs.map((s) => {
                const key = s.key;
                const avgVal = getMetricAvg(key);
                return (
                  <div key={key} className="rounded-xl border border-border bg-secondary/40 p-4">
                    <p className="label-caps">Average {s.label}</p>
                    <p className="mt-1 flex items-baseline gap-2">
                      <span className="font-display text-3xl font-bold" style={{ color: s.color }}>
                        {totalSamples > 0 ? fmt(key, avgVal) : "--"}
                      </span>
                      <span className="text-sm text-muted-foreground">{s.unit}</span>
                    </p>
                  </div>
                );
              })}
              <div className="rounded-xl border border-primary/35 bg-primary/8 p-4">
                <p className="label-caps">Average Pollution Score</p>
                <p className="mt-1 flex items-baseline gap-2">
                  <span className="font-display text-3xl font-bold text-cyan">
                    {totalSamples > 0 ? avgRisk.toFixed(1) : "--"}
                  </span>
                  <span className="text-sm text-muted-foreground">/100</span>
                </p>
              </div>
            </div>
          </section>

          <section className="scada-panel flex flex-col p-5">
            <h2 className="panel-title text-sm">Event Summary (Actual Database Records)</h2>
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
              {events.map(({ label, value, icon: Icon }) => (
                <div
                  key={label}
                  className="flex items-center gap-3 rounded-xl border border-border bg-secondary/40 p-4"
                >
                  <Icon className="h-7 w-7 shrink-0 text-cyan" />
                  <div className="min-w-0">
                    <p className="truncate text-sm text-muted-foreground">{label}</p>
                    <p className="font-display text-2xl font-bold text-foreground">{value}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}

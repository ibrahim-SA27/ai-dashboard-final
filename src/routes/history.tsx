import { useState, useEffect, useCallback } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  Clock,
  RefreshCw,
  Filter,
  Database,
  AlertCircle,
  Download,
  Calendar,
  FileSpreadsheet,
  CheckCircle2,
} from "lucide-react";
import { Sidebar } from "@/components/dashboard/Sidebar";
import { useRealtimeSensors } from "@/context/RealtimeSensorContext";
import { fetchHistory, mapBackendToReading } from "@/lib/api";
import { fmt, type Level, type Reading } from "@/lib/effluent";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/history")({
  head: () => ({
    meta: [
      { title: "Database History — Industrial Effluent SCADA" },
      {
        name: "description",
        content:
          "Complete historical log of actual effluent sensor readings stored in database with pH, TDS, turbidity, temperature, flow, composite risk score and safety status.",
      },
      { property: "og:title", content: "Database History — Industrial Effluent SCADA" },
      {
        property: "og:description",
        content:
          "Verified database records of real ESP32 effluent sensor readings with risk score and status.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: HistoryPage,
});

function statusClass(status: string) {
  return status === "CRITICAL" ? "text-critical" : status === "WARNING" ? "text-warn" : "text-safe";
}

function HistoryPage() {
  const { history: liveHistory } = useRealtimeSensors();
  const [dbReadings, setDbReadings] = useState<Reading[]>([]);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [filterStatus, setFilterStatus] = useState<string>("ALL");
  const [isLoading, setIsLoading] = useState(true);

  // CSV Export State
  const [exportStatus, setExportStatus] = useState<string>("ALL");
  const [dateRangePreset, setDateRangePreset] = useState<string>("ALL");
  const [customStartDate, setCustomStartDate] = useState<string>("");
  const [customEndDate, setCustomEndDate] = useState<string>("");
  const [isExporting, setIsExporting] = useState(false);
  const [exportSuccess, setExportSuccess] = useState(false);

  const loadHistory = useCallback(async () => {
    setIsLoading(true);
    try {
      const statusParam = filterStatus === "ALL" ? undefined : (filterStatus as Level);
      const res = await fetchHistory(100, 0, statusParam);
      const mapped = res.readings.map((r, i) => mapBackendToReading(r, i));
      setDbReadings(mapped);
      setTotalCount(res.total);
    } catch {
      // Handled
    } finally {
      setIsLoading(false);
    }
  }, [filterStatus]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  const handleExportCsv = async () => {
    setIsExporting(true);
    setExportSuccess(false);

    try {
      const params = new URLSearchParams();
      if (exportStatus && exportStatus !== "ALL") {
        params.append("status", exportStatus);
      }

      const now = new Date();
      if (dateRangePreset === "TODAY") {
        const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        params.append("startDate", startOfDay.toISOString());
      } else if (dateRangePreset === "24H") {
        const past24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        params.append("startDate", past24h.toISOString());
      } else if (dateRangePreset === "7D") {
        const past7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        params.append("startDate", past7d.toISOString());
      } else if (dateRangePreset === "CUSTOM") {
        if (customStartDate) params.append("startDate", new Date(customStartDate).toISOString());
        if (customEndDate) {
          const end = new Date(customEndDate);
          end.setHours(23, 59, 59, 999);
          params.append("endDate", end.toISOString());
        }
      }

      const exportUrl = `/api/sensors/export?${params.toString()}`;
      const response = await fetch(exportUrl);
      if (!response.ok) throw new Error("Export request failed");

      const blob = await response.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = downloadUrl;
      a.download = `sensor_readings_${exportStatus.toLowerCase()}_${Date.now()}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(downloadUrl);

      setExportSuccess(true);
      setTimeout(() => setExportSuccess(false), 4000);
    } catch (err) {
      console.error("Failed to export CSV:", err);
    } finally {
      setIsExporting(false);
    }
  };

  // Combine DB records with live history if DB query returns empty but live is active
  const displayedRows =
    dbReadings.length > 0
      ? dbReadings
      : filterStatus === "ALL"
        ? [...liveHistory].reverse()
        : [...liveHistory].reverse().filter((r) => r.status === filterStatus);

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="flex flex-col gap-4 lg:flex-row">
        <Sidebar />
        <main className="flex min-w-0 flex-1 flex-col gap-4">
          {/* CSV Export & Filter Control Banner */}
          <section className="scada-panel p-5">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 pb-3">
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="h-4 w-4 text-cyan" />
                <h2 className="panel-title text-sm font-semibold tracking-wide">
                  Export Sensor Telemetry (CSV)
                </h2>
              </div>
              <div className="text-xs text-muted-foreground font-mono">
                Supabase PostgreSQL • Ready for Regulatory & Audit Archive
              </div>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {/* Status Filter */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
                  <Filter className="h-3.5 w-3.5 text-cyan" />
                  Filter by Status
                </label>
                <select
                  value={exportStatus}
                  onChange={(e) => setExportStatus(e.target.value)}
                  className="rounded-lg border border-border bg-secondary px-3 py-2 text-xs font-medium text-foreground outline-none focus:border-cyan"
                >
                  <option value="ALL">All Readings (Any Status)</option>
                  <option value="CRITICAL">CRITICAL Only (Breaches & Cutoffs)</option>
                  <option value="WARNING">WARNING Only (Elevated Levels)</option>
                  <option value="SAFE">SAFE Only (Normal Discharge)</option>
                </select>
              </div>

              {/* Date Range Preset */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
                  <Calendar className="h-3.5 w-3.5 text-cyan" />
                  Date Range
                </label>
                <select
                  value={dateRangePreset}
                  onChange={(e) => setDateRangePreset(e.target.value)}
                  className="rounded-lg border border-border bg-secondary px-3 py-2 text-xs font-medium text-foreground outline-none focus:border-cyan"
                >
                  <option value="ALL">All Available Records</option>
                  <option value="TODAY">Today (00:00 - Present)</option>
                  <option value="24H">Last 24 Hours</option>
                  <option value="7D">Last 7 Days</option>
                  <option value="CUSTOM">Custom Date Range...</option>
                </select>
              </div>

              {/* Custom Date Inputs */}
              {dateRangePreset === "CUSTOM" ? (
                <div className="flex flex-col gap-1.5 sm:col-span-2 lg:col-span-1">
                  <label className="text-xs font-semibold text-muted-foreground">
                    Start & End Dates
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="date"
                      value={customStartDate}
                      onChange={(e) => setCustomStartDate(e.target.value)}
                      className="w-1/2 rounded-lg border border-border bg-secondary px-2 py-1.5 text-xs text-foreground outline-none focus:border-cyan"
                      title="Start date"
                    />
                    <span className="text-xs text-muted-foreground">to</span>
                    <input
                      type="date"
                      value={customEndDate}
                      onChange={(e) => setCustomEndDate(e.target.value)}
                      className="w-1/2 rounded-lg border border-border bg-secondary px-2 py-1.5 text-xs text-foreground outline-none focus:border-cyan"
                      title="End date"
                    />
                  </div>
                </div>
              ) : (
                <div className="flex flex-col justify-end">
                  <span className="text-[11px] text-muted-foreground font-mono">
                    Columns: timestamp, pH, TDS, Turbidity, Temp, Flow, Risk Score, Status
                  </span>
                </div>
              )}

              {/* Action Button */}
              <div className="flex items-end">
                <button
                  onClick={handleExportCsv}
                  disabled={isExporting}
                  className="flex w-full items-center justify-center gap-2 rounded-lg border border-cyan/60 bg-cyan/15 px-4 py-2 text-xs font-bold text-cyan transition-colors hover:bg-cyan/25 disabled:opacity-50"
                >
                  <Download className={cn("h-4 w-4", isExporting && "animate-bounce")} />
                  {isExporting ? "Exporting CSV..." : "Download CSV Export"}
                </button>
              </div>
            </div>

            {exportSuccess && (
              <div className="mt-3 flex items-center gap-2 rounded-lg border border-safe/50 bg-safe/10 px-3 py-1.5 text-xs text-safe">
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                <span>CSV file successfully generated and downloaded to your device.</span>
              </div>
            )}
          </section>

          {/* Database Readings Table */}
          <section className="scada-panel flex flex-col p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Database className="h-4 w-4 text-cyan" />
                <h2 className="panel-title text-sm">
                  Database Reading Records ({totalCount || displayedRows.length} stored)
                </h2>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-1.5 rounded-lg border border-border bg-secondary px-2.5 py-1.5 text-xs">
                  <Filter className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-muted-foreground">Status:</span>
                  <select
                    value={filterStatus}
                    onChange={(e) => setFilterStatus(e.target.value)}
                    className="bg-transparent font-medium text-foreground outline-none"
                  >
                    <option value="ALL">All Statuses</option>
                    <option value="SAFE">Safe Only</option>
                    <option value="WARNING">Warning Only</option>
                    <option value="CRITICAL">Critical Only</option>
                  </select>
                </div>

                <button
                  onClick={loadHistory}
                  disabled={isLoading}
                  className="flex items-center gap-1.5 rounded-lg border border-border bg-secondary px-3 py-1.5 text-xs font-semibold text-foreground transition-colors hover:bg-accent disabled:opacity-50"
                >
                  <RefreshCw className={cn("h-3.5 w-3.5 text-cyan", isLoading && "animate-spin")} />
                  Refresh
                </button>
              </div>
            </div>

            <div className="mt-4 max-h-[calc(100vh-18rem)] overflow-auto rounded-lg border border-border/50">
              <table className="w-full min-w-[760px] text-sm">
                <thead className="sticky top-0 bg-secondary/90 backdrop-blur">
                  <tr className="text-left">
                    {[
                      "ID",
                      "Timestamp",
                      "pH",
                      "TDS (ppm)",
                      "Turbidity (NTU)",
                      "Temp (°C)",
                      "Flow (L/min)",
                      "Risk Score",
                      "Status",
                    ].map((h) => (
                      <th key={h} className="label-caps border-b border-border/60 px-3 py-2.5">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {displayedRows.length === 0 && (
                    <tr>
                      <td colSpan={9} className="px-4 py-12 text-center text-muted-foreground">
                        <div className="mx-auto flex max-w-sm flex-col items-center">
                          <AlertCircle className="h-8 w-8 text-muted-foreground/60 mb-2" />
                          <p className="font-medium text-foreground">No Database Records Found</p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            Awaiting real telemetry ingestion from ESP32 hardware via POST
                            /api/sensors/data
                          </p>
                        </div>
                      </td>
                    </tr>
                  )}
                  {displayedRows.map((r, i) => (
                    <tr
                      key={r.id ?? i}
                      className="border-b border-border/40 hover:bg-secondary/30 transition-colors"
                    >
                      <td className="px-3 py-2 font-mono text-xs text-muted-foreground">
                        #{r.id ?? i + 1}
                      </td>
                      <td className="px-3 py-2 font-display tracking-wider text-cyan">
                        {r.timestamp
                          ? new Date(r.timestamp).toLocaleTimeString([], { hour12: false })
                          : r.time}
                      </td>
                      <td className="px-3 py-2">{fmt("ph", r.ph)}</td>
                      <td className="px-3 py-2">{fmt("tds", r.tds)}</td>
                      <td className="px-3 py-2">{fmt("turbidity", r.turbidity)}</td>
                      <td className="px-3 py-2">{fmt("temperature", r.temperature)}</td>
                      <td className="px-3 py-2">{fmt("flow", r.flow)}</td>
                      <td className="px-3 py-2 font-display font-bold">{r.risk}</td>
                      <td
                        className={cn(
                          "px-3 py-2 font-display font-bold tracking-widest",
                          statusClass(r.status),
                        )}
                      >
                        {r.status}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}

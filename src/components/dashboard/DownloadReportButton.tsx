import React, { useState } from "react";
import {
  Download,
  FileSpreadsheet,
  Filter,
  Calendar,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ChevronDown,
  SlidersHorizontal,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

interface DownloadReportButtonProps {
  variant?: "header" | "panel" | "compact";
  className?: string;
}

export function DownloadReportButton({
  variant = "header",
  className = "",
}: DownloadReportButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [dateRangePreset, setDateRangePreset] = useState<string>("ALL");
  const [customStartDate, setCustomStartDate] = useState<string>("");
  const [customEndDate, setCustomEndDate] = useState<string>("");
  const [minRiskScore, setMinRiskScore] = useState<string>("");
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const executeDownload = async (options?: {
    status?: string;
    range?: string;
    start?: string;
    end?: string;
    minScore?: string;
  }) => {
    setIsDownloading(true);
    setSuccessMessage(null);
    setErrorMessage(null);

    const statusToUse = options?.status ?? statusFilter;
    const rangeToUse = options?.range ?? dateRangePreset;
    const startToUse = options?.start ?? customStartDate;
    const endToUse = options?.end ?? customEndDate;
    const minScoreToUse = options?.minScore ?? minRiskScore;

    try {
      const params = new URLSearchParams();

      if (statusToUse && statusToUse !== "ALL") {
        params.append("status", statusToUse);
      }

      const now = new Date();
      if (rangeToUse === "TODAY") {
        const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        params.append("startDate", startOfDay.toISOString());
      } else if (rangeToUse === "24H") {
        const past24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        params.append("startDate", past24h.toISOString());
      } else if (rangeToUse === "7D") {
        const past7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        params.append("startDate", past7d.toISOString());
      } else if (rangeToUse === "CUSTOM") {
        if (startToUse) {
          params.append("startDate", new Date(startToUse).toISOString());
        }
        if (endToUse) {
          const end = new Date(endToUse);
          end.setHours(23, 59, 59, 999);
          params.append("endDate", end.toISOString());
        }
      }

      if (minScoreToUse && !isNaN(Number(minScoreToUse))) {
        params.append("minScore", minScoreToUse);
      }

      // Query the backend report generation endpoint
      const response = await fetch(`/api/reports/download?${params.toString()}`);
      if (!response.ok) {
        throw new Error(`Report generation failed (${response.status} ${response.statusText})`);
      }

      // Extract filename from Content-Disposition header if available
      let filename = `effluent_sensor_report_${statusToUse.toLowerCase()}_${Date.now()}.csv`;
      const disposition = response.headers.get("Content-Disposition");
      if (disposition && disposition.includes("filename=")) {
        const match = disposition.match(/filename="?([^";]+)"?/);
        if (match && match[1]) {
          filename = match[1];
        }
      }

      // Process into blob and trigger client-side browser download
      const blob = await response.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = downloadUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(downloadUrl);

      setSuccessMessage(`Successfully downloaded ${filename}`);
      setTimeout(() => {
        setSuccessMessage(null);
      }, 5000);
    } catch (err) {
      console.error("[Download Report Client Error]:", err);
      setErrorMessage(err instanceof Error ? err.message : "Failed to download sensor report");
    } finally {
      setIsDownloading(false);
    }
  };

  const handleQuickDownload = (e: React.MouseEvent) => {
    e.stopPropagation();
    executeDownload({ status: "ALL", range: "ALL" });
  };

  return (
    <div className={`relative inline-flex items-center gap-1.5 ${className}`}>
      {/* Primary Download Report Button */}
      <div className="flex items-center rounded-lg border border-cyan/40 bg-cyan/10 p-0.5 shadow-sm transition-all hover:border-cyan hover:bg-cyan/15 focus-within:ring-2 focus-within:ring-cyan/30">
        <button
          type="button"
          id="btn-download-report"
          onClick={() => setIsOpen(true)}
          disabled={isDownloading}
          className="flex items-center gap-2 rounded-md px-3 py-1.5 text-xs font-bold text-cyan transition-colors hover:text-cyan/90 disabled:opacity-50"
          title="Download filtered telemetry report from Supabase"
        >
          {isDownloading ? (
            <Loader2 className="h-4 w-4 animate-spin text-cyan" />
          ) : (
            <Download className="h-4 w-4 text-cyan" />
          )}
          <span>{isDownloading ? "Generating..." : "Download Report"}</span>
        </button>

        <span className="h-4 w-px bg-cyan/30" />

        <button
          type="button"
          id="btn-quick-download-report"
          onClick={handleQuickDownload}
          disabled={isDownloading}
          className="rounded-md px-2 py-1.5 text-[11px] font-semibold text-cyan/80 transition-colors hover:bg-cyan/20 hover:text-cyan disabled:opacity-50"
          title="Quick 1-Click CSV Export (All Records)"
        >
          Quick CSV
        </button>
      </div>

      {/* Floating Success Indicator Toast (if downloaded directly) */}
      {successMessage && !isOpen && (
        <div className="absolute right-0 top-full z-50 mt-2 flex items-center gap-2 rounded-lg border border-safe/40 bg-popover/95 px-3 py-1.5 text-xs font-medium text-safe shadow-xl backdrop-blur">
          <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate max-w-[240px]">{successMessage}</span>
        </div>
      )}

      {/* Report Customization & Filter Dialog */}
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="border-border bg-card text-card-foreground sm:max-w-[540px]">
          <DialogHeader>
            <div className="flex items-center gap-2.5 text-cyan">
              <FileSpreadsheet className="h-5 w-5" />
              <DialogTitle className="text-base font-bold tracking-wide">
                Download Effluent Telemetry Report
              </DialogTitle>
            </div>
            <DialogDescription className="text-xs text-muted-foreground">
              Fetches filtered sensor readings directly from Supabase PostgreSQL, formats them into
              standard RFC-4180 CSV, and triggers a client-side download.
            </DialogDescription>
          </DialogHeader>

          <div className="mt-4 flex flex-col gap-4">
            {/* Filter: Discharge Status */}
            <div className="flex flex-col gap-1.5">
              <label className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                <Filter className="h-3.5 w-3.5 text-cyan" />
                Effluent Discharge Status
              </label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="w-full rounded-lg border border-border bg-secondary px-3 py-2 text-xs font-medium text-foreground outline-none focus:border-cyan"
              >
                <option value="ALL">All Telemetry Records (Full Audit Trail)</option>
                <option value="CRITICAL">CRITICAL Only (Emergency Cutoffs & Breaches)</option>
                <option value="WARNING">WARNING Only (Elevated Pre-Threshold Pollution)</option>
                <option value="SAFE">SAFE Only (Normal Discharge Within Limits)</option>
              </select>
            </div>

            {/* Filter: Date Range Preset */}
            <div className="flex flex-col gap-1.5">
              <label className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                <Calendar className="h-3.5 w-3.5 text-cyan" />
                Time Horizon / Date Range
              </label>
              <select
                value={dateRangePreset}
                onChange={(e) => setDateRangePreset(e.target.value)}
                className="w-full rounded-lg border border-border bg-secondary px-3 py-2 text-xs font-medium text-foreground outline-none focus:border-cyan"
              >
                <option value="ALL">All Available Telemetry (Entire Database)</option>
                <option value="24H">Last 24 Hours</option>
                <option value="TODAY">Today (00:00 - Present)</option>
                <option value="7D">Past 7 Days</option>
                <option value="CUSTOM">Custom Date Window...</option>
              </select>
            </div>

            {/* Custom Date Window Input */}
            {dateRangePreset === "CUSTOM" && (
              <div className="grid grid-cols-2 gap-3 rounded-lg border border-border/70 bg-secondary/50 p-3">
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] font-medium text-muted-foreground">
                    Start Date
                  </label>
                  <input
                    type="date"
                    value={customStartDate}
                    onChange={(e) => setCustomStartDate(e.target.value)}
                    className="w-full rounded border border-border bg-secondary px-2.5 py-1.5 text-xs text-foreground outline-none focus:border-cyan"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] font-medium text-muted-foreground">End Date</label>
                  <input
                    type="date"
                    value={customEndDate}
                    onChange={(e) => setCustomEndDate(e.target.value)}
                    className="w-full rounded border border-border bg-secondary px-2.5 py-1.5 text-xs text-foreground outline-none focus:border-cyan"
                  />
                </div>
              </div>
            )}

            {/* Optional Minimum Risk Score */}
            <div className="flex flex-col gap-1.5">
              <label className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                <SlidersHorizontal className="h-3.5 w-3.5 text-cyan" />
                Minimum Pollution Risk Score (Optional)
              </label>
              <select
                value={minRiskScore}
                onChange={(e) => setMinRiskScore(e.target.value)}
                className="w-full rounded-lg border border-border bg-secondary px-3 py-2 text-xs font-medium text-foreground outline-none focus:border-cyan"
              >
                <option value="">No Risk Filter (0 to 100)</option>
                <option value="50">Moderate Risk and Above (≥ 50/100)</option>
                <option value="70">High Risk & Critical Only (≥ 70/100)</option>
                <option value="85">Extreme Critical Events Only (≥ 85/100)</option>
              </select>
            </div>

            {/* CSV Specification Details */}
            <div className="rounded-lg border border-border/60 bg-secondary/40 p-3 text-[11px] font-mono text-muted-foreground">
              <div className="font-semibold text-foreground/80 mb-1">CSV Output Columns:</div>
              timestamp, ph, tds, turbidity, temperature, flow_rate, pollution_score, status
            </div>

            {/* Status Messages */}
            {successMessage && (
              <div className="flex items-center gap-2 rounded-lg border border-safe/50 bg-safe/10 p-2.5 text-xs text-safe">
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                <span>{successMessage}</span>
              </div>
            )}

            {errorMessage && (
              <div className="flex items-center gap-2 rounded-lg border border-critical/50 bg-critical/10 p-2.5 text-xs text-critical">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{errorMessage}</span>
              </div>
            )}

            {/* Action Buttons */}
            <div className="mt-2 flex items-center justify-end gap-3 border-t border-border/50 pt-3">
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="rounded-lg border border-border bg-secondary px-4 py-2 text-xs font-semibold text-foreground transition-colors hover:bg-accent"
              >
                Close
              </button>
              <button
                type="button"
                id="btn-confirm-download-report"
                onClick={() => executeDownload()}
                disabled={isDownloading}
                className="flex items-center gap-2 rounded-lg border border-cyan/60 bg-cyan px-4 py-2 text-xs font-bold text-black transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {isDownloading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin text-black" />
                    <span>Processing CSV...</span>
                  </>
                ) : (
                  <>
                    <Download className="h-4 w-4 text-black" />
                    <span>Download CSV Report</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

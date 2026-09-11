import { useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { Home, Activity, Bell, Clock, BarChart3, Settings, Droplet } from "lucide-react";
import industrial from "@/assets/industrial-outfall.jpg";
import { cn } from "@/lib/utils";
import { AuthDialog } from "./AuthDialog";

const items: { label: string; icon: typeof Home; to?: "/" | "/history" | "/analytics" }[] = [
  { label: "Overview", icon: Home, to: "/" },
  { label: "Live Monitoring", icon: Activity, to: "/" },
  { label: "Alerts", icon: Bell },
  { label: "History", icon: Clock, to: "/history" },
  { label: "Analytics", icon: BarChart3, to: "/analytics" },
  { label: "Settings", icon: Settings },
];

const linkClass = (isActive: boolean) =>
  cn(
    "flex items-center gap-3 rounded-xl px-3 py-3 text-left text-[15px] transition-colors",
    isActive
      ? "border border-primary/45 bg-primary/12 text-cyan shadow-[0_0_18px_-8px_color-mix(in_oklab,var(--cyan)_60%,transparent)]"
      : "border border-transparent text-muted-foreground hover:bg-accent/50 hover:text-foreground",
  );

export function Sidebar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [active, setActive] = useState("Overview");

  return (
    <aside className="scada-panel relative flex w-full shrink-0 flex-col overflow-hidden bg-sidebar p-4 lg:h-[calc(100vh-2rem)] lg:w-[264px]">
      <div className="flex items-center gap-3 px-1 pb-5 pt-1">
        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-primary/40 bg-primary/10">
          <Droplet className="h-6 w-6 text-cyan" />
        </div>
        <div className="min-w-0">
          <h1 className="font-display text-xl leading-none font-bold tracking-wide">
            <span className="text-foreground">EFFLUENT</span>
            <span className="text-cyan"> DASHBOARD</span>
          </h1>
          <p className="mt-1 text-[11px] leading-tight text-muted-foreground">
            Industrial Effluent Monitoring &amp; Safety Control
          </p>
        </div>
      </div>

      <nav className="flex flex-col gap-1.5">
        {items.map(({ label, icon: Icon, to }) => {
          const isActive = to
            ? pathname === to && (to !== "/" || active === label)
            : active === label && pathname === "/";

          if (to) {
            return (
              <Link
                key={label}
                to={to}
                onClick={() => setActive(label)}
                className={linkClass(isActive)}
              >
                <Icon className={cn("h-5 w-5 shrink-0", isActive && "text-cyan")} />
                <span className="truncate font-medium">{label}</span>
              </Link>
            );
          }

          return (
            <button key={label} onClick={() => setActive(label)} className={linkClass(isActive)}>
              <Icon className={cn("h-5 w-5 shrink-0", isActive && "text-cyan")} />
              <span className="truncate font-medium">{label}</span>
            </button>
          );
        })}
      </nav>

      <AuthDialog />

      <div className="relative mt-4 flex-1 overflow-hidden rounded-xl">
        <img
          src={industrial}
          alt="Industrial effluent discharge outfall at night"
          loading="lazy"
          width={672}
          height={992}
          className="h-full min-h-[220px] w-full object-cover opacity-90"
        />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-sidebar via-transparent to-sidebar/80" />
      </div>
    </aside>
  );
}

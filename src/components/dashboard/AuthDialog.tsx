import { useState, useEffect } from "react";
import { User, LogIn, LogOut, ShieldCheck, KeyRound, UserPlus } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface UserProfile {
  id: number;
  full_name: string;
  email: string;
  role: "ADMIN" | "USER";
}

export function AuthDialog() {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"login" | "register">("login");
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Form states
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");

  // Check existing token on mount
  useEffect(() => {
    const token = localStorage.getItem("scada_access_token");
    if (!token) return;

    fetch("/api/me", {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(async (res) => {
        if (res.ok) {
          const user = await res.json();
          setCurrentUser(user);
        } else {
          localStorage.removeItem("scada_access_token");
          localStorage.removeItem("scada_refresh_token");
        }
      })
      .catch(() => {
        // network issue
      });
  }, []);

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg(null);

    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Authentication failed");
      }

      localStorage.setItem("scada_access_token", data.access_token);
      localStorage.setItem("scada_refresh_token", data.refresh_token);
      setCurrentUser(data.user);
      setOpen(false);
      setPassword("");
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  };

  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg(null);

    try {
      const res = await fetch("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ full_name: fullName, email, password }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Registration failed");
      }

      localStorage.setItem("scada_access_token", data.access_token);
      localStorage.setItem("scada_refresh_token", data.refresh_token);
      setCurrentUser(data.user);
      setOpen(false);
      setPassword("");
      setFullName("");
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Registration failed");
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("scada_access_token");
    localStorage.removeItem("scada_refresh_token");
    setCurrentUser(null);
  };

  return (
    <div className="mt-3 border-t border-border/50 pt-3">
      {currentUser ? (
        <div className="flex flex-col gap-2 rounded-xl border border-primary/20 bg-primary/5 p-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="grid h-7 w-7 place-items-center rounded-lg bg-cyan/15 text-cyan">
                <ShieldCheck className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <p className="truncate text-xs font-semibold text-foreground">
                  {currentUser.full_name}
                </p>
                <p className="text-[10px] text-cyan font-mono">{currentUser.role} Session</p>
              </div>
            </div>
            <button
              onClick={handleLogout}
              title="Sign Out"
              className="rounded-lg p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
            >
              <LogOut className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      ) : (
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <button className="flex w-full items-center justify-between rounded-xl border border-border/40 bg-accent/30 px-3 py-2 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground">
              <span className="flex items-center gap-2">
                <KeyRound className="h-3.5 w-3.5 text-cyan" />
                <span>Operator Login</span>
              </span>
              <span className="rounded bg-cyan/15 px-1.5 py-0.5 text-[9px] font-semibold text-cyan">
                JWT Auth
              </span>
            </button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 font-display text-lg">
                <ShieldCheck className="h-5 w-5 text-cyan" />
                {mode === "login" ? "SCADA Operator Authentication" : "Register Plant Operator"}
              </DialogTitle>
            </DialogHeader>

            <div className="flex rounded-lg bg-muted p-1 text-xs">
              <button
                type="button"
                onClick={() => {
                  setMode("login");
                  setErrorMsg(null);
                }}
                className={`flex-1 rounded-md py-1.5 font-medium transition-colors ${
                  mode === "login"
                    ? "bg-background text-foreground shadow"
                    : "text-muted-foreground"
                }`}
              >
                Sign In
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode("register");
                  setErrorMsg(null);
                }}
                className={`flex-1 rounded-md py-1.5 font-medium transition-colors ${
                  mode === "register"
                    ? "bg-background text-foreground shadow"
                    : "text-muted-foreground"
                }`}
              >
                Register
              </button>
            </div>

            {errorMsg && (
              <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-2.5 text-xs text-destructive">
                {errorMsg}
              </div>
            )}

            {mode === "login" ? (
              <form onSubmit={handleLoginSubmit} className="space-y-3 pt-1">
                <div className="space-y-1">
                  <Label className="text-xs">Operator Email</Label>
                  <Input
                    type="email"
                    required
                    placeholder="operator@plant.internal"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Password</Label>
                  <Input
                    type="password"
                    required
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </div>
                <Button type="submit" disabled={loading} className="w-full">
                  {loading ? "Authenticating..." : "Authenticate Session"}
                </Button>
              </form>
            ) : (
              <form onSubmit={handleRegisterSubmit} className="space-y-3 pt-1">
                <div className="space-y-1">
                  <Label className="text-xs">Full Name</Label>
                  <Input
                    required
                    placeholder="Jane Operator"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Operator Email</Label>
                  <Input
                    type="email"
                    required
                    placeholder="operator@plant.internal"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Password (min 6 characters)</Label>
                  <Input
                    type="password"
                    required
                    minLength={6}
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </div>
                <Button type="submit" disabled={loading} className="w-full">
                  {loading ? "Creating Account..." : "Create Operator Account"}
                </Button>
              </form>
            )}
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

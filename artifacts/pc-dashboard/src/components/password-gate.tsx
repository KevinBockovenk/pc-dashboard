import { useState, useRef, useEffect, type FormEvent } from "react";
import { useAuth } from "../hooks/use-auth";
import { Lock, Eye, EyeOff } from "lucide-react";

export default function PasswordGate({ children }: { children: React.ReactNode }) {
  const { authenticated, isLoading, login, loginPending, loginError } = useAuth();
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [shake, setShake] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!authenticated && !isLoading) {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [authenticated, isLoading]);

  useEffect(() => {
    if (loginError) {
      setShake(true);
      setPassword("");
      const t = setTimeout(() => setShake(false), 600);
      return () => clearTimeout(t);
    }
  }, [loginError]);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="w-2 h-2 rounded-full bg-primary animate-ping" />
      </div>
    );
  }

  if (authenticated) {
    return <>{children}</>;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!password || loginPending) return;
    try {
      await login(password);
    } catch {
      // error handled via loginError
    }
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center font-mono">
      {/* Subtle grid background */}
      <div
        className="fixed inset-0 pointer-events-none opacity-[0.03]"
        style={{
          backgroundImage:
            "linear-gradient(hsl(var(--primary)) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--primary)) 1px, transparent 1px)",
          backgroundSize: "40px 40px",
        }}
      />

      <div className="relative w-full max-w-sm px-6">
        {/* Logo / title */}
        <div className="mb-10 text-center">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-full border border-primary/30 bg-primary/10 mb-5">
            <Lock className="w-6 h-6 text-primary" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            MISSION CONTROL
          </h1>
          <p className="text-xs text-muted-foreground mt-1 tracking-widest uppercase">
            Authentication required
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div
            className={`relative transition-transform duration-150 ${
              shake ? "animate-[shake_0.4s_ease-in-out]" : ""
            }`}
            style={
              shake
                ? { animation: "shake 0.4s ease-in-out" }
                : {}
            }
          >
            <input
              ref={inputRef}
              type={showPw ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter password"
              autoComplete="current-password"
              className={`w-full bg-secondary/30 border rounded px-4 py-3 pr-10 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 transition-colors ${
                loginError
                  ? "border-destructive focus:border-destructive focus:ring-destructive/40"
                  : "border-border focus:border-primary focus:ring-primary/40"
              }`}
            />
            <button
              type="button"
              onClick={() => setShowPw((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              tabIndex={-1}
            >
              {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>

          {loginError && (
            <p className="text-xs text-destructive px-1">{loginError}</p>
          )}

          <button
            type="submit"
            disabled={!password || loginPending}
            className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-bold py-3 rounded text-sm tracking-widest uppercase disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            {loginPending ? (
              <span className="inline-flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-current animate-ping" />
                Verifying...
              </span>
            ) : (
              "Authenticate"
            )}
          </button>
        </form>
      </div>

      <style>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          20% { transform: translateX(-8px); }
          40% { transform: translateX(8px); }
          60% { transform: translateX(-5px); }
          80% { transform: translateX(5px); }
        }
      `}</style>
    </div>
  );
}

import { useEffect, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/supabase";

export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const { user, loading, signIn, signUp } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  // Where to go after auth: a same-origin `next` param (used by /authorize) or home.
  function redirectAfterAuth() {
    if (typeof window !== "undefined") {
      const next = new URLSearchParams(window.location.search).get("next");
      if (next && next.startsWith("/")) {
        window.location.assign(next);
        return;
      }
    }
    navigate({ to: "/" });
  }

  // Already signed in? Bounce onward.
  useEffect(() => {
    if (!loading && user) redirectAfterAuth();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, user]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setInfo(null);
    if (!email.trim() || !password) {
      setErr("Enter your email and password.");
      return;
    }
    setBusy(true);
    try {
      if (mode === "login") {
        const { error } = await signIn(email.trim(), password);
        if (error) setErr(error);
        else redirectAfterAuth();
      } else {
        const { error, needsConfirm } = await signUp(email.trim(), password);
        if (error) setErr(error);
        else if (needsConfirm) setInfo("Check your inbox to confirm your email, then log in.");
        else redirectAfterAuth();
      }
    } finally {
      setBusy(false);
    }
  }

  const isLogin = mode === "login";

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-10">
      <div className="mb-6 text-center">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-primary to-accent text-2xl font-black text-white shadow-md">
          L
        </div>
        <h1 className="mt-3 text-3xl">{isLogin ? "Welcome back" : "Create your account"}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {isLogin ? "Log in to keep your XP, streaks & badges." : "Sign up to save your progress across devices."}
        </p>
      </div>

      <form onSubmit={onSubmit} className="glass-card space-y-4 p-6">
        {!isSupabaseConfigured && (
          <div className="rounded-2xl bg-destructive/10 p-3 text-sm text-destructive">
            ⚠ Supabase isn't configured yet. Add <code>VITE_SUPABASE_URL</code> and{" "}
            <code>VITE_SUPABASE_ANON_KEY</code> to your <code>.env</code> and restart.
          </div>
        )}

        <div>
          <label className="mb-1 block text-xs font-bold uppercase tracking-widest text-muted-foreground">
            Email
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            placeholder="you@example.com"
            className="w-full rounded-2xl border border-border bg-white/70 px-4 py-3 text-sm outline-none focus:border-primary"
          />
        </div>

        <div>
          <label className="mb-1 block text-xs font-bold uppercase tracking-widest text-muted-foreground">
            Password
          </label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={isLogin ? "current-password" : "new-password"}
            placeholder={isLogin ? "Your password" : "At least 6 characters"}
            className="w-full rounded-2xl border border-border bg-white/70 px-4 py-3 text-sm outline-none focus:border-primary"
          />
        </div>

        {err && <div className="rounded-2xl bg-destructive/10 p-3 text-sm text-destructive">⚠ {err}</div>}
        {info && <div className="rounded-2xl bg-success/20 p-3 text-sm">✉️ {info}</div>}

        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-2xl bg-primary px-5 py-3 text-sm font-bold text-primary-foreground shadow-[var(--shadow-pop)] transition hover:-translate-y-0.5 disabled:opacity-60"
        >
          {busy ? "Please wait…" : isLogin ? "🔓 Log in" : "✨ Sign up"}
        </button>

        <div className="text-center text-sm text-muted-foreground">
          {isLogin ? (
            <>
              No account yet?{" "}
              <Link to="/register" className="font-bold text-primary hover:underline">
                Sign up
              </Link>
            </>
          ) : (
            <>
              Already have an account?{" "}
              <Link to="/login" className="font-bold text-primary hover:underline">
                Log in
              </Link>
            </>
          )}
        </div>
      </form>

      <div className="mt-4 text-center">
        <Link to="/" className="text-xs text-muted-foreground hover:underline">
          ← Back to Lumi
        </Link>
      </div>
    </div>
  );
}

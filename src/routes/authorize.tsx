import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/authorize")({
  component: AuthorizePage,
});

type Params = {
  client_id: string;
  redirect_uri: string;
  code_challenge?: string;
  code_challenge_method?: string;
  scope?: string;
  state?: string;
  response_type?: string;
};

function AuthorizePage() {
  const { user, session, loading } = useAuth();
  const [params, setParams] = useState<Params | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Parse query params on the client.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const client_id = q.get("client_id") || "";
    const redirect_uri = q.get("redirect_uri") || "";
    if (!client_id || !redirect_uri) {
      setErr("Missing client_id or redirect_uri.");
      return;
    }
    setParams({
      client_id,
      redirect_uri,
      code_challenge: q.get("code_challenge") || undefined,
      code_challenge_method: q.get("code_challenge_method") || undefined,
      scope: q.get("scope") || undefined,
      state: q.get("state") || undefined,
      response_type: q.get("response_type") || undefined,
    });
  }, []);

  // Not logged in → send to login, then come back to this exact URL.
  useEffect(() => {
    if (loading || user || !params) return;
    const here = window.location.pathname + window.location.search;
    window.location.assign(`/login?next=${encodeURIComponent(here)}`);
  }, [loading, user, params]);

  async function approve() {
    if (!params || !session) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/oauth/authorize", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({
          client_id: params.client_id,
          redirect_uri: params.redirect_uri,
          code_challenge: params.code_challenge,
          code_challenge_method: params.code_challenge_method,
          scope: params.scope,
          state: params.state,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.redirect) throw new Error(json.error_description || json.error || `HTTP ${res.status}`);
      window.location.assign(json.redirect as string);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Authorization failed");
      setBusy(false);
    }
  }

  function deny() {
    if (!params) return;
    const url = new URL(params.redirect_uri);
    url.searchParams.set("error", "access_denied");
    if (params.state) url.searchParams.set("state", params.state);
    window.location.assign(url.toString());
  }

  if (err) {
    return <Center emoji="⚠️" title="Authorization error"><p className="mt-1 text-sm text-destructive">{err}</p></Center>;
  }
  if (loading || !params || !user) {
    return <Center emoji="⏳" title="Loading…" />;
  }

  let host = params.redirect_uri;
  try { host = new URL(params.redirect_uri).host; } catch { /* ignore */ }

  return (
    <Center emoji="🔗" title="Connect to Lumi">
      <p className="mt-1 text-sm text-muted-foreground">
        An app wants to connect to your Lumi account to create and read your lessons on your behalf.
      </p>
      <div className="mt-4 space-y-1 rounded-2xl bg-white/60 p-4 text-left text-sm">
        <div><span className="text-muted-foreground">Account:</span> <b>{user.email}</b></div>
        <div className="truncate"><span className="text-muted-foreground">Redirect:</span> {host}</div>
        <div><span className="text-muted-foreground">Access:</span> create lessons · read your lessons · share links</div>
      </div>
      <div className="mt-5 flex justify-center gap-2">
        <button onClick={approve} disabled={busy} className="rounded-2xl bg-primary px-5 py-3 text-sm font-bold text-primary-foreground shadow-[var(--shadow-pop)] disabled:opacity-60">
          {busy ? "Connecting…" : "✅ Approve"}
        </button>
        <button onClick={deny} disabled={busy} className="rounded-2xl bg-secondary px-5 py-3 text-sm font-bold disabled:opacity-60">
          Deny
        </button>
      </div>
    </Center>
  );
}

function Center({ emoji, title, children }: { emoji: string; title: string; children?: React.ReactNode }) {
  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 text-center">
      <div className="glass-card p-8">
        <div className="text-6xl">{emoji}</div>
        <h1 className="mt-3 text-2xl">{title}</h1>
        {children}
      </div>
    </div>
  );
}

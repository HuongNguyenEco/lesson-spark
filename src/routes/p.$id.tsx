import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { fetchLesson, type LessonRecord } from "@/lib/lessons";
import { useProgress, applyXp, markQuest, addBadge } from "@/lib/progress";
import { useAuth } from "@/lib/auth";
import { xpToLevel, levelTitle } from "@/lib/scoring";
import { LessonPlayer } from "@/components/lesson-player";

export const Route = createFileRoute("/p/$id")({
  component: PreviewPage,
});

const NICK_KEY = "lumi:nickname";
const PREVIEW_HISTORY_KEY = "lumi:preview-history:v1";

type PreviewHistoryEntry = { id: string; title: string; xp: number; nickname: string; at: string };

function upsertPreviewHistory(entry: { id: string; title: string; xp: number; nickname: string }) {
  try {
    const raw = localStorage.getItem(PREVIEW_HISTORY_KEY);
    const list: PreviewHistoryEntry[] = raw ? JSON.parse(raw) : [];
    const now = new Date().toISOString();
    const idx = list.findIndex((e) => e.id === entry.id);
    if (idx >= 0) {
      list[idx] = { ...list[idx], xp: list[idx].xp + entry.xp, nickname: entry.nickname, at: now };
    } else {
      list.unshift({ ...entry, at: now });
    }
    localStorage.setItem(PREVIEW_HISTORY_KEY, JSON.stringify(list.slice(0, 50)));
  } catch { /* ignore */ }
}

function PreviewPage() {
  const { id } = useParams({ from: "/p/$id" });
  const { user } = useAuth();
  const [progress, setProgress] = useProgress();

  const [rec, setRec] = useState<LessonRecord | null>(null);
  const [state, setState] = useState<"loading" | "ok" | "notfound">("loading");
  const [sessionXp, setSessionXp] = useState(0);
  const [nickname, setNickname] = useState("");

  useEffect(() => {
    try { setNickname(localStorage.getItem(NICK_KEY) || ""); } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    let alive = true;
    setState("loading");
    fetchLesson(id).then((r) => {
      if (!alive) return;
      setRec(r);
      setState(r ? "ok" : "notfound");
    });
    return () => { alive = false; };
  }, [id]);

  function saveNickname(v: string) {
    setNickname(v);
    try { localStorage.setItem(NICK_KEY, v); } catch { /* ignore */ }
  }

  // XP earned in the preview flows into the shared progress (Supabase when
  // signed in, localStorage when a guest) plus a local "studied previews" list.
  const onXP = useCallback((n: number) => {
    if (n <= 0) return;
    setSessionXp((s) => s + n);
    setProgress((prev) => applyXp(prev, n));
    if (rec) {
      upsertPreviewHistory({
        id: rec.id,
        title: rec.data.title,
        xp: n,
        nickname: (user?.email ?? nickname) || "Guest",
      });
    }
  }, [rec, user, nickname, setProgress]);

  const onQuest = useCallback((qid: string) => setProgress((p) => markQuest(p, qid)), [setProgress]);
  const awardBadge = useCallback((bid: string) => setProgress((p) => addBadge(p, bid)), [setProgress]);

  const { level } = xpToLevel(progress.xp);

  if (state === "loading") {
    return <CenterCard emoji="⏳" title="Loading preview…" />;
  }
  if (state === "notfound" || !rec) {
    return (
      <CenterCard emoji="🔒" title="Lesson not available">
        <p className="mt-1 text-sm text-muted-foreground">
          This preview is private or doesn't exist. If it's yours, log in to open it.
        </p>
        <div className="mt-4 flex justify-center gap-2">
          <Link to="/login" className="rounded-2xl bg-primary px-5 py-3 text-sm font-bold text-primary-foreground">Log in</Link>
          <Link to="/" className="rounded-2xl bg-secondary px-5 py-3 text-sm font-bold">Home</Link>
        </div>
      </CenterCard>
    );
  }

  const lesson = rec.data;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 md:px-8">
      {/* Header */}
      <header className="glass-card flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between md:p-5">
        <div className="flex items-center gap-3">
          <Link to="/" className="grid h-11 w-11 place-items-center rounded-2xl bg-gradient-to-br from-primary to-accent text-lg font-black text-white shadow-md">L</Link>
          <div>
            <div className="text-lg font-black leading-none">Lumi · Shared lesson</div>
            <div className="text-[11px] text-muted-foreground">Read-only preview · no AI actions</div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="chip !bg-lemon">⚡ {sessionXp} XP this session</span>
          <span className="chip !bg-lavender/70">Lv {level} · {levelTitle(level)}</span>
          {user ? (
            <span className="chip !bg-mint/70 max-w-[160px] truncate" title={user.email ?? ""}>👤 {user.email}</span>
          ) : (
            <input
              value={nickname}
              onChange={(e) => saveNickname(e.target.value)}
              placeholder="Your name (guest)"
              className="rounded-full border border-border bg-white/70 px-3 py-1.5 text-sm outline-none focus:border-primary"
            />
          )}
        </div>
      </header>

      {/* Notice about where progress is saved */}
      <div className={`mt-4 rounded-2xl p-3 text-sm ${user ? "bg-mint/30" : "bg-peach/30"}`}>
        {user
          ? "☁️ You're logged in — your XP syncs to your account."
          : "💾 You're a guest — your XP is saved on this device only. Log in to sync across devices."}
      </div>

      {/* Lesson */}
      <section className="mt-6">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="chip !bg-lavender/70">Level: {lesson.level}</span>
          <span className="chip !bg-mint/70">{lesson.vocabulary.length} words</span>
        </div>
        <h1 className="mt-2 text-3xl md:text-4xl">{lesson.title}</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{lesson.intro}</p>
      </section>

      <LessonPlayer lesson={lesson} onXP={onXP} onQuest={onQuest} awardBadge={awardBadge} hideAI />

      <footer className="mt-12 pb-8 text-center text-xs text-muted-foreground">
        <Link to="/" className="hover:underline">Made with 💗 on Lumi — create your own lesson →</Link>
      </footer>
    </div>
  );
}

function CenterCard({ emoji, title, children }: { emoji: string; title: string; children?: React.ReactNode }) {
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

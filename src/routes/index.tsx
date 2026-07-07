import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { type Lesson } from "@/lib/lesson-types";
import { authHeaders, useApiKey } from "@/lib/settings";
import { useTheme, type Theme } from "@/lib/theme";
import { useProgress, applyXp, markQuest, addBadge } from "@/lib/progress";
import { useAuth } from "@/lib/auth";
import { useLessonHistory, type LessonRecord } from "@/lib/lessons";
import { QUESTS, xpToLevel, levelTitle } from "@/lib/scoring";
import { LessonPlayer, BadgeShelf, Confetti } from "@/components/lesson-player";
import { ShareModal } from "@/components/share-modal";
import { Link } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  component: LumiApp,
});

/* ---------------- Root ---------------- */
function LumiApp() {
  const [lesson, setLesson] = useState<Lesson | null>(null);
  const [savedLessonId, setSavedLessonId] = useState<string | null>(null);
  const [lessonKey, setLessonKey] = useState(0); // remount LessonPlayer on new lesson
  const [source, setSource] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [progress, setProgress] = useProgress();
  const { theme, setTheme, isDark } = useTheme();
  const { user, signOut } = useAuth();
  const history = useLessonHistory();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [authGateOpen, setAuthGateOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [xpBurst, setXpBurst] = useState<{ id: number; amount: number } | null>(null);
  const [levelUp, setLevelUp] = useState<number | null>(null);
  const [confetti, setConfetti] = useState(false);
  const prevLevel = useRef(xpToLevel(progress.xp).level);

  const { level, into, need } = xpToLevel(progress.xp);
  useEffect(() => {
    if (level > prevLevel.current) {
      setLevelUp(level);
      setConfetti(true);
      window.setTimeout(() => setLevelUp(null), 2200);
      window.setTimeout(() => setConfetti(false), 2400);
    }
    prevLevel.current = level;
  }, [level]);

  // Gate any API-calling action behind login. Returns true if allowed.
  const requireAuth = useCallback(() => {
    if (user) return true;
    setAuthGateOpen(true);
    return false;
  }, [user]);

  const addXP = useCallback((amount: number) => {
    if (amount <= 0) return;
    setProgress((prev) => applyXp(prev, amount));
    setXpBurst({ id: Date.now(), amount });
    window.setTimeout(() => setXpBurst(null), 900);
  }, [setProgress]);

  const completeQuest = useCallback((id: string) => {
    setProgress((prev) => markQuest(prev, id));
  }, [setProgress]);

  const awardBadge = useCallback((id: string) => {
    setProgress((prev) => addBadge(prev, id));
  }, [setProgress]);

  async function generateLesson() {
    if (!requireAuth()) return;
    if (!source.trim()) {
      setErr("Paste some text or a topic first.");
      return;
    }
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch("/api/lesson", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ source }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      const newLesson = json.lesson as Lesson;
      setLesson(newLesson);
      setSavedLessonId(null);
      setLessonKey((k) => k + 1);
      // Persist to history and keep the new row id for sharing.
      const rec = await history.save(newLesson, source);
      if (rec) setSavedLessonId(rec.id);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  // Reload a saved lesson from history.
  function openSaved(rec: LessonRecord) {
    setLesson(rec.data);
    setSavedLessonId(rec.id);
    setSource(rec.source ?? "");
    setLessonKey((k) => k + 1);
    setHistoryOpen(false);
    setErr(null);
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    setSource(text.slice(0, 15000));
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 md:px-8">
      <TopBar level={level} into={into} need={need} xp={progress.xp} streak={progress.streak} isDark={isDark} onToggleTheme={() => setTheme(isDark ? "light" : "dark")} onSettings={() => setSettingsOpen(true)} onHistory={() => { if (requireAuth()) setHistoryOpen(true); }} userEmail={user?.email ?? null} onSignOut={signOut} />

      {/* Uploader */}
      <section className="glass-card mt-6 p-6 md:p-8">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="text-3xl md:text-4xl">Turn any text into a lesson ✨</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Paste a paragraph, article, or topic — Lumi builds vocabulary, quizzes & games instantly.
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => { if (requireAuth()) setHistoryOpen(true); }}
              className="chip hover:bg-white"
              title="Your saved lessons"
            >
              📚 History
            </button>
            <label className="chip cursor-pointer hover:bg-white">
              📎 Upload .txt
              <input type="file" accept=".txt,.md,text/plain" className="hidden" onChange={onFile} />
            </label>
          </div>
        </div>
        <textarea
          value={source}
          onChange={(e) => setSource(e.target.value)}
          placeholder="Paste a topic or paragraph here (e.g., 'Airport check-in vocabulary')..."
          className="mt-4 h-28 w-full resize-none rounded-2xl border border-border bg-white/70 p-4 text-sm outline-none focus:border-primary"
        />
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button
            onClick={generateLesson}
            disabled={loading}
            className="rounded-2xl bg-primary px-5 py-3 text-sm font-bold text-primary-foreground shadow-[var(--shadow-pop)] transition hover:-translate-y-0.5 disabled:opacity-60"
          >
            {loading ? "Generating…" : "✨ Generate lesson"}
          </button>
          {err && <span className="text-sm text-destructive">⚠ {err}</span>}
          <span className="ml-auto text-xs text-muted-foreground">
            Powered by Coachio · Gemini 3.1 Flash Lite
          </span>
        </div>
      </section>

      {/* Daily quests — always visible */}
      <section className="mt-6 flex justify-end">
        <DailyQuests quests={progress.quests} />
      </section>

      {lesson ? (
        <>
          {/* Lesson header */}
          <section className="mt-6 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className="chip !bg-lavender/70">Level: {lesson.level}</span>
                <span className="chip !bg-mint/70">{lesson.vocabulary.length} words</span>
              </div>
              <h2 className="mt-2 text-3xl md:text-4xl">{lesson.title}</h2>
              <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{lesson.intro}</p>
            </div>
            <button
              onClick={() => { if (savedLessonId) setShareOpen(true); }}
              disabled={!savedLessonId}
              title={savedLessonId ? "Share a preview link" : "Saving…"}
              className="chip !bg-sky/80 hover:bg-white disabled:opacity-50"
            >
              🔗 Share
            </button>
          </section>

          <LessonPlayer
            key={lessonKey}
            lesson={lesson}
            onXP={addXP}
            onQuest={completeQuest}
            awardBadge={awardBadge}
            requireAuth={requireAuth}
          />
        </>
      ) : (
        <EmptyState isAuthed={!!user} onGenerate={generateLesson} onLoginGate={() => setAuthGateOpen(true)} />
      )}

      <BadgeShelf badges={progress.badges} />

      <footer className="mt-12 pb-8 text-center text-xs text-muted-foreground">
        Made with 💗 for ESL learners.
      </footer>

      {/* Overlays */}
      {xpBurst && (
        <div
          key={xpBurst.id}
          className="pointer-events-none fixed left-1/2 top-24 z-50 -translate-x-1/2 animate-float-up rounded-full bg-success px-4 py-2 text-sm font-black text-success-foreground shadow-lg"
        >
          +{xpBurst.amount} XP
        </div>
      )}
      {levelUp && (
        <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center">
          <div className="animate-pop-in rounded-3xl bg-white/90 px-8 py-6 text-center shadow-2xl backdrop-blur">
            <div className="text-6xl">🎉</div>
            <div className="mt-2 text-xs uppercase tracking-widest text-muted-foreground">Level up</div>
            <div className="text-4xl font-black">Level {levelUp}</div>
          </div>
        </div>
      )}
      {confetti && <Confetti />}
      {settingsOpen && <SettingsPanel theme={theme} setTheme={setTheme} onClose={() => setSettingsOpen(false)} />}
      {authGateOpen && <AuthGateModal onClose={() => setAuthGateOpen(false)} />}
      {historyOpen && (
        <HistoryModal history={history} onOpen={openSaved} onClose={() => setHistoryOpen(false)} />
      )}
      {shareOpen && savedLessonId && (
        <ShareModal lessonId={savedLessonId} onClose={() => setShareOpen(false)} />
      )}
    </div>
  );
}

/* ---------------- Empty state (no lesson yet) ---------------- */
function EmptyState({ isAuthed, onGenerate, onLoginGate }: { isAuthed: boolean; onGenerate: () => void; onLoginGate: () => void }) {
  return (
    <section className="glass-card mt-6 flex flex-col items-center gap-4 p-10 text-center md:p-16">
      <div className="text-6xl">🪄</div>
      <h2 className="text-2xl md:text-3xl">No lesson yet</h2>
      <p className="max-w-md text-sm text-muted-foreground">
        Paste a topic or paragraph above and tap <b>Generate lesson</b>. Lumi turns it into
        flashcards, quizzes, matching games and more.
      </p>
      {isAuthed ? (
        <button
          onClick={onGenerate}
          className="rounded-2xl bg-primary px-6 py-3 text-sm font-bold text-primary-foreground shadow-[var(--shadow-pop)] transition hover:-translate-y-0.5"
        >
          ✨ Generate your first lesson
        </button>
      ) : (
        <button
          onClick={onLoginGate}
          className="rounded-2xl bg-primary px-6 py-3 text-sm font-bold text-primary-foreground shadow-[var(--shadow-pop)] transition hover:-translate-y-0.5"
        >
          🔓 Log in to start
        </button>
      )}
    </section>
  );
}

/* ---------------- Login-required gate ---------------- */
function AuthGateModal({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div className="glass-card w-full max-w-sm animate-pop-in p-6 text-center" onClick={(e) => e.stopPropagation()}>
        <div className="text-5xl">🔒</div>
        <h3 className="mt-3 text-2xl">Login required</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Sign in to generate lessons, create AI images, and save your progress across devices.
        </p>
        <div className="mt-5 flex justify-center gap-2">
          <Link
            to="/login"
            className="rounded-2xl bg-primary px-5 py-3 text-sm font-bold text-primary-foreground shadow-[var(--shadow-pop)] transition hover:-translate-y-0.5"
          >
            🔓 Log in
          </Link>
          <Link
            to="/register"
            className="rounded-2xl bg-secondary px-5 py-3 text-sm font-bold transition hover:-translate-y-0.5"
          >
            ✨ Sign up
          </Link>
        </div>
        <button onClick={onClose} className="mt-3 text-xs text-muted-foreground hover:underline">
          Maybe later
        </button>
      </div>
    </div>
  );
}

/* ---------------- Lesson history ---------------- */
function HistoryModal({
  history,
  onOpen,
  onClose,
}: {
  history: ReturnType<typeof useLessonHistory>;
  onOpen: (rec: LessonRecord) => void;
  onClose: () => void;
}) {
  const { items, loading, remove } = history;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="glass-card flex max-h-[80vh] w-full max-w-lg animate-pop-in flex-col p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-2xl">📚 Lesson history</h3>
          <button
            onClick={onClose}
            aria-label="Close"
            className="grid h-8 w-8 place-items-center rounded-xl bg-white/70 hover:bg-white"
          >
            ✕
          </button>
        </div>
        {loading ? (
          <div className="py-10 text-center text-sm text-muted-foreground">Loading…</div>
        ) : items.length === 0 ? (
          <div className="py-10 text-center text-sm text-muted-foreground">
            No saved lessons yet. Generate one and it'll appear here.
          </div>
        ) : (
          <ul className="space-y-2 overflow-y-auto">
            {items.map((rec) => (
              <li
                key={rec.id}
                className="flex items-center gap-2 rounded-2xl bg-white/70 p-3"
              >
                <button onClick={() => onOpen(rec)} className="flex-1 text-left">
                  <div className="font-bold">{rec.title}</div>
                  <div className="text-xs text-muted-foreground">
                    {rec.level ? `${rec.level} · ` : ""}
                    {rec.data.vocabulary?.length ?? 0} words ·{" "}
                    {new Date(rec.created_at).toLocaleDateString()}
                  </div>
                </button>
                <button
                  onClick={() => onOpen(rec)}
                  className="rounded-xl bg-primary px-3 py-2 text-xs font-bold text-primary-foreground"
                >
                  Open
                </button>
                <button
                  onClick={() => remove(rec.id)}
                  title="Delete"
                  className="grid h-8 w-8 place-items-center rounded-xl bg-white/70 hover:bg-destructive/10"
                >
                  🗑
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

/* ---------------- Top bar ---------------- */
function TopBar({ level, into, need, xp, streak, isDark, onToggleTheme, onSettings, onHistory, userEmail, onSignOut }: { level: number; into: number; need: number; xp: number; streak: number; isDark: boolean; onToggleTheme: () => void; onSettings: () => void; onHistory: () => void; userEmail: string | null; onSignOut: () => void }) {
  const pct = Math.min(100, Math.round((into / need) * 100));
  return (
    <header className="glass-card flex flex-col gap-3 p-4 md:flex-row md:items-center md:gap-6 md:p-5">
      <div className="flex items-center gap-3">
        <div className="grid h-11 w-11 place-items-center rounded-2xl bg-gradient-to-br from-primary to-accent text-lg font-black text-white shadow-md">
          L
        </div>
        <div>
          <div className="text-lg font-black leading-none">Lumi</div>
          <div className="text-[11px] text-muted-foreground">Play. Learn. Level up.</div>
        </div>
      </div>
      <div className="flex-1">
        <div className="mb-1 flex items-center justify-between text-xs font-semibold">
          <span>Level {level} · {levelTitle(level)}</span>
          <span className="text-muted-foreground">{into} / {need} XP</span>
        </div>
        <div className="h-3 overflow-hidden rounded-full bg-secondary">
          <div
            className="h-full rounded-full bg-gradient-to-r from-primary via-lavender to-accent transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
      <div className="flex items-center gap-2">
        <span className="chip !bg-peach">🔥 {streak}d</span>
        <span className="chip !bg-lemon">⚡ {xp} XP</span>
        <button
          onClick={onHistory}
          title="Lesson history"
          aria-label="Lesson history"
          className="grid h-9 w-9 place-items-center rounded-xl bg-white/70 text-lg transition hover:-translate-y-0.5 hover:bg-white"
        >
          📚
        </button>
        <button
          onClick={onToggleTheme}
          title={isDark ? "Switch to light mode" : "Switch to dark mode"}
          aria-label="Toggle theme"
          className="grid h-9 w-9 place-items-center rounded-xl bg-white/70 text-lg transition hover:-translate-y-0.5 hover:bg-white"
        >
          {isDark ? "☀️" : "🌙"}
        </button>
        <button
          onClick={onSettings}
          title="Settings — API key"
          aria-label="Settings"
          className="grid h-9 w-9 place-items-center rounded-xl bg-white/70 text-lg transition hover:-translate-y-0.5 hover:bg-white"
        >
          ⚙️
        </button>
        {userEmail ? (
          <div className="flex items-center gap-2">
            <span className="chip !bg-mint/70 max-w-[140px] truncate" title={userEmail}>
              👤 {userEmail}
            </span>
            <button
              onClick={onSignOut}
              title="Sign out"
              className="rounded-xl bg-white/70 px-3 py-2 text-sm font-bold transition hover:-translate-y-0.5 hover:bg-white"
            >
              Log out
            </button>
          </div>
        ) : (
          <Link
            to="/login"
            className="rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground shadow-[var(--shadow-pop)] transition hover:-translate-y-0.5"
          >
            Log in
          </Link>
        )}
      </div>
    </header>
  );
}

/* ---------------- Settings (API key) ---------------- */
function SettingsPanel({ theme, setTheme, onClose }: { theme: Theme; setTheme: (t: Theme) => void; onClose: () => void }) {
  const { key, save } = useApiKey();
  const [draft, setDraft] = useState("");
  const [show, setShow] = useState(false);
  const [saved, setSaved] = useState(false);
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null);

  useEffect(() => { setDraft(key); }, [key]);

  async function testKey() {
    const candidate = draft.trim();
    if (!candidate) {
      setResult({ ok: false, msg: "Enter a key first." });
      return;
    }
    setTesting(true);
    setResult(null);
    try {
      const res = await fetch("/api/test-key", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-coachio-key": candidate },
      });
      const json = await res.json();
      if (res.ok && json.ok) {
        setResult({ ok: true, msg: `Key works! Model: ${json.model ?? "ready"}` });
      } else {
        setResult({ ok: false, msg: json.error || `HTTP ${res.status}` });
      }
    } catch (e) {
      setResult({ ok: false, msg: e instanceof Error ? e.message : "Request failed" });
    } finally {
      setTesting(false);
    }
  }

  function onSave() {
    save(draft);
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1500);
  }

  function onClear() {
    save("");
    setDraft("");
    setResult(null);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="glass-card max-h-[88vh] w-full max-w-md animate-pop-in overflow-y-auto p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-1 flex items-center justify-between">
          <h3 className="text-2xl">⚙️ Settings</h3>
          <button
            onClick={onClose}
            aria-label="Close"
            className="grid h-8 w-8 place-items-center rounded-xl bg-white/70 hover:bg-white"
          >
            ✕
          </button>
        </div>
        <ProfileSection />

        <label className="mt-4 block text-xs font-bold uppercase tracking-widest text-muted-foreground">
          Appearance
        </label>
        <div className="mt-1 grid grid-cols-3 gap-2">
          {([
            ["light", "☀️ Light"],
            ["dark", "🌙 Dark"],
            ["system", "🖥 System"],
          ] as [Theme, string][]).map(([value, label]) => (
            <button
              key={value}
              onClick={() => setTheme(value)}
              className={`rounded-2xl px-3 py-2.5 text-sm font-bold transition ${
                theme === value
                  ? "bg-primary text-primary-foreground shadow-[var(--shadow-pop)]"
                  : "bg-white/70 text-foreground hover:bg-white"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <label className="mt-4 block text-xs font-bold uppercase tracking-widest text-muted-foreground">
          Coachio API key
        </label>
        <p className="mt-1 text-xs text-muted-foreground">
          Stored only in this browser (localStorage) and sent straight to the API.
        </p>
        <div className="mt-1 flex gap-2">
          <input
            type={show ? "text" : "password"}
            value={draft}
            onChange={(e) => { setDraft(e.target.value); setResult(null); }}
            placeholder="sk-…"
            autoComplete="off"
            spellCheck={false}
            className="flex-1 rounded-2xl border border-border bg-white/70 px-4 py-3 text-sm outline-none focus:border-primary"
          />
          <button
            onClick={() => setShow((s) => !s)}
            className="chip !bg-lavender/70"
            title={show ? "Hide" : "Show"}
          >
            {show ? "🙈" : "👁"}
          </button>
        </div>

        {result && (
          <div
            className={`mt-3 rounded-2xl p-3 text-sm ${
              result.ok ? "bg-success/20 text-foreground" : "bg-destructive/10 text-destructive"
            }`}
          >
            {result.ok ? "✅ " : "⚠ "}{result.msg}
          </div>
        )}

        <div className="mt-5 flex flex-wrap gap-2">
          <button
            onClick={testKey}
            disabled={testing}
            className="rounded-2xl bg-sky px-4 py-3 text-sm font-bold text-sky-foreground transition hover:-translate-y-0.5 disabled:opacity-60"
          >
            {testing ? "Testing…" : "🧪 Test key"}
          </button>
          <button
            onClick={onSave}
            className="rounded-2xl bg-primary px-5 py-3 text-sm font-bold text-primary-foreground shadow-[var(--shadow-pop)] transition hover:-translate-y-0.5"
          >
            {saved ? "✅ Saved" : "💾 Save"}
          </button>
          {key && (
            <button
              onClick={onClear}
              className="ml-auto rounded-2xl bg-secondary px-4 py-3 text-sm font-bold transition hover:-translate-y-0.5"
            >
              🗑 Clear
            </button>
          )}
        </div>

        <div className="mt-4 text-xs text-muted-foreground">
          {key ? "🔑 A key is currently saved in this browser." : "No key saved yet."}
        </div>
      </div>
    </div>
  );
}

/* ---------------- Profile (inside Settings) ---------------- */
function ProfileSection() {
  const { user, updateProfile, updatePassword } = useAuth();
  const [name, setName] = useState("");
  const [pw, setPw] = useState("");
  const [nameMsg, setNameMsg] = useState<{ ok: boolean; msg: string } | null>(null);
  const [pwMsg, setPwMsg] = useState<{ ok: boolean; msg: string } | null>(null);
  const [savingName, setSavingName] = useState(false);
  const [savingPw, setSavingPw] = useState(false);

  useEffect(() => {
    const meta = (user?.user_metadata ?? {}) as { name?: string };
    setName(meta.name ?? "");
  }, [user]);

  if (!user) {
    return (
      <div className="mt-4 rounded-2xl bg-white/60 p-4 text-sm">
        <div className="font-bold">👤 Account</div>
        <p className="mt-1 text-muted-foreground">
          You're not logged in.{" "}
          <Link to="/login" className="font-bold text-primary hover:underline">Log in</Link>{" "}
          to edit your profile and sync progress.
        </p>
      </div>
    );
  }

  async function saveName() {
    setSavingName(true);
    setNameMsg(null);
    const { error } = await updateProfile(name);
    setNameMsg(error ? { ok: false, msg: error } : { ok: true, msg: "Name updated" });
    setSavingName(false);
  }

  async function savePw() {
    if (pw.length < 6) {
      setPwMsg({ ok: false, msg: "Password must be at least 6 characters." });
      return;
    }
    setSavingPw(true);
    setPwMsg(null);
    const { error } = await updatePassword(pw);
    setPwMsg(error ? { ok: false, msg: error } : { ok: true, msg: "Password changed." });
    if (!error) setPw("");
    setSavingPw(false);
  }

  return (
    <div className="mt-4 space-y-3 rounded-2xl bg-white/60 p-4">
      <div className="flex items-center justify-between">
        <div className="text-sm font-bold">👤 Profile</div>
        <span className="max-w-[180px] truncate text-xs text-muted-foreground" title={user.email ?? ""}>
          {user.email}
        </span>
      </div>

      <div>
        <label className="mb-1 block text-xs font-bold uppercase tracking-widest text-muted-foreground">
          Display name
        </label>
        <div className="flex gap-2">
          <input
            value={name}
            onChange={(e) => { setName(e.target.value); setNameMsg(null); }}
            placeholder="Your name"
            className="flex-1 rounded-2xl border border-border bg-white/70 px-4 py-2.5 text-sm outline-none focus:border-primary"
          />
          <button
            onClick={saveName}
            disabled={savingName}
            className="rounded-2xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground disabled:opacity-60"
          >
            {savingName ? "…" : "Save"}
          </button>
        </div>
        {nameMsg && (
          <div className={`mt-1 text-xs ${nameMsg.ok ? "text-success" : "text-destructive"}`}>
            {nameMsg.ok ? "✅ " : "⚠ "}{nameMsg.msg}
          </div>
        )}
      </div>

      <div>
        <label className="mb-1 block text-xs font-bold uppercase tracking-widest text-muted-foreground">
          New password
        </label>
        <div className="flex gap-2">
          <input
            type="password"
            value={pw}
            onChange={(e) => { setPw(e.target.value); setPwMsg(null); }}
            placeholder="At least 6 characters"
            autoComplete="new-password"
            className="flex-1 rounded-2xl border border-border bg-white/70 px-4 py-2.5 text-sm outline-none focus:border-primary"
          />
          <button
            onClick={savePw}
            disabled={savingPw || !pw}
            className="rounded-2xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground disabled:opacity-60"
          >
            {savingPw ? "…" : "Change"}
          </button>
        </div>
        {pwMsg && (
          <div className={`mt-1 text-xs ${pwMsg.ok ? "text-success" : "text-destructive"}`}>
            {pwMsg.ok ? "✅ " : "⚠ "}{pwMsg.msg}
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------------- Daily quests ---------------- */
function DailyQuests({ quests }: { quests: { id: string; done: boolean }[] }) {
  const labels: Record<string, string> = {
    [QUESTS.learn5.id]: QUESTS.learn5.label,
    [QUESTS.quiz3.id]: QUESTS.quiz3.label,
    [QUESTS.match.id]: QUESTS.match.label,
  };
  return (
    <div className="glass-card w-full max-w-sm p-4">
      <div className="mb-2 flex items-center justify-between text-sm font-bold">
        <span>🎯 Daily quests</span>
        <span className="text-xs text-muted-foreground">
          {quests.filter((q) => q.done).length}/{quests.length}
        </span>
      </div>
      <ul className="space-y-1.5">
        {quests.map((q) => (
          <li key={q.id} className="flex items-center gap-2 text-sm">
            <span className={`grid h-5 w-5 place-items-center rounded-full text-[11px] ${q.done ? "bg-success text-success-foreground" : "bg-secondary text-muted-foreground"}`}>
              {q.done ? "✓" : "•"}
            </span>
            <span className={q.done ? "line-through text-muted-foreground" : ""}>{labels[q.id] ?? q.id}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}


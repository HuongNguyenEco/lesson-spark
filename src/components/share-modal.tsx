import { useEffect, useState } from "react";
import { fetchLesson, setLessonVisibility, type Visibility } from "@/lib/lessons";
import { previewUrl } from "@/lib/site";

export function ShareModal({ lessonId, onClose }: { lessonId: string; onClose: () => void }) {
  const [visibility, setVisibility] = useState<Visibility>("private");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const link = previewUrl(lessonId);

  useEffect(() => {
    let alive = true;
    fetchLesson(lessonId).then((rec) => {
      if (!alive) return;
      setVisibility(rec?.visibility ?? "private");
      setLoading(false);
    });
    return () => { alive = false; };
  }, [lessonId]);

  async function change(next: Visibility) {
    setSaving(true);
    const prev = visibility;
    setVisibility(next);
    const err = await setLessonVisibility(lessonId, next);
    if (err) {
      setVisibility(prev);
      console.error(err);
    }
    setSaving(false);
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch { /* ignore */ }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="glass-card w-full max-w-md animate-pop-in p-6" onClick={(e) => e.stopPropagation()}>
        <div className="mb-1 flex items-center justify-between">
          <h3 className="text-2xl">🔗 Share preview</h3>
          <button onClick={onClose} aria-label="Close" className="grid h-8 w-8 place-items-center rounded-xl bg-white/70 hover:bg-white">✕</button>
        </div>
        <p className="text-sm text-muted-foreground">
          Share a read-only version of this lesson. The preview has no AI actions — anyone
          can study it, and learners keep their own scores.
        </p>

        {loading ? (
          <div className="py-8 text-center text-sm text-muted-foreground">Loading…</div>
        ) : (
          <>
            <div className="mt-4 grid grid-cols-2 gap-2">
              {([
                ["private", "🔒 Private", "Only you can open it"],
                ["public", "🌍 Public", "Anyone with the link"],
              ] as [Visibility, string, string][]).map(([value, label, hint]) => (
                <button
                  key={value}
                  onClick={() => change(value)}
                  disabled={saving}
                  className={`rounded-2xl p-3 text-left transition disabled:opacity-60 ${
                    visibility === value
                      ? "bg-primary text-primary-foreground shadow-[var(--shadow-pop)]"
                      : "bg-white/70 text-foreground hover:bg-white"
                  }`}
                >
                  <div className="text-sm font-bold">{label}</div>
                  <div className={`text-[11px] ${visibility === value ? "text-primary-foreground/80" : "text-muted-foreground"}`}>{hint}</div>
                </button>
              ))}
            </div>

            <label className="mt-4 block text-xs font-bold uppercase tracking-widest text-muted-foreground">Preview link</label>
            <div className="mt-1 flex gap-2">
              <input
                readOnly
                value={link}
                onFocus={(e) => e.currentTarget.select()}
                className="flex-1 rounded-2xl border border-border bg-white/70 px-4 py-2.5 text-sm outline-none"
              />
              <button onClick={copy} className="rounded-2xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground">
                {copied ? "✅" : "Copy"}
              </button>
            </div>

            {visibility === "private" ? (
              <div className="mt-3 rounded-2xl bg-peach/40 p-3 text-xs">
                🔒 This lesson is private. Switch to <b>Public</b> so others can open the link.
              </div>
            ) : (
              <div className="mt-3 rounded-2xl bg-mint/40 p-3 text-xs">
                🌍 Anyone with this link can study the lesson (read-only).
              </div>
            )}
            <div className="mt-3 flex justify-end">
              <a href={link} target="_blank" rel="noreferrer" className="text-xs text-primary hover:underline">
                Open preview ↗
              </a>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

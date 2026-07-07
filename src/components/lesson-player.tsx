import { useEffect, useMemo, useState } from "react";
import {
  BADGES,
  type Lesson,
  type MatchPair,
  type QuizItem,
  type TFItem,
  type VocabItem,
} from "@/lib/lesson-types";
import { authHeaders } from "@/lib/settings";
import { XP, QUESTS } from "@/lib/scoring";

type PlayerTab = "cards" | "match" | "tf" | "wheel" | "fill" | "quiz";

/**
 * The interactive lesson (tabs + games). Reused by the main app and the
 * read-only preview page. Set `hideAI` to remove every AI/API-calling control
 * (used on shared previews, which must never trigger paid API calls).
 */
export function LessonPlayer({
  lesson,
  onXP,
  onQuest,
  awardBadge,
  hideAI = false,
  requireAuth = () => true,
}: {
  lesson: Lesson;
  onXP: (n: number) => void;
  onQuest?: (id: string) => void;
  awardBadge?: (id: string) => void;
  hideAI?: boolean;
  requireAuth?: () => boolean;
}) {
  const [tab, setTab] = useState<PlayerTab>("cards");

  return (
    <>
      <nav className="mt-6 flex flex-wrap gap-2">
        {([
          ["cards", "🎴 Flashcards"],
          ["match", "🧩 Matching"],
          ["tf", "✅ True / False"],
          ["fill", "💬 Fill the blanks"],
          ["quiz", "❓ Quiz"],
          ["wheel", "🎡 Lucky Wheel"],
        ] as [PlayerTab, string][]).map(([id, label]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
              tab === id
                ? "bg-primary text-primary-foreground shadow-[var(--shadow-pop)]"
                : "bg-white/70 text-foreground hover:bg-white"
            }`}
          >
            {label}
          </button>
        ))}
      </nav>

      <section className="mt-6">
        {tab === "cards" && (
          <Flashcards items={lesson.vocabulary} onXP={onXP} onQuest={onQuest} requireAuth={requireAuth} hideAI={hideAI} />
        )}
        {tab === "match" && (
          <Matching
            pairs={lesson.matching}
            onXP={onXP}
            onComplete={() => {
              awardBadge?.("matchmaster");
              onXP(XP.matchComplete);
              onQuest?.("match");
            }}
          />
        )}
        {tab === "tf" && <TrueFalse items={lesson.trueFalse} onXP={onXP} />}
        {tab === "fill" && <FillBlanks data={lesson.fillBlank} onXP={onXP} />}
        {tab === "quiz" && (
          <Quiz
            items={lesson.quiz}
            onXP={onXP}
            onQuest={onQuest}
            onPerfect={() => {
              awardBadge?.("perfectquiz");
              onXP(XP.quizPerfect);
            }}
          />
        )}
        {tab === "wheel" && <LuckyWheel prompts={lesson.wheelPrompts} onXP={onXP} />}
      </section>
    </>
  );
}

/* ---------------- Flashcards ---------------- */
function Flashcards({
  items,
  onXP,
  onQuest,
  requireAuth,
  hideAI,
}: {
  items: VocabItem[];
  onXP: (n: number) => void;
  onQuest?: (id: string) => void;
  requireAuth: () => boolean;
  hideAI: boolean;
}) {
  const [i, setI] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [known, setKnown] = useState<Set<number>>(new Set());
  const [images, setImages] = useState<Record<string, string>>({});
  const [loadingImg, setLoadingImg] = useState<Record<string, boolean>>({});
  const [imgErr, setImgErr] = useState<Record<string, string>>({});
  const item = items[i];
  useEffect(() => { setFlipped(false); }, [i]);

  function next(mark: "know" | "again") {
    if (mark === "know" && !known.has(i)) {
      const nextKnown = new Set(known).add(i);
      setKnown(nextKnown);
      onXP(XP.flashcardKnown);
      if (nextKnown.size >= QUESTS.learn5.target) onQuest?.(QUESTS.learn5.id);
    }
    setI((p) => (p + 1) % items.length);
  }

  function speak() {
    const utt = new SpeechSynthesisUtterance(item.word);
    utt.lang = "en-US";
    utt.rate = 0.9;
    window.speechSynthesis.speak(utt);
  }

  async function generateImage(v: VocabItem) {
    if (loadingImg[v.word] || images[v.word]) return;
    if (!requireAuth()) return;
    setLoadingImg((p) => ({ ...p, [v.word]: true }));
    setImgErr((p) => ({ ...p, [v.word]: "" }));
    try {
      const res = await fetch("/api/vocab-image", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ word: v.word, definition: v.definition, example: v.example }),
      });
      const json = await res.json();
      if (!res.ok || !json.url) throw new Error(json.error || `HTTP ${res.status}`);
      setImages((p) => ({ ...p, [v.word]: json.url as string }));
      onXP(XP.imageGenerated);
    } catch (e) {
      setImgErr((p) => ({ ...p, [v.word]: e instanceof Error ? e.message : "Failed" }));
    } finally {
      setLoadingImg((p) => ({ ...p, [v.word]: false }));
    }
  }

  const currentImg = images[item.word];
  const isLoadingCurrent = loadingImg[item.word];
  const currentErr = imgErr[item.word];

  return (
    <div className="grid gap-6 md:grid-cols-[1fr_260px]">
      <div>
        <div className="mb-3 flex items-center justify-between text-xs font-semibold text-muted-foreground">
          <span>Card {i + 1} of {items.length}</span>
          <span>{known.size} learned</span>
        </div>
        <div
          onClick={() => setFlipped((f) => !f)}
          className="relative min-h-72 cursor-pointer rounded-3xl bg-white p-8 shadow-[var(--shadow-pop)] transition hover:-translate-y-0.5"
        >
          {!flipped ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
              {currentImg ? (
                <img src={currentImg} alt={item.word} className="aspect-square h-40 w-40 animate-pop-in rounded-3xl object-cover shadow-md" />
              ) : isLoadingCurrent ? (
                <div className="grid aspect-square h-40 w-40 place-items-center rounded-3xl bg-gradient-to-br from-lavender via-primary/40 to-accent">
                  <div className="text-sm font-bold text-white">Generating…</div>
                </div>
              ) : (
                <div className="text-6xl">{item.emoji}</div>
              )}
              <div className="text-3xl font-black">{item.word}</div>
              <div className="text-sm text-muted-foreground">{item.pos} · {item.pronunciation}</div>
              <div className="mt-2 flex flex-wrap justify-center gap-2">
                <button onClick={(e) => { e.stopPropagation(); speak(); }} className="chip !bg-sky">🔊 Listen</button>
                {!hideAI && (
                  <button
                    onClick={(e) => { e.stopPropagation(); generateImage(item); }}
                    disabled={isLoadingCurrent || !!currentImg}
                    className="chip !bg-lavender disabled:opacity-60"
                  >
                    {currentImg ? "🖼 Image ready" : isLoadingCurrent ? "⏳ Generating…" : "✨ Generate image"}
                  </button>
                )}
              </div>
              {currentErr && <div className="text-xs text-destructive">⚠ {currentErr}</div>}
              <div className="mt-4 text-xs text-muted-foreground">Tap the card to flip</div>
            </div>
          ) : (
            <div className="flex h-full flex-col justify-center gap-4">
              <div className="text-xs uppercase tracking-widest text-muted-foreground">Meaning</div>
              <div className="text-xl font-bold">{item.definition}</div>
              <div className="text-xs uppercase tracking-widest text-muted-foreground">Example</div>
              <div className="rounded-2xl bg-secondary p-4 italic">"{item.example}"</div>
            </div>
          )}
        </div>
        <div className="mt-4 flex gap-3">
          <button onClick={() => next("again")} className="flex-1 rounded-2xl bg-peach px-4 py-3 font-bold text-peach-foreground transition hover:-translate-y-0.5">
            🔁 Practice again
          </button>
          <button onClick={() => next("know")} className="flex-1 rounded-2xl bg-mint px-4 py-3 font-bold text-mint-foreground transition hover:-translate-y-0.5">
            ✅ I know this (+{XP.flashcardKnown} XP)
          </button>
        </div>
      </div>

      <aside className="glass-card max-h-96 overflow-y-auto p-3">
        <div className="mb-2 px-2 text-xs font-bold text-muted-foreground">All words</div>
        <ul className="space-y-1">
          {items.map((v, idx) => {
            const img = images[v.word];
            const busy = loadingImg[v.word];
            return (
              <li key={v.word} className="flex items-center gap-1">
                <button
                  onClick={() => setI(idx)}
                  className={`flex flex-1 items-center gap-2 rounded-xl px-3 py-2 text-left text-sm transition ${idx === i ? "bg-primary/20 font-bold" : "hover:bg-white"}`}
                >
                  {img ? <img src={img} alt="" className="h-6 w-6 rounded-md object-cover" /> : <span>{v.emoji}</span>}
                  <span className="flex-1 truncate">{v.word}</span>
                  {known.has(idx) && <span className="text-xs text-success">✓</span>}
                </button>
                {!hideAI && (
                  <button
                    title="Generate AI image"
                    onClick={() => generateImage(v)}
                    disabled={busy || !!img}
                    className="grid h-8 w-8 place-items-center rounded-lg bg-lavender text-sm disabled:opacity-40"
                  >
                    {busy ? "⏳" : img ? "✓" : "✨"}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      </aside>
    </div>
  );
}

/* ---------------- Matching ---------------- */
function Matching({ pairs, onXP, onComplete }: { pairs: MatchPair[]; onXP: (n: number) => void; onComplete: () => void }) {
  const [leftPick, setLeftPick] = useState<string | null>(null);
  const [rightPick, setRightPick] = useState<string | null>(null);
  const [solved, setSolved] = useState<Set<string>>(new Set());
  const [wrong, setWrong] = useState(false);

  const rights = useMemo(() => shuffle(pairs.map((p) => p.right)), [pairs]);
  const lefts = useMemo(() => shuffle(pairs.map((p) => p.left)), [pairs]);

  useEffect(() => {
    if (leftPick && rightPick) {
      const correct = pairs.some((p) => p.left === leftPick && p.right === rightPick);
      if (correct) {
        setSolved((s) => {
          const ns = new Set(s).add(leftPick);
          if (ns.size === pairs.length) { onComplete(); }
          return ns;
        });
        onXP(XP.matchPair);
        setLeftPick(null); setRightPick(null);
      } else {
        setWrong(true);
        window.setTimeout(() => { setWrong(false); setLeftPick(null); setRightPick(null); }, 500);
      }
    }
  }, [leftPick, rightPick, pairs, onXP, onComplete]);

  const done = solved.size === pairs.length;

  return (
    <div>
      <div className="mb-3 text-sm text-muted-foreground">Tap a word on the left and its match on the right.</div>
      <div className={`grid grid-cols-2 gap-4 ${wrong ? "animate-shake" : ""}`}>
        <div className="space-y-2">
          {lefts.map((w) => {
            const isSolved = solved.has(w);
            const isPicked = leftPick === w;
            return (
              <button
                key={w}
                disabled={isSolved}
                onClick={() => setLeftPick(w)}
                className={`w-full rounded-2xl p-3 text-left font-semibold transition ${isSolved ? "bg-success/20 text-muted-foreground line-through" : isPicked ? "bg-primary text-primary-foreground" : "bg-white hover:-translate-y-0.5"}`}
              >{w}</button>
            );
          })}
        </div>
        <div className="space-y-2">
          {rights.map((w) => {
            const matched = pairs.find((p) => p.right === w);
            const isSolved = matched && solved.has(matched.left);
            const isPicked = rightPick === w;
            return (
              <button
                key={w}
                disabled={!!isSolved}
                onClick={() => setRightPick(w)}
                className={`w-full rounded-2xl p-3 text-left transition ${isSolved ? "bg-success/20 text-muted-foreground line-through" : isPicked ? "bg-accent text-accent-foreground" : "bg-white hover:-translate-y-0.5"}`}
              >{w}</button>
            );
          })}
        </div>
      </div>
      {done && (
        <div className="mt-6 animate-pop-in rounded-3xl bg-mint p-6 text-center text-mint-foreground">
          <div className="text-4xl">🧩</div>
          <div className="mt-1 text-xl font-black">All matched!</div>
          <div className="text-sm">+{XP.matchComplete} XP · Badge unlocked: Match Master</div>
        </div>
      )}
    </div>
  );
}

/* ---------------- True/False ---------------- */
function TrueFalse({ items, onXP }: { items: TFItem[]; onXP: (n: number) => void }) {
  const [i, setI] = useState(0);
  const [picked, setPicked] = useState<boolean | null>(null);
  const [score, setScore] = useState(0);
  const item = items[i];
  const done = i >= items.length;

  function pick(v: boolean) {
    setPicked(v);
    if (v === item.answer) { setScore((s) => s + 1); onXP(XP.trueFalseCorrect); }
    window.setTimeout(() => { setPicked(null); setI((p) => p + 1); }, 1200);
  }

  if (done) {
    return (
      <div className="glass-card p-8 text-center">
        <div className="text-5xl">🌟</div>
        <div className="mt-2 text-2xl font-black">Round complete!</div>
        <div className="text-muted-foreground">You scored {score} / {items.length}</div>
        <button onClick={() => { setI(0); setScore(0); }} className="mt-4 rounded-2xl bg-primary px-5 py-3 font-bold text-primary-foreground">Play again</button>
      </div>
    );
  }

  const correct = picked !== null && picked === item.answer;

  return (
    <div className="glass-card p-8">
      <div className="mb-2 text-xs font-semibold text-muted-foreground">Question {i + 1} / {items.length}</div>
      <div className="text-2xl font-bold">{item.statement}</div>
      <div className="mt-6 grid grid-cols-2 gap-3">
        <button
          disabled={picked !== null}
          onClick={() => pick(true)}
          className={`rounded-2xl p-5 text-lg font-bold transition ${picked === true ? correct ? "bg-success text-success-foreground" : "bg-destructive text-destructive-foreground" : "bg-mint text-mint-foreground hover:-translate-y-0.5"}`}
        >✅ True</button>
        <button
          disabled={picked !== null}
          onClick={() => pick(false)}
          className={`rounded-2xl p-5 text-lg font-bold transition ${picked === false ? correct ? "bg-success text-success-foreground" : "bg-destructive text-destructive-foreground" : "bg-peach text-peach-foreground hover:-translate-y-0.5"}`}
        >❌ False</button>
      </div>
      {picked !== null && (
        <div className={`mt-4 rounded-2xl p-4 text-sm ${correct ? "bg-success/20" : "bg-destructive/10"}`}>
          {correct ? "Nice!" : "Not quite."} {item.explain}
        </div>
      )}
    </div>
  );
}

/* ---------------- Fill blanks ---------------- */
function FillBlanks({ data, onXP }: { data: { dialogue: { speaker: string; line: string; blank: string | null }[]; options: string[] }; onXP: (n: number) => void }) {
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [checked, setChecked] = useState(false);
  const options = useMemo(() => shuffle(data.options), [data]);

  function check() {
    let ok = 0;
    data.dialogue.forEach((d, idx) => {
      if (d.blank && answers[idx]?.toLowerCase() === d.blank.toLowerCase()) ok += 1;
    });
    onXP(ok * XP.fillBlankCorrect);
    setChecked(true);
  }

  const blanks = data.dialogue.filter((d) => d.blank);

  return (
    <div className="glass-card p-6">
      <div className="mb-3 text-sm text-muted-foreground">Choose the right word for each blank.</div>
      <div className="space-y-3">
        {data.dialogue.map((d, idx) => (
          <div key={idx} className="rounded-2xl bg-white p-4">
            <div className="text-xs font-bold uppercase text-muted-foreground">{d.speaker}</div>
            <div className="mt-1 text-base">
              {d.blank ? renderWithBlank(d.line, (
                <select
                  value={answers[idx] ?? ""}
                  onChange={(e) => setAnswers({ ...answers, [idx]: e.target.value })}
                  disabled={checked}
                  className={`mx-1 rounded-lg border px-2 py-1 text-sm font-bold ${checked ? answers[idx]?.toLowerCase() === d.blank?.toLowerCase() ? "border-success bg-success/20" : "border-destructive bg-destructive/10" : "border-primary bg-primary/10"}`}
                >
                  <option value="">___</option>
                  {options.map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              )) : d.line}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-4 flex gap-3">
        <button onClick={check} disabled={checked} className="rounded-2xl bg-primary px-5 py-3 font-bold text-primary-foreground disabled:opacity-60">Check answers</button>
        {checked && (
          <button onClick={() => { setAnswers({}); setChecked(false); }} className="rounded-2xl bg-secondary px-5 py-3 font-bold">Try again</button>
        )}
      </div>
      {checked && (
        <div className="mt-3 text-sm text-muted-foreground">
          {Object.entries(answers).filter(([idx, v]) => data.dialogue[+idx].blank?.toLowerCase() === v.toLowerCase()).length}
          {" / "}{blanks.length} correct
        </div>
      )}
    </div>
  );
}
function renderWithBlank(line: string, node: React.ReactNode) {
  const parts = line.split("____");
  return <>{parts[0]}{node}{parts[1] ?? ""}</>;
}

/* ---------------- Quiz ---------------- */
function Quiz({ items, onXP, onQuest, onPerfect }: { items: QuizItem[]; onXP: (n: number) => void; onQuest?: (id: string) => void; onPerfect: () => void }) {
  const [i, setI] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [score, setScore] = useState(0);
  const item = items[i];
  const done = i >= items.length;

  function pick(idx: number) {
    setPicked(idx);
    if (idx === item.answerIndex) { setScore((s) => s + 1); onXP(XP.quizCorrect); }
    window.setTimeout(() => { setPicked(null); setI((p) => p + 1); }, 1200);
  }

  useEffect(() => {
    if (!done) return;
    if (score >= QUESTS.quiz3.target) onQuest?.(QUESTS.quiz3.id);
    if (score === items.length) onPerfect();
  }, [done, score, items.length, onQuest, onPerfect]);

  if (done) {
    return (
      <div className="glass-card p-8 text-center">
        <div className="text-5xl">{score === items.length ? "🏆" : "🎯"}</div>
        <div className="mt-2 text-2xl font-black">{score} / {items.length}</div>
        <div className="text-sm text-muted-foreground">
          {score === items.length ? "Perfect! Badge unlocked." : "Great job — try again for a perfect score!"}
        </div>
        <button onClick={() => { setI(0); setScore(0); }} className="mt-4 rounded-2xl bg-primary px-5 py-3 font-bold text-primary-foreground">Restart</button>
      </div>
    );
  }

  return (
    <div className="glass-card p-6 md:p-8">
      <div className="mb-2 flex items-center justify-between text-xs font-bold text-muted-foreground">
        <span>Question {i + 1} / {items.length}</span>
        <span>Score {score}</span>
      </div>
      <div className="text-xl font-bold">{item.question}</div>
      <div className="mt-4 grid gap-2 md:grid-cols-2">
        {item.choices.map((c, idx) => {
          const isPicked = picked === idx;
          const isRight = picked !== null && idx === item.answerIndex;
          return (
            <button
              key={idx}
              disabled={picked !== null}
              onClick={() => pick(idx)}
              className={`rounded-2xl p-4 text-left font-semibold transition ${isRight ? "bg-success text-success-foreground" : isPicked ? "bg-destructive/80 text-destructive-foreground" : "bg-white hover:-translate-y-0.5"}`}
            >{c}</button>
          );
        })}
      </div>
      {picked !== null && <div className="mt-3 rounded-xl bg-secondary p-3 text-sm">{item.explain}</div>}
    </div>
  );
}

/* ---------------- Lucky Wheel ---------------- */
function LuckyWheel({ prompts, onXP }: { prompts: string[]; onXP: (n: number) => void }) {
  const [angle, setAngle] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [chosen, setChosen] = useState<string | null>(null);
  const colors = ["var(--mint)", "var(--peach)", "var(--lavender)", "var(--sky)", "var(--lemon)", "var(--primary)"];

  function spin() {
    if (spinning) return;
    setSpinning(true);
    setChosen(null);
    const turns = 5 + Math.random() * 3;
    const finalAngle = angle + turns * 360 + Math.random() * 360;
    setAngle(finalAngle);
    window.setTimeout(() => {
      const norm = ((finalAngle % 360) + 360) % 360;
      const seg = 360 / prompts.length;
      const idx = Math.floor(((360 - norm) % 360) / seg);
      setChosen(prompts[idx]);
      setSpinning(false);
      onXP(XP.wheelSpin);
    }, 3600);
  }

  const seg = 360 / prompts.length;

  return (
    <div className="grid gap-6 md:grid-cols-[320px_1fr] md:items-center">
      <div className="relative mx-auto h-72 w-72">
        <div
          className="h-full w-full rounded-full border-8 border-white shadow-[var(--shadow-pop)] transition-transform duration-[3500ms] ease-out"
          style={{
            transform: `rotate(${angle}deg)`,
            background: `conic-gradient(${prompts.map((_, i) => `${colors[i % colors.length]} ${i * seg}deg ${(i + 1) * seg}deg`).join(",")})`,
          }}
        >
          {prompts.map((_, i) => (
            <div key={i} className="absolute left-1/2 top-1/2 h-1/2 w-px origin-top bg-white/40" style={{ transform: `rotate(${i * seg}deg)` }} />
          ))}
        </div>
        <div className="absolute left-1/2 top-1/2 grid h-16 w-16 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-white text-2xl font-black shadow-lg">🎡</div>
        <div className="absolute -top-2 left-1/2 -translate-x-1/2 text-3xl">▼</div>
      </div>
      <div>
        <button
          onClick={spin}
          disabled={spinning}
          className="rounded-2xl bg-primary px-6 py-4 text-lg font-black text-primary-foreground shadow-[var(--shadow-pop)] transition hover:-translate-y-0.5 disabled:opacity-60"
        >
          {spinning ? "Spinning…" : `🎡 Spin the wheel (+${XP.wheelSpin} XP)`}
        </button>
        {chosen && (
          <div className="animate-pop-in mt-4 rounded-3xl bg-lavender p-5 text-lavender-foreground">
            <div className="text-xs font-bold uppercase tracking-widest">Your challenge</div>
            <div className="mt-1 text-xl font-black">"{chosen}"</div>
            <div className="mt-2 text-xs">Say it out loud or type your answer!</div>
          </div>
        )}
        <div className="mt-4 text-xs text-muted-foreground">Practice speaking with a random prompt from today's lesson.</div>
      </div>
    </div>
  );
}

/* ---------------- Badges ---------------- */
export function BadgeShelf({ badges }: { badges: string[] }) {
  return (
    <section className="glass-card mt-8 p-6">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-xl">🏅 Your badges</h3>
        <span className="text-xs text-muted-foreground">{badges.length} / {BADGES.length} unlocked</span>
      </div>
      <div className="grid grid-cols-3 gap-3 md:grid-cols-6">
        {BADGES.map((b) => {
          const owned = badges.includes(b.id);
          return (
            <div key={b.id} className={`flex flex-col items-center gap-1 rounded-2xl p-3 text-center transition ${owned ? "bg-lemon shadow-md" : "bg-white/50 opacity-50 grayscale"}`}>
              <div className="text-3xl">{b.emoji}</div>
              <div className="text-[11px] font-bold">{b.label}</div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

/* ---------------- Confetti ---------------- */
export function Confetti() {
  const pieces = Array.from({ length: 60 });
  const colors = ["#F9A8D4", "#FCA5A5", "#FCD34D", "#86EFAC", "#93C5FD", "#C4B5FD"];
  return (
    <div className="pointer-events-none fixed inset-0 z-40 overflow-hidden">
      {pieces.map((_, i) => (
        <span
          key={i}
          className="confetti-piece absolute top-0 h-2 w-2 rounded-sm"
          style={{ left: `${Math.random() * 100}%`, background: colors[i % colors.length], animationDelay: `${Math.random() * 0.6}s` }}
        />
      ))}
    </div>
  );
}

/* ---------------- utils ---------------- */
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

import { useEffect, useRef, useState } from "react";
import { supabase } from "./supabase";
import { useAuth } from "./auth";
import { BADGES } from "./lesson-types";

export type Quest = { id: string; done: boolean };
export type Progress = {
  xp: number;
  streak: number;
  lastActive: string | null; // YYYY-MM-DD
  badges: string[];
  quests: Quest[];
};

export const DEFAULT_PROGRESS: Progress = {
  xp: 0,
  streak: 0,
  lastActive: null,
  badges: [],
  quests: [
    { id: "learn5", done: false },
    { id: "quiz3", done: false },
    { id: "match", done: false },
  ],
};

const STORAGE_KEY = "lumi:progress:v1";

/** Pure XP application: adds XP, updates the daily streak, and awards
 * threshold badges. Shared by the main app and the preview page so scoring
 * behaves identically everywhere. */
export function applyXp(prev: Progress, amount: number): Progress {
  if (amount <= 0) return prev;
  const today = new Date().toISOString().slice(0, 10);
  const newBadges = new Set(prev.badges);
  const newXp = prev.xp + amount;
  let streak = prev.streak;
  if (prev.lastActive !== today) {
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    streak = prev.lastActive === yesterday ? prev.streak + 1 : 1;
  }
  BADGES.forEach((b) => {
    if (b.xp > 0 && newXp >= b.xp) newBadges.add(b.id);
  });
  if (streak >= 3) newBadges.add("streak3");
  if (newXp > 0) newBadges.add("first");
  return { ...prev, xp: newXp, streak, lastActive: today, badges: Array.from(newBadges) };
}

export function markQuest(prev: Progress, id: string): Progress {
  return prev.quests.some((q) => q.id === id && !q.done)
    ? { ...prev, quests: prev.quests.map((q) => (q.id === id ? { ...q, done: true } : q)) }
    : prev;
}

export function addBadge(prev: Progress, id: string): Progress {
  return prev.badges.includes(id) ? prev : { ...prev, badges: [...prev.badges, id] };
}

type Row = {
  xp: number;
  streak: number;
  last_active: string | null;
  badges: string[] | null;
  quests: Quest[] | null;
};

function rowToProgress(r: Row): Progress {
  return {
    xp: r.xp ?? 0,
    streak: r.streak ?? 0,
    lastActive: r.last_active ?? null,
    badges: r.badges ?? [],
    quests: r.quests?.length ? r.quests : DEFAULT_PROGRESS.quests,
  };
}

function progressToRow(p: Progress, userId: string) {
  return {
    user_id: userId,
    xp: p.xp,
    streak: p.streak,
    last_active: p.lastActive,
    badges: p.badges,
    quests: p.quests,
    updated_at: new Date().toISOString(),
  };
}

/**
 * Progress state that lives in localStorage for guests and syncs to the
 * Supabase `progress` table (one row per user) once signed in.
 * - On login: pull the user's row. If they have none yet, seed it from the
 *   current local (guest) progress so nothing is lost.
 * - On change while signed in: debounced upsert to the database.
 */
export function useProgress() {
  const { user } = useAuth();
  const [p, setP] = useState<Progress>(DEFAULT_PROGRESS);

  // Guards so we never clobber the DB with defaults before the pull completes.
  const syncReady = useRef(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load local copy once on mount (fast paint for everyone).
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setP({ ...DEFAULT_PROGRESS, ...JSON.parse(raw) });
    } catch { /* ignore */ }
  }, []);

  // Pull from Supabase when the signed-in user changes.
  useEffect(() => {
    const userId = user?.id;
    if (!userId) {
      syncReady.current = false;
      return;
    }
    syncReady.current = false;
    let cancelled = false;

    (async () => {
      const { data, error } = await supabase
        .from("progress")
        .select("xp, streak, last_active, badges, quests")
        .eq("user_id", userId)
        .maybeSingle();
      if (cancelled) return;

      if (error) {
        console.error("[progress] fetch failed:", error.message);
      } else if (data) {
        setP(rowToProgress(data as Row));
      } else {
        // First login: seed the row from whatever is in local state now.
        setP((local) => {
          void supabase.from("progress").upsert(progressToRow(local, userId));
          return local;
        });
      }
      syncReady.current = true;
    })();

    return () => { cancelled = true; };
  }, [user?.id]);

  // Persist on every change: always to localStorage, and (debounced) to the DB.
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(p));
    } catch { /* ignore */ }

    const userId = user?.id;
    if (!userId || !syncReady.current) return;

    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      supabase
        .from("progress")
        .upsert(progressToRow(p, userId))
        .then(({ error }) => {
          if (error) console.error("[progress] save failed:", error.message);
        });
    }, 800);

    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [p, user?.id]);

  return [p, setP] as const;
}

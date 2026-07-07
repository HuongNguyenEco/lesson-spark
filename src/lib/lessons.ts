import { useCallback, useEffect, useState } from "react";
import { supabase } from "./supabase";
import { useAuth } from "./auth";
import type { Lesson } from "./lesson-types";

export type Visibility = "private" | "public";

export type LessonRecord = {
  id: string;
  title: string;
  topic: string | null;
  level: string | null;
  source: string | null;
  data: Lesson;
  visibility: Visibility;
  created_at: string;
};

const COLUMNS = "id, title, topic, level, source, data, visibility, created_at";

/** Fetch a single lesson by id (respects RLS: owner or public). */
export async function fetchLesson(id: string): Promise<LessonRecord | null> {
  const { data, error } = await supabase
    .from("lessons")
    .select(COLUMNS)
    .eq("id", id)
    .maybeSingle();
  if (error) {
    console.error("[lessons] fetchLesson failed:", error.message);
    return null;
  }
  return (data as LessonRecord | null) ?? null;
}

/** Update a lesson's share visibility (owner only, enforced by RLS). */
export async function setLessonVisibility(id: string, visibility: Visibility): Promise<string | null> {
  const { error } = await supabase.from("lessons").update({ visibility }).eq("id", id);
  return error ? error.message : null;
}

/**
 * Saved-lesson history backed by the Supabase `lessons` table (RLS: own rows).
 * Only available when signed in.
 */
export function useLessonHistory() {
  const { user } = useAuth();
  const [items, setItems] = useState<LessonRecord[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!user) {
      setItems([]);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase
      .from("lessons")
      .select(COLUMNS)
      .order("created_at", { ascending: false })
      .limit(100);
    setLoading(false);
    if (error) {
      console.error("[lessons] fetch failed:", error.message);
      return;
    }
    setItems((data ?? []) as LessonRecord[]);
  }, [user]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  /** Persist a freshly generated lesson. Returns the new record (or null). */
  const save = useCallback(
    async (lesson: Lesson, source: string): Promise<LessonRecord | null> => {
      if (!user) return null;
      const { data, error } = await supabase
        .from("lessons")
        .insert({
          user_id: user.id,
          title: lesson.title || "Untitled lesson",
          topic: lesson.topic ?? null,
          level: lesson.level ?? null,
          source: source.slice(0, 4000),
          data: lesson,
        })
        .select(COLUMNS)
        .single();
      if (error) {
        console.error("[lessons] save failed:", error.message);
        return null;
      }
      const rec = data as LessonRecord;
      setItems((prev) => [rec, ...prev]);
      return rec;
    },
    [user],
  );

  const remove = useCallback(async (id: string) => {
    const { error } = await supabase.from("lessons").delete().eq("id", id);
    if (error) {
      console.error("[lessons] delete failed:", error.message);
      return;
    }
    setItems((prev) => prev.filter((r) => r.id !== id));
  }, []);

  return { items, loading, refresh, save, remove };
}

import type { Lesson } from "./lesson-types";

const COACHIO_URL = "https://api.coachio.ai/api/v1/llm/chat/completions";
const MODEL = "google/gemini-3.1-flash-lite";

export const LESSON_SYSTEM_PROMPT = `You are an expert ESL curriculum designer. Given a source document/topic, produce a complete gamified English lesson for beginner-to-intermediate learners.

Return STRICT JSON only (no markdown fences, no prose) with this exact shape:
{
  "title": string,
  "topic": string,
  "level": "Beginner" | "Elementary" | "Intermediate",
  "intro": string,
  "vocabulary": [ { "word": string, "pos": string, "definition": string, "emoji": string, "pronunciation": string, "example": string } ],
  "trueFalse": [ { "statement": string, "answer": boolean, "explain": string } ],
  "fillBlank": { "dialogue": [ { "speaker": string, "line": string, "blank": string | null } ], "options": string[] },
  "quiz": [ { "question": string, "choices": string[], "answerIndex": number, "explain": string } ],
  "matching": [ { "left": string, "right": string } ],
  "wheelPrompts": string[]
}

Rules:
- vocabulary: 8-10 items. trueFalse: 5. quiz: 5 with exactly 4 choices. matching: 6 pairs. wheelPrompts: 8.
- fillBlank dialogue: 6-8 lines; when blank!=null the line contains "____".
- All content in English, tuned for ESL learners. Keep sentences short and clear.
- Never wrap the JSON in code fences. Output ONLY the JSON object.`;

export class CoachioError extends Error {
  status: number;
  constructor(message: string, status = 502) {
    super(message);
    this.status = status;
  }
}

/** Generate a lesson from source text via Coachio. Throws CoachioError on failure. */
export async function generateLesson(source: string, apiKey: string): Promise<Lesson> {
  const trimmed = source.length > 12000 ? source.slice(0, 12000) : source;

  const upstream = await fetch(COACHIO_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-API-Key": apiKey },
    body: JSON.stringify({
      model: MODEL,
      stream: false,
      temperature: 0.6,
      max_tokens: 4096,
      messages: [
        { role: "system", content: LESSON_SYSTEM_PROMPT },
        { role: "user", content: `Build the lesson from this source content:\n\n"""\n${trimmed}\n"""` },
      ],
    }),
  });

  if (!upstream.ok) {
    const text = await upstream.text().catch(() => "");
    throw new CoachioError(`Coachio ${upstream.status}: ${text.slice(0, 300)}`, upstream.status);
  }

  const data = (await upstream.json()) as { choices?: { message?: { content?: string } }[] };
  const content = data.choices?.[0]?.message?.content ?? "";

  const cleaned = content.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  const firstBrace = cleaned.indexOf("{");
  const lastBrace = cleaned.lastIndexOf("}");
  const jsonStr = firstBrace >= 0 && lastBrace > firstBrace ? cleaned.slice(firstBrace, lastBrace + 1) : cleaned;

  try {
    return JSON.parse(jsonStr) as Lesson;
  } catch {
    throw new CoachioError("Model did not return valid JSON", 502);
  }
}

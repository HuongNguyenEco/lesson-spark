import { createFileRoute } from "@tanstack/react-router";
import { generateLesson, CoachioError } from "@/lib/coachio";

export const Route = createFileRoute("/api/lesson")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apiKey =
          request.headers.get("x-coachio-key")?.trim() ||
          process.env.COACHIO_API_KEY;
        if (!apiKey) {
          return new Response(
            JSON.stringify({ error: "COACHIO_API_KEY missing" }),
            { status: 500, headers: { "content-type": "application/json" } },
          );
        }

        let body: { source?: string };
        try {
          body = (await request.json()) as { source?: string };
        } catch {
          return new Response(JSON.stringify({ error: "Invalid JSON" }), {
            status: 400,
            headers: { "content-type": "application/json" },
          });
        }

        const source = (body.source ?? "").trim();
        if (!source) {
          return new Response(
            JSON.stringify({ error: "Missing 'source' text" }),
            { status: 400, headers: { "content-type": "application/json" } },
          );
        }

        try {
          const lesson = await generateLesson(source, apiKey);
          return Response.json({ lesson });
        } catch (e) {
          const status = e instanceof CoachioError ? e.status : 502;
          const message = e instanceof Error ? e.message : "Generation failed";
          return new Response(JSON.stringify({ error: message }), {
            status,
            headers: { "content-type": "application/json" },
          });
        }
      },
    },
  },
});

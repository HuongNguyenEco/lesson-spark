import { createFileRoute } from "@tanstack/react-router";
import { getAdminClient } from "@/lib/supabase-admin";
import { getBearer, resolveAccessToken, serverBaseUrl } from "@/lib/oauth";
import { generateLesson } from "@/lib/coachio";
import type { Lesson } from "@/lib/lesson-types";

const CORS: Record<string, string> = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "POST, GET, OPTIONS",
  "access-control-allow-headers": "content-type, authorization, mcp-protocol-version",
  "access-control-expose-headers": "www-authenticate",
};

const PROTOCOL_VERSION = "2025-06-18";
const SERVER_INFO = { name: "lumi", title: "Lumi ESL", version: "1.0.0" };

const TOOLS = [
  {
    name: "create_lesson",
    description: "Generate a new gamified English lesson from a topic or source text and save it to the user's Lumi account. Returns the lesson id and a private preview link.",
    inputSchema: {
      type: "object",
      properties: {
        source: { type: "string", description: "A topic, paragraph, or article to build the lesson from." },
        make_public: { type: "boolean", description: "If true, the preview link is shareable publicly. Default false." },
      },
      required: ["source"],
    },
  },
  {
    name: "list_lessons",
    description: "List the user's saved Lumi lessons (most recent first).",
    inputSchema: { type: "object", properties: { limit: { type: "number", description: "Max lessons to return (default 20)." } } },
  },
  {
    name: "get_lesson",
    description: "Get the full content of one of the user's lessons by id.",
    inputSchema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
  },
  {
    name: "get_preview_link",
    description: "Get a shareable preview link for a lesson. Optionally make it public.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string" }, make_public: { type: "boolean" } },
      required: ["id"],
    },
  },
];

export const Route = createFileRoute("/mcp")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      GET: async () => new Response("Method Not Allowed", { status: 405, headers: { ...CORS, allow: "POST" } }),
      POST: async ({ request }) => {
        const base = serverBaseUrl(request);
        const wwwAuth = `Bearer resource_metadata="${base}/.well-known/oauth-protected-resource"`;

        const token = getBearer(request);
        const auth = token ? await resolveAccessToken(token) : null;
        if (!auth) {
          return new Response(JSON.stringify({ error: "invalid_token" }), {
            status: 401,
            headers: { ...CORS, "content-type": "application/json", "www-authenticate": wwwAuth },
          });
        }

        let msg: JsonRpcRequest;
        try {
          msg = (await request.json()) as JsonRpcRequest;
        } catch {
          return rpcError(null, -32700, "Parse error");
        }

        // Notifications (no id) get an empty 202.
        if (msg.id === undefined || msg.id === null) {
          return new Response(null, { status: 202, headers: CORS });
        }

        try {
          const result = await handle(msg, auth.user_id, base);
          return rpcResult(msg.id, result);
        } catch (e) {
          return rpcError(msg.id, -32603, e instanceof Error ? e.message : "Internal error");
        }
      },
    },
  },
});

type JsonRpcRequest = { jsonrpc: "2.0"; id?: string | number | null; method: string; params?: Record<string, unknown> };

async function handle(msg: JsonRpcRequest, userId: string, base: string): Promise<unknown> {
  switch (msg.method) {
    case "initialize":
      return {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: { tools: { listChanged: false } },
        serverInfo: SERVER_INFO,
        instructions: "Lumi turns any topic into a gamified English lesson. Use create_lesson to make one, get_preview_link to share it.",
      };
    case "tools/list":
      return { tools: TOOLS };
    case "ping":
      return {};
    case "tools/call":
      return callTool(
        String(msg.params?.name ?? ""),
        (msg.params?.arguments as Record<string, unknown>) ?? {},
        userId,
        base,
      );
    default:
      throw new Error(`Method not found: ${msg.method}`);
  }
}

function textResult(text: string, isError = false) {
  return { content: [{ type: "text", text }], isError };
}

async function callTool(name: string, args: Record<string, unknown>, userId: string, base: string) {
  const admin = getAdminClient();
  if (!admin) return textResult("Server not configured (missing service role key).", true);
  const previewUrl = (id: string) => `${base}/p/${id}`;

  switch (name) {
    case "create_lesson": {
      const source = String(args.source ?? "").trim();
      if (!source) return textResult("Missing 'source'.", true);
      const apiKey = process.env.COACHIO_API_KEY;
      if (!apiKey) return textResult("Server COACHIO_API_KEY not set — cannot generate lessons via MCP.", true);

      let lesson: Lesson;
      try {
        lesson = await generateLesson(source, apiKey);
      } catch (e) {
        return textResult(`Generation failed: ${e instanceof Error ? e.message : "unknown"}`, true);
      }
      const visibility = args.make_public === true ? "public" : "private";
      const { data, error } = await admin
        .from("lessons")
        .insert({
          user_id: userId,
          title: lesson.title || "Untitled lesson",
          topic: lesson.topic ?? null,
          level: lesson.level ?? null,
          source: source.slice(0, 4000),
          data: lesson,
          visibility,
        })
        .select("id")
        .single();
      if (error) return textResult(`Save failed: ${error.message}`, true);
      const id = (data as { id: string }).id;
      return textResult(
        JSON.stringify({ id, title: lesson.title, level: lesson.level, words: lesson.vocabulary.length, visibility, preview: previewUrl(id) }, null, 2),
      );
    }

    case "list_lessons": {
      const limit = Math.min(Number(args.limit ?? 20) || 20, 100);
      const { data, error } = await admin
        .from("lessons")
        .select("id, title, level, visibility, created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) return textResult(`Query failed: ${error.message}`, true);
      return textResult(JSON.stringify(data ?? [], null, 2));
    }

    case "get_lesson": {
      const id = String(args.id ?? "");
      if (!id) return textResult("Missing 'id'.", true);
      const { data, error } = await admin
        .from("lessons")
        .select("id, title, level, visibility, data, created_at")
        .eq("id", id)
        .eq("user_id", userId)
        .maybeSingle();
      if (error) return textResult(`Query failed: ${error.message}`, true);
      if (!data) return textResult("Lesson not found.", true);
      return textResult(JSON.stringify(data, null, 2));
    }

    case "get_preview_link": {
      const id = String(args.id ?? "");
      if (!id) return textResult("Missing 'id'.", true);
      const { data: owned } = await admin
        .from("lessons")
        .select("id")
        .eq("id", id)
        .eq("user_id", userId)
        .maybeSingle();
      if (!owned) return textResult("Lesson not found.", true);
      if (args.make_public === true) {
        const { error } = await admin.from("lessons").update({ visibility: "public" }).eq("id", id).eq("user_id", userId);
        if (error) return textResult(`Update failed: ${error.message}`, true);
      }
      return textResult(JSON.stringify({ id, preview: previewUrl(id), public: args.make_public === true }, null, 2));
    }

    default:
      return textResult(`Unknown tool: ${name}`, true);
  }
}

function rpcResult(id: string | number, result: unknown) {
  return new Response(JSON.stringify({ jsonrpc: "2.0", id, result }), {
    status: 200,
    headers: { ...CORS, "content-type": "application/json" },
  });
}

function rpcError(id: string | number | null, code: number, message: string) {
  return new Response(JSON.stringify({ jsonrpc: "2.0", id, error: { code, message } }), {
    status: 200,
    headers: { ...CORS, "content-type": "application/json" },
  });
}

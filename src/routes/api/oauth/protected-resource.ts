import { createFileRoute } from "@tanstack/react-router";
import { serverBaseUrl, json } from "@/lib/oauth";

/** OAuth 2.0 Protected Resource Metadata (RFC 9728).
 *  Exposed at /.well-known/oauth-protected-resource via vercel.json rewrite. */
export const Route = createFileRoute("/api/oauth/protected-resource")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const base = serverBaseUrl(request);
        return json({
          resource: `${base}/mcp`,
          authorization_servers: [base],
          scopes_supported: ["lumi.read", "lumi.write"],
          bearer_methods_supported: ["header"],
        });
      },
    },
  },
});

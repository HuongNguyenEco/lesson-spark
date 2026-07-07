import { createFileRoute } from "@tanstack/react-router";
import { serverBaseUrl, json } from "@/lib/oauth";

/** OAuth 2.1 Authorization Server Metadata (RFC 8414).
 *  Exposed at /.well-known/oauth-authorization-server via vercel.json rewrite. */
export const Route = createFileRoute("/api/oauth/authorization-server")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const base = serverBaseUrl(request);
        return json({
          issuer: base,
          authorization_endpoint: `${base}/authorize`,
          token_endpoint: `${base}/api/oauth/token`,
          registration_endpoint: `${base}/api/oauth/register`,
          response_types_supported: ["code"],
          grant_types_supported: ["authorization_code", "refresh_token"],
          code_challenge_methods_supported: ["S256", "plain"],
          token_endpoint_auth_methods_supported: ["none", "client_secret_post"],
          scopes_supported: ["lumi.read", "lumi.write"],
        });
      },
    },
  },
});

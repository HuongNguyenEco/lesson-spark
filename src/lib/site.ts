/**
 * Public base URL of the app. Used to build shareable preview links and OAuth
 * metadata. Configure VITE_PUBLIC_APP_URL for production (e.g. the Vercel
 * domain); falls back to the current origin in the browser.
 */
export function getBaseUrl(): string {
  const env = import.meta.env.VITE_PUBLIC_APP_URL as string | undefined;
  if (env) return env.replace(/\/+$/, "");
  if (typeof window !== "undefined") return window.location.origin;
  return "";
}

export function previewUrl(id: string): string {
  return `${getBaseUrl()}/p/${id}`;
}

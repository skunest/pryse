/**
 * This app's public address, used in invite, password and signing links.
 * Always set NEXT_PUBLIC_SITE_URL in Vercel. Without it, links fall back to the
 * project's production domain, never to a one-off deployment URL (those are
 * protected by Vercel and ask the visitor to log in to Vercel).
 */
export function siteUrl() {
  const v = process.env.NEXT_PUBLIC_SITE_URL
    || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "")
    || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "")
    || "http://localhost:3000";
  return v.replace(/\/$/, "");
}

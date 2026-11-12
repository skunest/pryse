/** This app's public address, used in invite, password and signing links. */
export function siteUrl() {
  const v = process.env.NEXT_PUBLIC_SITE_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");
  return v.replace(/\/$/, "");
}

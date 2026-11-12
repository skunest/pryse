import { json } from "@/lib/http";
import { adminDb, authDb, BUCKET } from "@/lib/supabase";

/**
 * GET /api/health            quick liveness check
 * GET /api/health?check=1    configuration check (no secrets are returned)
 */
export async function GET(req: Request) {
  const base = { ok: true, service: "pryse", version: "0.1.0", time: new Date().toISOString() };
  if (!new URL(req.url).searchParams.get("check")) return json(base);

  const env = {
    NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL || null,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL || null,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
    RESEND_API_KEY: !!process.env.RESEND_API_KEY,
    EMAIL_FROM: process.env.EMAIL_FROM || null,
  };
  const checks: Record<string, string> = {};
  const run = async (name: string, fn: () => Promise<void>) => {
    try { await fn(); checks[name] = "ok"; } catch (e: any) { checks[name] = `FAILED: ${e?.message || e}`; }
  };
  await run("public key", async () => {
    const { error } = await authDb().from("firms").select("id", { head: true, count: "exact" });
    if (error && error.code !== "42501") throw error;
  });
  await run("service key", async () => {
    const { error } = await adminDb().auth.admin.listUsers({ page: 1, perPage: 1 });
    if (error) throw error;
  });
  await run("database tables", async () => {
    const { error } = await adminDb().from("invoices").select("id", { head: true, count: "exact" });
    if (error) throw new Error(error.code === "42P01" || /does not exist|schema cache/i.test(error.message)
      ? "Pryse tables not found. Run supabase/migrations/0001_init.sql in the SQL editor." : error.message);
  });
  await run("storage bucket", async () => {
    const { error } = await adminDb().storage.getBucket(BUCKET);
    if (error) throw new Error(`Bucket "${BUCKET}" not found. Run the migration.`);
  });
  const ok = Object.values(checks).every((v) => v === "ok");
  return json({ ...base, ok, env, checks }, ok ? 200 : 500);
}

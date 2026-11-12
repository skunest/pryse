import "server-only";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { authDb, userDb } from "./supabase";
import { forbidden, unauthorized, ApiError } from "./http";

export type Role = "owner" | "admin" | "fee_earner" | "bookkeeper" | "staff";

export type AuthCtx = {
  user: User;
  token: string;
  db: SupabaseClient; // RLS applies
};

export type FirmCtx = AuthCtx & { firmId: string; role: Role };

export async function requireUser(req: Request): Promise<AuthCtx> {
  const header = req.headers.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token) throw unauthorized();
  let res;
  try {
    // Verified with the public (anon) key, so sign-in does not depend on the service key.
    res = await authDb().auth.getUser(token);
  } catch (e: any) {
    console.error("[auth] getUser failed", e?.message);
    throw new ApiError(500, `Pryse cannot reach Supabase: ${e?.message || "unknown error"}. Check the Supabase settings in Vercel.`, "config");
  }
  const { data, error } = res;
  if (error || !data.user) {
    const msg = error?.message || "";
    console.error("[auth] token rejected:", error?.status, msg);
    if (/fetch failed|network|ENOTFOUND|ECONNREFUSED/i.test(msg) || error?.name === "AuthRetryableFetchError") {
      throw new ApiError(500, `Pryse cannot reach Supabase (${msg}). Check NEXT_PUBLIC_SUPABASE_URL in Vercel.`, "config");
    }
    // A bad API key, or a token from another Supabase project, is a setup problem, not an expired session.
    if (/api key|apikey|invalid.*key|no api key/i.test(msg)) {
      throw new ApiError(500, "The server's NEXT_PUBLIC_SUPABASE_ANON_KEY is not valid for this Supabase project. Open /api/health?check=1 to check the setup.", "config");
    }
    if (/session.*not.*exist|session_not_found|expired/i.test(msg) || error?.status === 401 || error?.status === 403) {
      throw unauthorized(`Your session could not be confirmed (${msg || "rejected"}). If this keeps happening, open /api/health?check=1 to check the setup.`);
    }
    throw unauthorized("Your session has expired. Please sign in again.");
  }
  return { user: data.user, token, db: userDb(token) };
}

/**
 * Resolves the firm for this request. Uses the X-Firm-Id header when given
 * (for users in more than one firm), otherwise the user's only firm.
 */
export async function requireFirm(req: Request, roles?: Role[]): Promise<FirmCtx> {
  const ctx = await requireUser(req);
  const wanted = req.headers.get("x-firm-id");
  let q = ctx.db.from("firm_members").select("firm_id, role").eq("user_id", ctx.user.id);
  if (wanted) q = q.eq("firm_id", wanted);
  const { data, error } = await q.limit(2);
  if (error) throw error;
  if (!data || data.length === 0) throw new ApiError(409, "Set up your firm first", "no_firm");
  if (data.length > 1 && !wanted) throw new ApiError(400, "Choose a firm with the X-Firm-Id header", "firm_required");
  const m = data[0] as { firm_id: string; role: Role };
  if (roles && !roles.includes(m.role)) throw forbidden();
  return { ...ctx, firmId: m.firm_id, role: m.role };
}

export const ADMIN_ROLES: Role[] = ["owner", "admin"];
export const BILLING_ROLES: Role[] = ["owner", "admin", "bookkeeper", "fee_earner"];

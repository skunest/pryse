import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ApiError } from "./http";
import { fmtDate } from "./money";

const STATUS: Record<string, string> = { sent: "awaiting signature", completed: "signed" };

/**
 * Finds earlier signing requests that were already sent for the same document:
 * the same PDF (by fingerprint), or the same title for the same client.
 * Drafts, cancelled, declined and expired requests are ignored.
 */
export async function findEarlierSends(db: SupabaseClient, firmId: string, o: { sha256: string; title: string; clientId: string | null; excludeId?: string }) {
  let q = db.from("signing_requests")
    .select("id, title, status, sent_at, client_id, original_sha256, signers(name, email)")
    .eq("firm_id", firmId).in("status", ["sent", "completed"]).order("sent_at", { ascending: false }).limit(50);
  if (o.excludeId) q = q.neq("id", o.excludeId);
  const { data } = await q;
  const title = o.title.trim().toLowerCase();
  return (data ?? []).filter((r: any) =>
    r.original_sha256 === o.sha256 || (o.clientId && r.client_id === o.clientId && String(r.title).trim().toLowerCase() === title));
}

/** Throws a 409 describing the earlier send, unless the user confirmed sending again. */
export function blockDuplicate(earlier: any[], allow: boolean) {
  if (allow || !earlier.length) return;
  const r = earlier[0];
  const who = (r.signers ?? []).map((s: any) => `${s.name} (${s.email})`).join(", ");
  const more = earlier.length > 1 ? ` It has been sent ${earlier.length} times.` : "";
  throw new ApiError(409,
    `"${r.title}" was already sent to ${who || "the client"} on ${fmtDate(r.sent_at)} and is ${STATUS[r.status] ?? r.status}.${more}`,
    `already_sent:${r.id}`);
}

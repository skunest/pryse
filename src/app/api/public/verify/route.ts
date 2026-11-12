import { route, json, must, badRequest } from "@/lib/http";
import { adminDb } from "@/lib/supabase";
import { shortRef } from "@/lib/signflow";

/** Checks whether a file's SHA-256 matches a document signed through the API. */
export const GET = route(async (req) => {
  const hash = (new URL(req.url).searchParams.get("sha256") || "").trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(hash)) throw badRequest("Provide a SHA-256 fingerprint");
  const rows = must(await adminDb().from("signing_requests")
    .select("id, title, completed_at, firm:firms(name, legal_name), signers(name, signed_at)")
    .eq("signed_sha256", hash).eq("status", "completed").limit(1)) as any[];
  if (!rows.length) return json({ match: false });
  const r = rows[0];
  return json({
    match: true,
    document: {
      reference: shortRef(r.id), title: r.title, completed_at: r.completed_at,
      firm: r.firm.legal_name || r.firm.name,
      signers: (r.signers || []).map((s: any) => ({ name: s.name, signed_at: s.signed_at })),
    },
  });
});

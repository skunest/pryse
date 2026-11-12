import { route, json, must } from "@/lib/http";
import { requireFirm } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { requireRequest, assertDraftOrSent, logEvent } from "@/lib/signflow";

export const POST = route<{ id: string }>(async (req, { id }) => {
  const ctx = await requireFirm(req);
  const r = await requireRequest(ctx.db, ctx.firmId, id);
  assertDraftOrSent(r);
  must(await ctx.db.from("signing_requests").update({ status: "cancelled", cancelled_at: new Date().toISOString() }).eq("firm_id", ctx.firmId).eq("id", id));
  await logEvent({ request_id: id, firm_id: ctx.firmId, event: "cancelled", detail: `by ${ctx.user.email}`, req });
  await audit(ctx, req, "signing_request", id, "cancelled");
  return json({ ok: true });
});

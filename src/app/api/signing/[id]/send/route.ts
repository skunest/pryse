import { route, json, must, badRequest } from "@/lib/http";
import { requireFirm } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { emailSigningLinks, requireRequest } from "@/lib/signflow";

export const POST = route<{ id: string }>(async (req, { id }) => {
  const ctx = await requireFirm(req);
  const r = await requireRequest(ctx.db, ctx.firmId, id);
  if (r.status !== "draft") throw badRequest("This request has already been sent");
  must(await ctx.db.from("signing_requests").update({ status: "sent", sent_at: new Date().toISOString() }).eq("firm_id", ctx.firmId).eq("id", id));
  const delivery = await emailSigningLinks(id, { event: "sent", req });
  await audit(ctx, req, "signing_request", id, "sent");
  return json({ ok: true, delivery });
});

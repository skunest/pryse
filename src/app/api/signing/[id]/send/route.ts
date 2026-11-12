import { route, json, must, badRequest, body } from "@/lib/http";
import { requireFirm } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { emailSigningLinks, requireRequest } from "@/lib/signflow";
import { blockDuplicate, findEarlierSends } from "@/lib/duplicates";

export const POST = route<{ id: string }>(async (req, { id }) => {
  const ctx = await requireFirm(req);
  const input = (await body(req).catch(() => ({}))) as { allow_duplicate?: boolean };
  const r = await requireRequest(ctx.db, ctx.firmId, id);
  if (r.status !== "draft") throw badRequest("This request has already been sent");
  blockDuplicate(await findEarlierSends(ctx.db, ctx.firmId, { sha256: r.original_sha256, title: r.title, clientId: r.client_id, excludeId: id }), !!input?.allow_duplicate);
  // Only one send can win, even if the button is pressed twice.
  const { data: won } = await ctx.db.from("signing_requests")
    .update({ status: "sent", sent_at: new Date().toISOString() })
    .eq("firm_id", ctx.firmId).eq("id", id).eq("status", "draft").select("id");
  if (!won?.length) throw badRequest("This request has already been sent");
  const delivery = await emailSigningLinks(id, { event: "sent", req });
  await audit(ctx, req, "signing_request", id, "sent");
  return json({ ok: true, delivery });
});

import { route, json, must, badRequest } from "@/lib/http";
import { requireFirm } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { SIGNER_COLS, requireRequest, shortRef, appUrl } from "@/lib/signflow";
import { documentType } from "@/lib/signing";

export const GET = route<{ id: string }>(async (req, { id }) => {
  const ctx = await requireFirm(req);
  const r = await requireRequest(ctx.db, ctx.firmId, id);
  const [signers, events, firm] = await Promise.all([
    ctx.db.from("signers").select(SIGNER_COLS).eq("request_id", id).order("sign_order"),
    ctx.db.from("signing_events").select("id, signer_id, event, detail, ip, created_at").eq("request_id", id).order("created_at"),
    ctx.db.from("firms").select("app_url").eq("id", ctx.firmId).single(),
  ]);
  return json({
    request: { ...r, reference: shortRef(r.id), document_type_label: documentType(r.document_type)?.label ?? r.document_type },
    signers: must(signers), events: must(events), verify_url: `${appUrl(must(firm) as any)}/verify`,
  });
});

/** Delete a draft that has not been sent. */
export const DELETE = route<{ id: string }>(async (req, { id }) => {
  const ctx = await requireFirm(req);
  const r = await requireRequest(ctx.db, ctx.firmId, id);
  if (r.status !== "draft") throw badRequest("Only unsent drafts can be deleted. Cancel the request instead.");
  must(await ctx.db.from("signing_requests").delete().eq("firm_id", ctx.firmId).eq("id", id));
  await audit(ctx, req, "signing_request", id, "deleted_draft");
  return json({ ok: true });
});

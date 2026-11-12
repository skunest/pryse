import { route, json, badRequest } from "@/lib/http";
import { requireFirm } from "@/lib/auth";
import { requireRequest, finalizeIfComplete } from "@/lib/signflow";

/** Retries sealing if every signer has signed but sealing did not finish. */
export const POST = route<{ id: string }>(async (req, { id }) => {
  const ctx = await requireFirm(req);
  const r = await requireRequest(ctx.db, ctx.firmId, id);
  if (r.status !== "sent") throw badRequest("Only requests waiting for signatures can be finalised");
  const done = await finalizeIfComplete(id, req);
  if (!done) throw badRequest("Not everyone has signed yet");
  return json({ ok: true });
});

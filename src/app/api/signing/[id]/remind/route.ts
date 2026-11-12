import { route, json, badRequest } from "@/lib/http";
import { requireFirm } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { emailSigningLinks, requireRequest } from "@/lib/signflow";

/** Sends a new link to everyone who has not signed yet. Earlier links stop working. */
export const POST = route<{ id: string }>(async (req, { id }) => {
  const ctx = await requireFirm(req);
  const r = await requireRequest(ctx.db, ctx.firmId, id);
  if (r.status !== "sent") throw badRequest("Reminders can only be sent while a request is waiting for signatures");
  const delivery = await emailSigningLinks(id, { event: "reminder_sent", onlyPending: true, req });
  await audit(ctx, req, "signing_request", id, "reminded");
  return json({ ok: true, delivery });
});

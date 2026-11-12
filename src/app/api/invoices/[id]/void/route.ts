import { z } from "zod";
import { route, json, must, body } from "@/lib/http";
import { requireFirm } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { loadInvoice } from "@/lib/invoices";

const schema = z.object({ reason: z.string().trim().min(3, "Give a reason").max(500) });

/** Void an issued invoice with no payments. The number is kept, never reused. */
export const POST = route<{ id: string }>(async (req, { id }) => {
  const ctx = await requireFirm(req, ["owner", "admin", "bookkeeper"]);
  const { reason } = schema.parse(await body(req));
  await loadInvoice(ctx.db, ctx.firmId, id);
  must(await ctx.db.from("invoices").update({
    status: "void", void_reason: reason, voided_at: new Date().toISOString(), voided_by: ctx.user.id,
  }).eq("firm_id", ctx.firmId).eq("id", id));
  await audit(ctx, req, "invoice", id, "voided", { reason });
  return json(await loadInvoice(ctx.db, ctx.firmId, id));
});

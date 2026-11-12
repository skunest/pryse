import { z } from "zod";
import { route, json, must, body } from "@/lib/http";
import { requireFirm } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { loadInvoice } from "@/lib/invoices";

const schema = z.object({
  amount_cents: z.coerce.number().int().positive(),
  paid_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  method: z.enum(["eft", "cash", "card", "trust_transfer", "other"]).default("eft"),
  reference: z.string().trim().max(120).nullable().optional(),
});

/** Record a payment. Payments cannot be edited; the invoice status follows them. */
export const POST = route<{ id: string }>(async (req, { id }) => {
  const ctx = await requireFirm(req, ["owner", "admin", "bookkeeper"]);
  const input = schema.parse(await body(req));
  await loadInvoice(ctx.db, ctx.firmId, id);
  const payment = must(await ctx.db.from("payments").insert({
    invoice_id: id, firm_id: ctx.firmId, amount_cents: input.amount_cents,
    paid_on: input.paid_on ?? new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Johannesburg" }),
    method: input.method, reference: input.reference ?? null, recorded_by: ctx.user.id,
  }).select("id").single()) as any;
  await audit(ctx, req, "invoice", id, "payment_recorded", { payment_id: payment.id, amount_cents: input.amount_cents, method: input.method });
  return json(await loadInvoice(ctx.db, ctx.firmId, id), 201);
});

import { z } from "zod";
import { route, json, must, body, badRequest } from "@/lib/http";
import { requireFirm, BILLING_ROLES } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { lineSchema, writeLines, loadInvoice, withOverdue } from "@/lib/invoices";

const patch = z.object({
  client_id: z.string().uuid().optional(),
  matter_id: z.string().uuid().nullable().optional(),
  due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  reference: z.string().trim().max(120).nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
  lines: z.array(lineSchema).max(200).optional(),
});

export const GET = route<{ id: string }>(async (req, { id }) => {
  const ctx = await requireFirm(req);
  const data = await loadInvoice(ctx.db, ctx.firmId, id);
  return json({ ...data, invoice: withOverdue(data.invoice) });
});

/** Edit a draft. Issued invoices are locked by the database. */
export const PATCH = route<{ id: string }>(async (req, { id }) => {
  const ctx = await requireFirm(req, BILLING_ROLES);
  const { lines, ...header } = patch.parse(await body(req));
  const current = await loadInvoice(ctx.db, ctx.firmId, id);
  if (current.invoice.status !== "draft") throw badRequest("Issued invoices cannot be edited. Void it and create a new one.");
  if (Object.keys(header).length) must(await ctx.db.from("invoices").update(header).eq("firm_id", ctx.firmId).eq("id", id));
  if (lines) {
    const firm = must(await ctx.db.from("firms").select("vat_registered, default_vat_rate").eq("id", ctx.firmId).single()) as any;
    await writeLines(ctx.db, ctx.firmId, id, lines, firm);
  }
  await audit(ctx, req, "invoice", id, "updated");
  return json(await loadInvoice(ctx.db, ctx.firmId, id));
});

export const DELETE = route<{ id: string }>(async (req, { id }) => {
  const ctx = await requireFirm(req, BILLING_ROLES);
  const current = await loadInvoice(ctx.db, ctx.firmId, id);
  if (current.invoice.status !== "draft") throw badRequest("Issued invoices cannot be deleted. Void the invoice instead.");
  must(await ctx.db.from("invoices").delete().eq("firm_id", ctx.firmId).eq("id", id));
  await audit(ctx, req, "invoice", id, "deleted_draft");
  return json({ ok: true });
});

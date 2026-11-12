import { z } from "zod";
import { route, json, must, body } from "@/lib/http";
import { requireFirm, BILLING_ROLES } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { loadInvoice } from "@/lib/invoices";

const schema = z.object({ issue_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() });

/** Issue a draft: assigns the next invoice number and locks the invoice. */
export const POST = route<{ id: string }>(async (req, { id }) => {
  const ctx = await requireFirm(req, BILLING_ROLES);
  const raw = req.headers.get("content-length") === "0" ? {} : await body(req).catch(() => ({}));
  const { issue_date } = schema.parse(raw);
  await loadInvoice(ctx.db, ctx.firmId, id); // 404 if not this firm's
  const inv = must(await ctx.db.rpc("issue_invoice", { p_invoice: id, p_issue_date: issue_date ?? null })) as any;
  await audit(ctx, req, "invoice", id, "issued", { number: inv.number, total_cents: inv.total_cents });
  return json(await loadInvoice(ctx.db, ctx.firmId, id));
});

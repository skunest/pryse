import { z } from "zod";
import { route, json, must, body } from "@/lib/http";
import { requireFirm, BILLING_ROLES } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { lineSchema, writeLines, loadInvoice, withOverdue } from "@/lib/invoices";

const schema = z.object({
  client_id: z.string().uuid(),
  matter_id: z.string().uuid().nullable().optional(),
  due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  reference: z.string().trim().max(120).nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
  lines: z.array(lineSchema).max(200).default([]),
});

export const GET = route(async (req) => {
  const ctx = await requireFirm(req);
  const url = new URL(req.url);
  const status = url.searchParams.get("status");
  const clientId = url.searchParams.get("client_id");
  const q = (url.searchParams.get("q") || "").replace(/[%,()]/g, "").trim();
  let query = ctx.db.from("invoices")
    .select("id, number, status, issue_date, due_date, total_cents, paid_cents, vat_cents, created_at, emailed_at, email_count, last_emailed_to, client:clients(id, name), matter:matters(id, file_number, title)")
    .eq("firm_id", ctx.firmId).order("created_at", { ascending: false }).limit(500);
  if (status && status !== "overdue" && status !== "outstanding") query = query.eq("status", status);
  if (status === "outstanding" || status === "overdue") query = query.in("status", ["issued", "partially_paid"]);
  if (clientId) query = query.eq("client_id", clientId);
  if (q) query = query.ilike("number", `%${q}%`);
  let invoices = (must(await query) as any[]).map(withOverdue);
  if (status === "overdue") invoices = invoices.filter((i) => i.overdue);
  return json({ invoices });
});

export const POST = route(async (req) => {
  const ctx = await requireFirm(req, BILLING_ROLES);
  const input = schema.parse(await body(req));
  const firm = must(await ctx.db.from("firms").select("vat_registered, default_vat_rate").eq("id", ctx.firmId).single()) as any;
  const inv = must(await ctx.db.from("invoices").insert({
    firm_id: ctx.firmId, client_id: input.client_id, matter_id: input.matter_id ?? null,
    due_date: input.due_date ?? null, reference: input.reference ?? null, notes: input.notes ?? null, created_by: ctx.user.id,
  }).select("id").single()) as any;
  await writeLines(ctx.db, ctx.firmId, inv.id, input.lines, firm);
  await audit(ctx, req, "invoice", inv.id, "created");
  return json(await loadInvoice(ctx.db, ctx.firmId, inv.id), 201);
});

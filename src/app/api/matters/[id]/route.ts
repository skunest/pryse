import { z } from "zod";
import { route, json, must, body, notFound } from "@/lib/http";
import { requireFirm } from "@/lib/auth";
import { audit } from "@/lib/audit";

const patch = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  practice_area: z.string().trim().max(80).nullable().optional(),
  status: z.enum(["open", "closed"]).optional(),
  responsible_id: z.string().uuid().nullable().optional(),
});

export const GET = route<{ id: string }>(async (req, { id }) => {
  const ctx = await requireFirm(req);
  const matter = must(await ctx.db.from("matters").select("*, client:clients(id, name, email)").eq("firm_id", ctx.firmId).eq("id", id).maybeSingle());
  if (!matter) throw notFound("Matter not found");
  const [invoices, signing] = await Promise.all([
    ctx.db.from("invoices").select("id, number, status, issue_date, due_date, total_cents, paid_cents, created_at").eq("firm_id", ctx.firmId).eq("matter_id", id).order("created_at", { ascending: false }),
    ctx.db.from("signing_requests").select("id, title, status, created_at, completed_at").eq("firm_id", ctx.firmId).eq("matter_id", id).order("created_at", { ascending: false }),
  ]);
  return json({ matter, invoices: must(invoices), signing: must(signing) });
});

export const PATCH = route<{ id: string }>(async (req, { id }) => {
  const ctx = await requireFirm(req);
  const input = patch.parse(await body(req));
  const matter = must(await ctx.db.from("matters").update(input).eq("firm_id", ctx.firmId).eq("id", id).select("*").maybeSingle());
  if (!matter) throw notFound("Matter not found");
  await audit(ctx, req, "matter", id, "updated", input as Record<string, unknown>);
  return json({ matter });
});

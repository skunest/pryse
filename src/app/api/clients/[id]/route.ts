import { route, json, must, body, notFound } from "@/lib/http";
import { requireFirm } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { clientPatch } from "../schema";

export const GET = route<{ id: string }>(async (req, { id }) => {
  const ctx = await requireFirm(req);
  const client = must(await ctx.db.from("clients").select("*").eq("firm_id", ctx.firmId).eq("id", id).maybeSingle());
  if (!client) throw notFound("Client not found");
  const [matters, invoices, signing] = await Promise.all([
    ctx.db.from("matters").select("id, file_number, title, status, practice_area, created_at").eq("firm_id", ctx.firmId).eq("client_id", id).order("created_at", { ascending: false }),
    ctx.db.from("invoices").select("id, number, status, issue_date, due_date, total_cents, paid_cents, created_at").eq("firm_id", ctx.firmId).eq("client_id", id).order("created_at", { ascending: false }),
    ctx.db.from("signing_requests").select("id, title, status, created_at, completed_at").eq("firm_id", ctx.firmId).eq("client_id", id).order("created_at", { ascending: false }),
  ]);
  return json({ client, matters: must(matters), invoices: must(invoices), signing: must(signing) });
});

export const PATCH = route<{ id: string }>(async (req, { id }) => {
  const ctx = await requireFirm(req);
  const input = clientPatch.parse(await body(req));
  const client = must(await ctx.db.from("clients").update(input).eq("firm_id", ctx.firmId).eq("id", id).select("*").maybeSingle());
  if (!client) throw notFound("Client not found");
  await audit(ctx, req, "client", id, "updated", { fields: Object.keys(input) });
  return json({ client });
});

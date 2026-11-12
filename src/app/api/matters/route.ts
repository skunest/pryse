import { z } from "zod";
import { route, json, must, body } from "@/lib/http";
import { requireFirm } from "@/lib/auth";
import { audit } from "@/lib/audit";

const schema = z.object({
  client_id: z.string().uuid(),
  title: z.string().trim().min(1, "Title is required").max(200),
  file_number: z.string().trim().max(40).optional().transform((v) => v || undefined),
  practice_area: z.string().trim().max(80).nullable().optional(),
  responsible_id: z.string().uuid().nullable().optional(),
});

export const GET = route(async (req) => {
  const ctx = await requireFirm(req);
  const url = new URL(req.url);
  const q = (url.searchParams.get("q") || "").replace(/[%,()]/g, "").trim();
  const clientId = url.searchParams.get("client_id");
  const status = url.searchParams.get("status");
  let query = ctx.db.from("matters").select("*, client:clients(id, name)").eq("firm_id", ctx.firmId).order("created_at", { ascending: false }).limit(500);
  if (clientId) query = query.eq("client_id", clientId);
  if (status === "open" || status === "closed") query = query.eq("status", status);
  if (q) query = query.or(`title.ilike.%${q}%,file_number.ilike.%${q}%`);
  return json({ matters: must(await query) });
});

export const POST = route(async (req) => {
  const ctx = await requireFirm(req);
  const input = schema.parse(await body(req));
  const matter = must(
    await ctx.db.from("matters").insert({ ...input, firm_id: ctx.firmId, created_by: ctx.user.id, responsible_id: input.responsible_id ?? ctx.user.id })
      .select("*, client:clients(id, name)").single(),
  ) as any;
  await audit(ctx, req, "matter", matter.id, "created", { file_number: matter.file_number });
  return json({ matter }, 201);
});

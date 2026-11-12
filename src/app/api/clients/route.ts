import { route, json, must, body } from "@/lib/http";
import { requireFirm } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { clientSchema } from "./schema";

export const GET = route(async (req) => {
  const ctx = await requireFirm(req);
  const url = new URL(req.url);
  const q = (url.searchParams.get("q") || "").trim();
  const archived = url.searchParams.get("archived") === "true";
  let query = ctx.db.from("clients").select("*").eq("firm_id", ctx.firmId).eq("archived", archived).order("name").limit(500);
  if (q) query = query.or(`name.ilike.%${q.replace(/[%,()]/g, "")}%,email.ilike.%${q.replace(/[%,()]/g, "")}%,id_or_reg_number.ilike.%${q.replace(/[%,()]/g, "")}%`);
  return json({ clients: must(await query) });
});

export const POST = route(async (req) => {
  const ctx = await requireFirm(req);
  const input = clientSchema.parse(await body(req));
  const client = must(
    await ctx.db.from("clients").insert({ ...input, firm_id: ctx.firmId, created_by: ctx.user.id }).select("*").single(),
  ) as any;
  await audit(ctx, req, "client", client.id, "created", { name: client.name });
  return json({ client }, 201);
});

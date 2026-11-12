import { z } from "zod";
import { route, json, must, body } from "@/lib/http";
import { requireUser } from "@/lib/auth";

const schema = z.object({ name: z.string().trim().min(2).max(160) });

/** First-time setup: create a firm and become its owner. */
export const POST = route(async (req) => {
  const ctx = await requireUser(req);
  const { name } = schema.parse(await body(req));
  const id = must(await ctx.db.rpc("create_firm", { p_name: name })) as string;
  return json({ id }, 201);
});

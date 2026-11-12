import { z } from "zod";
import { route, json, must, body } from "@/lib/http";
import { requireFirm, ADMIN_ROLES } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { signedUrl } from "@/lib/storage";

const opt = (max = 300) => z.string().trim().max(max).nullable().optional().transform((v) => (v === "" ? null : v));

const schema = z.object({
  name: z.string().trim().min(2).max(160).optional(),
  legal_name: opt(200),
  registration_number: opt(60),
  vat_registered: z.boolean().optional(),
  vat_number: opt(30),
  email: opt(200),
  phone: opt(40),
  address: opt(500),
  bank_name: opt(80),
  bank_account_name: opt(120),
  bank_account_number: opt(40),
  bank_branch_code: opt(20),
  invoice_prefix: z.string().trim().regex(/^[A-Z0-9]{1,8}$/, "Use up to 8 capital letters or numbers").optional(),
  matter_prefix: z.string().trim().regex(/^[A-Z0-9]{1,8}$/, "Use up to 8 capital letters or numbers").optional(),
  default_payment_days: z.number().int().min(0).max(365).optional(),
  default_vat_rate: z.number().min(0).max(100).optional(),
  invoice_footer: opt(300),
  brand_color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
});

export const GET = route(async (req) => {
  const ctx = await requireFirm(req);
  const firm = must(await ctx.db.from("firms").select("*").eq("id", ctx.firmId).single()) as any;
  const logo_url = firm.logo_path ? await signedUrl(firm.logo_path, 3600) : null;
  return json({ firm: { ...firm, logo_url }, role: ctx.role });
});

export const PATCH = route(async (req) => {
  const ctx = await requireFirm(req, ADMIN_ROLES);
  const patch = schema.parse(await body(req));
  const firm = must(await ctx.db.from("firms").update(patch).eq("id", ctx.firmId).select("*").single());
  await audit(ctx, req, "firm", ctx.firmId, "updated", { fields: Object.keys(patch) });
  return json({ firm });
});

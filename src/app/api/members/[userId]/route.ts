import { z } from "zod";
import { route, json, must, body, badRequest, notFound } from "@/lib/http";
import { requireFirm, ADMIN_ROLES } from "@/lib/auth";
import { adminDb } from "@/lib/supabase";
import { audit } from "@/lib/audit";
import { siteUrl } from "@/lib/site";

const patch = z.object({
  role: z.enum(["admin", "fee_earner", "bookkeeper", "staff"]).optional(),
  full_name: z.string().trim().max(120).optional(),
  resend_invite: z.boolean().optional(),
});

export const PATCH = route<{ userId: string }>(async (req, { userId }) => {
  const ctx = await requireFirm(req, ADMIN_ROLES);
  const input = patch.parse(await body(req));
  const admin = adminDb();
  const member = must(
    await admin.from("firm_members").select("role, email").eq("firm_id", ctx.firmId).eq("user_id", userId).maybeSingle(),
  ) as any;
  if (!member) throw notFound("Team member not found");
  if (member.role === "owner" && input.role) throw badRequest("The owner's role cannot be changed");

  const update: Record<string, unknown> = {};
  if (input.role) update.role = input.role;
  if (input.full_name !== undefined) update.full_name = input.full_name;
  if (Object.keys(update).length) {
    must(await admin.from("firm_members").update(update).eq("firm_id", ctx.firmId).eq("user_id", userId));
  }
  if (input.resend_invite && member.email) {
    const r = await admin.auth.admin.inviteUserByEmail(member.email, { redirectTo: `${siteUrl()}/auth/confirm` });
    if (r.error) throw badRequest("This person has already accepted their invite. They can use 'Forgot password' to sign in.");
  }
  await audit(ctx, req, "member", userId, "updated", input as Record<string, unknown>);
  return json({ ok: true });
});

export const DELETE = route<{ userId: string }>(async (req, { userId }) => {
  const ctx = await requireFirm(req, ADMIN_ROLES);
  if (userId === ctx.user.id) throw badRequest("You cannot remove yourself");
  const admin = adminDb();
  const member = must(
    await admin.from("firm_members").select("role").eq("firm_id", ctx.firmId).eq("user_id", userId).maybeSingle(),
  ) as any;
  if (!member) throw notFound("Team member not found");
  if (member.role === "owner") throw badRequest("The owner cannot be removed");
  must(await admin.from("firm_members").delete().eq("firm_id", ctx.firmId).eq("user_id", userId));
  await audit(ctx, req, "member", userId, "removed");
  return json({ ok: true });
});

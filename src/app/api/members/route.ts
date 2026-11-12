import { z } from "zod";
import { route, json, must, body, badRequest } from "@/lib/http";
import { requireFirm, ADMIN_ROLES } from "@/lib/auth";
import { adminDb } from "@/lib/supabase";
import { audit } from "@/lib/audit";
import { sendInvite } from "@/lib/account-emails";

export const GET = route(async (req) => {
  const ctx = await requireFirm(req);
  const members = must(
    await ctx.db.from("firm_members").select("user_id, role, full_name, email, created_at").eq("firm_id", ctx.firmId).order("created_at"),
  ) as any[];
  // Invite status comes from auth (service role), filtered to this firm's members only.
  const enriched = await Promise.all(
    members.map(async (m) => {
      const { data } = await adminDb().auth.admin.getUserById(m.user_id);
      return { ...m, last_sign_in_at: data.user?.last_sign_in_at ?? null, invite_pending: !data.user?.last_sign_in_at };
    }),
  );
  return json({ members: enriched });
});

const invite = z.object({
  email: z.string().trim().toLowerCase().email(),
  full_name: z.string().trim().max(120).optional(),
  role: z.enum(["admin", "fee_earner", "bookkeeper", "staff"]).default("staff"),
});

/** Invite a team member by email. Admins only. */
export const POST = route(async (req) => {
  const ctx = await requireFirm(req, ADMIN_ROLES);
  const input = invite.parse(await body(req));
  const admin = adminDb();

  const existing = must(await admin.from("firm_members").select("user_id").eq("firm_id", ctx.firmId).eq("email", input.email).maybeSingle());
  if (existing) throw badRequest("That person is already in your team. Use Resend if they did not get the invite.");
  const firm = must(await admin.from("firms").select("name, legal_name").eq("id", ctx.firmId).single()) as any;

  let sent;
  try {
    sent = await sendInvite({ email: input.email, fullName: input.full_name, firmName: firm.legal_name || firm.name, invitedBy: ctx.user.email });
  } catch (e: any) {
    throw badRequest(`Could not invite that email address: ${e.message}`);
  }
  const userId = sent.userId;
  if (!userId) throw badRequest("Could not invite that email address");

  const { error } = await admin.from("firm_members").insert({
    firm_id: ctx.firmId, user_id: userId, role: input.role, full_name: input.full_name ?? null, email: input.email,
  });
  if (error && (error as any).code === "23505") throw badRequest("That person is already in your team");
  if (error) throw error;
  await audit(ctx, req, "member", userId, "invited", { email: input.email, role: input.role });
  // If the email could not be sent, give the administrator the link to share another way.
  return json({ user_id: userId, emailed: sent.sent, link: sent.sent ? undefined : sent.url, email_error: sent.error }, 201);
});

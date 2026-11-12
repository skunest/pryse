import { z } from "zod";
import { route, json, must, body, badRequest } from "@/lib/http";
import { requireFirm, ADMIN_ROLES } from "@/lib/auth";
import { adminDb } from "@/lib/supabase";
import { audit } from "@/lib/audit";
import { siteUrl } from "@/lib/site";

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

  let userId: string | null = null;
  const inv = await admin.auth.admin.inviteUserByEmail(input.email, {
    redirectTo: `${siteUrl()}/auth/confirm`,
    data: { full_name: input.full_name ?? null },
  });
  if (inv.error) {
    // Already has an account: look it up and add them to the firm.
    if (!/already|registered|exists/i.test(inv.error.message)) throw badRequest(inv.error.message);
    const { data } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    userId = data.users.find((u) => u.email?.toLowerCase() === input.email)?.id ?? null;
    if (!userId) throw badRequest("Could not invite that email address");
  } else {
    userId = inv.data.user.id;
  }

  const { error } = await admin.from("firm_members").insert({
    firm_id: ctx.firmId, user_id: userId, role: input.role, full_name: input.full_name ?? null, email: input.email,
  });
  if (error && (error as any).code === "23505") throw badRequest("That person is already in your team");
  if (error) throw error;
  await audit(ctx, req, "member", userId, "invited", { email: input.email, role: input.role });
  return json({ user_id: userId }, 201);
});

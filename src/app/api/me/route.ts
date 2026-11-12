import { route, json, must } from "@/lib/http";
import { requireUser } from "@/lib/auth";
import { adminDb } from "@/lib/supabase";

/** The signed-in user and the firms they belong to. */
export const GET = route(async (req) => {
  const ctx = await requireUser(req);
  const memberships = must(
    await ctx.db.from("firm_members").select("role, firm:firms(id, name, logo_path, brand_color)").eq("user_id", ctx.user.id),
  );
  // Whether the firm has been set up yet (setup happens once, by the first user).
  let setup_done = true;
  if (!(memberships ?? []).length) {
    const { count } = await adminDb().from("firms").select("id", { count: "exact", head: true });
    setup_done = (count ?? 0) > 0;
  }
  return json({
    setup_done,
    user: { id: ctx.user.id, email: ctx.user.email },
    firms: (memberships ?? []).map((m: any) => ({ ...m.firm, role: m.role })),
  });
});

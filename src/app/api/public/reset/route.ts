import { z } from "zod";
import { route, json, body } from "@/lib/http";
import { sendPasswordReset } from "@/lib/account-emails";

const schema = z.object({ email: z.string().trim().toLowerCase().email() });
const recent = new Map<string, number>();

/** Forgot password. Always answers the same way, so it cannot reveal who has an account. */
export const POST = route(async (req) => {
  const { email } = schema.parse(await body(req));
  const last = recent.get(email) ?? 0;
  if (Date.now() - last > 60_000) {
    recent.set(email, Date.now());
    await sendPasswordReset(email).catch((e) => console.error("[reset]", e?.message));
  }
  return json({ ok: true });
});

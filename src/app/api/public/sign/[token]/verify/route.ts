import { z } from "zod";
import { route, json, must, body, ApiError } from "@/lib/http";
import { adminDb } from "@/lib/supabase";
import { signerFromToken, logEvent } from "@/lib/signflow";
import { otpHash, safeEqual, newToken, sha256, OTP_MAX_ATTEMPTS, SESSION_TTL_MIN } from "@/lib/signing";

const schema = z.object({ code: z.string().trim().regex(/^\d{6}$/, "Enter the 6-digit code") });

/** Checks the code and starts a short signing session. */
export const POST = route<{ token: string }>(async (req, { token }) => {
  const { code } = schema.parse(await body(req));
  const { signer, request } = await signerFromToken(token, { requireOpen: true });
  const db = adminDb();
  if (!signer.otp_hash || !signer.otp_expires_at) throw new ApiError(400, "Request a code first", "no_code");
  if (new Date(signer.otp_expires_at) < new Date()) throw new ApiError(400, "This code has expired. Request a new one.", "expired_code");
  if (signer.otp_attempts >= OTP_MAX_ATTEMPTS) throw new ApiError(429, "Too many incorrect attempts. Request a new code.", "locked");

  if (!safeEqual(otpHash(signer.id, code), signer.otp_hash)) {
    must(await db.from("signers").update({ otp_attempts: signer.otp_attempts + 1 }).eq("id", signer.id));
    await logEvent({ request_id: request.id, firm_id: request.firm_id, signer_id: signer.id, event: "otp_failed", req });
    const left = OTP_MAX_ATTEMPTS - signer.otp_attempts - 1;
    throw new ApiError(400, left > 0 ? `That code is not correct. ${left} attempt${left === 1 ? "" : "s"} left.` : "Too many incorrect attempts. Request a new code.", "wrong_code");
  }
  const session = newToken(24);
  must(await db.from("signers").update({
    otp_hash: null, otp_expires_at: null, otp_attempts: 0, verified_at: new Date().toISOString(),
    session_hash: sha256(`session:${session}`), session_expires_at: new Date(Date.now() + SESSION_TTL_MIN * 60_000).toISOString(),
  }).eq("id", signer.id));
  await logEvent({ request_id: request.id, firm_id: request.firm_id, signer_id: signer.id, event: "otp_verified", req });
  return json({ session, expires_in_minutes: SESSION_TTL_MIN });
});

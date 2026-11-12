import { route, json, must, ApiError, badRequest } from "@/lib/http";
import { adminDb } from "@/lib/supabase";
import { signerFromToken, logEvent } from "@/lib/signflow";
import { newOtp, otpHash, OTP_TTL_MIN, OTP_RESEND_SECONDS, maskEmail } from "@/lib/signing";
import { sendEmail, layout, esc } from "@/lib/email";

/** Emails a one-time code to the signer. */
export const POST = route<{ token: string }>(async (req, { token }) => {
  const { signer, request } = await signerFromToken(token, { requireOpen: true });
  if (signer.status === "signed") throw badRequest("You have already signed this document");
  if (signer.status === "declined") throw badRequest("You declined this document");
  if (signer.otp_sent_at && Date.now() - new Date(signer.otp_sent_at).getTime() < OTP_RESEND_SECONDS * 1000) {
    throw new ApiError(429, "Please wait a minute before asking for another code", "too_soon");
  }
  const code = newOtp();
  must(await adminDb().from("signers").update({
    otp_hash: otpHash(signer.id, code), otp_expires_at: new Date(Date.now() + OTP_TTL_MIN * 60_000).toISOString(),
    otp_attempts: 0, otp_sent_at: new Date().toISOString(),
  }).eq("id", signer.id));
  const firmName = request.firm.legal_name || request.firm.name;
  const r = await sendEmail({
    to: signer.email, fromName: firmName,
    subject: `${code} is your signing code`,
    html: layout({
      firm: firmName,
      heading: "Your one-time signing code",
      body: `<p>Use this code to view and sign <strong>${esc(request.title)}</strong>:</p>
        <p style="font-size:30px;letter-spacing:8px;font-weight:700;margin:18px 0">${code}</p>
        <p style="color:#888;font-size:13px">The code expires in ${OTP_TTL_MIN} minutes. Never share it with anyone, including the firm.</p>`,
    }),
  });
  await logEvent({ request_id: request.id, firm_id: request.firm_id, signer_id: signer.id, event: "otp_sent", detail: `to ${maskEmail(signer.email)}`, req });
  if (!r.sent) throw new ApiError(503, "We could not send the code. Please try again later or contact the firm.", "email_failed");
  return json({ ok: true, sent_to: maskEmail(signer.email), expires_in_minutes: OTP_TTL_MIN });
});

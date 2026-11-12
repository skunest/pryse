import { z } from "zod";
import { route, json, must, body, badRequest } from "@/lib/http";
import { adminDb } from "@/lib/supabase";
import { signerFromToken, requireSession, logEvent } from "@/lib/signflow";
import { sendEmail, layout, esc } from "@/lib/email";

const schema = z.object({ reason: z.string().trim().min(3, "Tell the firm why you are declining").max(1000) });

export const POST = route<{ token: string }>(async (req, { token }) => {
  const { reason } = schema.parse(await body(req));
  const { signer, request } = await signerFromToken(token, { requireOpen: true });
  requireSession(req, signer);
  if (signer.status === "signed") throw badRequest("You have already signed this document");
  const db = adminDb();
  must(await db.from("signers").update({ status: "declined", decline_reason: reason, session_hash: null, session_expires_at: null }).eq("id", signer.id));
  must(await db.from("signing_requests").update({ status: "declined" }).eq("id", request.id).eq("status", "sent"));
  await logEvent({ request_id: request.id, firm_id: request.firm_id, signer_id: signer.id, event: "declined", detail: reason, req });
  if (request.firm.email) {
    await sendEmail({
      to: request.firm.email,
      subject: `Declined: ${request.title}`,
      html: layout({
        firm: request.firm.legal_name || request.firm.name,
        heading: "A signer declined to sign",
        body: `<p><strong>${esc(signer.name)}</strong> (${esc(signer.email)}) declined to sign <strong>${esc(request.title)}</strong>.</p><p><strong>Reason:</strong> ${esc(reason)}</p>`,
      }),
    });
  }
  return json({ ok: true });
});

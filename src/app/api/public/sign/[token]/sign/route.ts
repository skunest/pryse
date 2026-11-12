import { z } from "zod";
import { route, json, must, body, badRequest, clientIp, userAgent } from "@/lib/http";
import { adminDb } from "@/lib/supabase";
import { signerFromToken, requireSession, logEvent, finalizeIfComplete } from "@/lib/signflow";
import { upload } from "@/lib/storage";

const schema = z.object({
  signature_png: z.string().startsWith("data:image/png;base64,", "Draw or type your signature"),
  signed_name: z.string().trim().min(2, "Type your full name").max(120),
  consent: z.literal(true, { errorMap: () => ({ message: "Please confirm that you agree to sign electronically" }) }),
});

/** Applies the signer's signature. Seals the document when everyone has signed. */
export const POST = route<{ token: string }>(async (req, { token }) => {
  const input = schema.parse(await body(req));
  const { signer, request } = await signerFromToken(token, { requireOpen: true });
  requireSession(req, signer);
  if (signer.status === "signed") throw badRequest("You have already signed this document");
  if (signer.status === "declined") throw badRequest("You declined this document");
  if (!signer.viewed_at) throw badRequest("Open and review the document before signing");

  const png = Buffer.from(input.signature_png.split(",")[1] || "", "base64");
  if (png.length < 200 || png.length > 600_000 || png[0] !== 0x89 || png[1] !== 0x50) throw badRequest("The signature image is not valid. Please sign again.");

  const path = `${request.firm_id}/signing/${request.id}/signatures/${signer.id}.png`;
  await upload(path, png, "image/png");
  const updated = must(await adminDb().from("signers").update({
    status: "signed", signed_at: new Date().toISOString(), signature_path: path, signed_name: input.signed_name,
    ip: clientIp(req), user_agent: userAgent(req), session_hash: null, session_expires_at: null,
  }).eq("id", signer.id).neq("status", "signed").select("id")) as any[];
  if (!updated.length) throw badRequest("You have already signed this document");
  await logEvent({ request_id: request.id, firm_id: request.firm_id, signer_id: signer.id, event: "signed", detail: `as "${input.signed_name}"`, req });

  let completed = false;
  try { completed = await finalizeIfComplete(request.id, req); }
  catch { /* signature is saved; sealing can be retried by the firm */ }
  return json({ ok: true, completed });
});

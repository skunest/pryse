import { route, json, must } from "@/lib/http";
import { adminDb } from "@/lib/supabase";
import { signerFromToken, logEvent, shortRef } from "@/lib/signflow";
import { documentType, maskEmail } from "@/lib/signing";
import { signedUrl } from "@/lib/storage";

/** What the signer sees when they open their link (no document until verified). */
export const GET = route<{ token: string }>(async (req, { token }) => {
  const { signer, request } = await signerFromToken(token);
  const others = must(await adminDb().from("signers").select("name, status, sign_order").eq("request_id", request.id).order("sign_order")) as any[];
  if (request.status === "sent" && signer.status !== "signed") {
    await logEvent({ request_id: request.id, firm_id: request.firm_id, signer_id: signer.id, event: "opened", req });
  }
  const logo_url = request.firm.logo_path ? await signedUrl(request.firm.logo_path, 600).catch(() => null) : null;
  const verified = !!signer.session_expires_at && new Date(signer.session_expires_at) > new Date();
  return json({
    request: {
      reference: shortRef(request.id), title: request.title, message: request.message, status: request.status,
      document_type: documentType(request.document_type)?.label ?? request.document_type,
      page_count: request.page_count, expires_at: request.expires_at, completed_at: request.completed_at,
    },
    firm: { name: request.firm.legal_name || request.firm.name, email: request.firm.email, logo_url },
    signer: { name: signer.name, email: maskEmail(signer.email), status: signer.status, signed_at: signer.signed_at, session_active: verified },
    signers: others.map((o) => ({ name: o.name, status: o.status })),
  });
});

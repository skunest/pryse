import { route, json, must, badRequest } from "@/lib/http";
import { adminDb } from "@/lib/supabase";
import { signerFromToken, requireSession, logEvent } from "@/lib/signflow";
import { signedUrl } from "@/lib/storage";

/** Short-lived link to view the document, after the code is verified. */
export const GET = route<{ token: string }>(async (req, { token }) => {
  const { signer, request } = await signerFromToken(token);
  requireSession(req, signer);
  const path = request.status === "completed" && request.signed_path ? request.signed_path : request.original_path;
  if (!path) throw badRequest("The document is not available");
  if (!signer.viewed_at && request.status === "sent") {
    must(await adminDb().from("signers").update({ viewed_at: new Date().toISOString(), status: signer.status === "pending" ? "viewed" : signer.status }).eq("id", signer.id));
    await logEvent({ request_id: request.id, firm_id: request.firm_id, signer_id: signer.id, event: "viewed", req });
  }
  return json({ url: await signedUrl(path, 900), signed: path === request.signed_path });
});

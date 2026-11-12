import "server-only";
import { adminDb } from "./supabase";
import { ApiError, badRequest, must, notFound, clientIp, userAgent } from "./http";
import { newToken, sha256, safeEqual } from "./signing";
import { sendEmail, layout, esc } from "./email";
import { download, upload } from "./storage";
import { sealDocument } from "./pdf/seal";
import { fmtDate } from "./money";
import { siteUrl } from "./site";

export const SIGNER_COLS =
  "id, request_id, firm_id, sign_order, name, email, status, otp_sent_at, otp_expires_at, otp_attempts, verified_at, viewed_at, signed_at, signature_path, signed_name, ip, user_agent, decline_reason, created_at";

export function appUrl(_firm?: unknown) {
  return siteUrl();
}

export const shortRef = (id: string) => id.replace(/-/g, "").slice(0, 10).toUpperCase();

export async function logEvent(e: {
  request_id: string; firm_id: string; signer_id?: string | null; event: string; detail?: string | null; req?: Request;
}) {
  await adminDb().from("signing_events").insert({
    request_id: e.request_id, firm_id: e.firm_id, signer_id: e.signer_id ?? null, event: e.event, detail: e.detail ?? null,
    ip: e.req ? clientIp(e.req) : null, user_agent: e.req ? userAgent(e.req) : null,
  });
}

/** Creates a fresh link for each signer (old links stop working) and emails it. */
export async function emailSigningLinks(requestId: string, opts: { onlyPending?: boolean; event: "sent" | "reminder_sent"; req: Request }) {
  const db = adminDb();
  const reqRow = must(await db.from("signing_requests").select("*, firm:firms(name, legal_name, email, app_url)").eq("id", requestId).single()) as any;
  let q = db.from("signers").select(SIGNER_COLS).eq("request_id", requestId).order("sign_order");
  if (opts.onlyPending) q = q.in("status", ["pending", "viewed"]);
  const signers = must(await q) as any[];
  const firmName = reqRow.firm.legal_name || reqRow.firm.name;
  const results: { email: string; sent: boolean; error?: string }[] = [];
  for (const s of signers) {
    const token = newToken();
    must(await db.from("signers").update({ token_hash: sha256(token), session_hash: null, session_expires_at: null }).eq("id", s.id));
    const link = `${appUrl(reqRow.firm)}/sign/${token}`;
    const r = await sendEmail({
      to: s.email, replyTo: reqRow.firm.email, fromName: firmName,
      subject: `${opts.event === "reminder_sent" ? "Reminder: " : ""}Please sign: ${reqRow.title}`,
      html: layout({
        firm: firmName,
        heading: "A document is waiting for your signature",
        body: `<p>Dear ${esc(s.name)},</p>
          <p>${esc(firmName)} has sent you <strong>${esc(reqRow.title)}</strong> to sign electronically.</p>
          ${reqRow.message ? `<p style="background:#f6f6f6;padding:12px 14px;border-radius:6px">${esc(reqRow.message).replace(/\n/g, "<br>")}</p>` : ""}
          <p>For your security, we will send a one-time code to this email address before you can view and sign the document.</p>
          ${reqRow.expires_at ? `<p style="color:#888;font-size:13px">This link expires on ${esc(fmtDate(reqRow.expires_at))}.</p>` : ""}`,
        button: { label: "Review and sign", url: link },
        footer: `This link is personal to you. Do not forward this email. If you were not expecting it, contact ${esc(firmName)}${reqRow.firm.email ? ` at ${esc(reqRow.firm.email)}` : ""}.`,
      }),
    });
    results.push({ email: s.email, sent: r.sent, error: r.error });
    await logEvent({ request_id: requestId, firm_id: reqRow.firm_id, signer_id: s.id, event: opts.event, detail: `to ${s.email}${r.sent ? "" : " (email not delivered: " + (r.error || "error") + ")"}`, req: opts.req });
  }
  return results;
}

/** Looks up a signer from the link token and checks the request is still open. */
export async function signerFromToken(token: string, opts: { requireOpen?: boolean } = {}) {
  if (!token || token.length < 20) throw notFound("This signing link is not valid");
  const db = adminDb();
  const signer = must(await db.from("signers").select(`${SIGNER_COLS}, session_hash, session_expires_at, otp_hash`).eq("token_hash", sha256(token)).maybeSingle()) as any;
  if (!signer) throw notFound("This signing link is not valid or has been replaced by a newer one");
  const request = must(await db.from("signing_requests").select("*, firm:firms(id, name, legal_name, email, app_url, logo_path)").eq("id", signer.request_id).single()) as any;
  if (request.status === "sent" && request.expires_at && new Date(request.expires_at) < new Date()) {
    await db.from("signing_requests").update({ status: "expired" }).eq("id", request.id).eq("status", "sent");
    request.status = "expired";
  }
  if (opts.requireOpen) {
    if (request.status === "cancelled") throw new ApiError(410, "This signing request was cancelled by the firm", "cancelled");
    if (request.status === "expired") throw new ApiError(410, "This signing link has expired. Ask the firm to send a new one.", "expired");
    if (request.status === "declined") throw new ApiError(410, "This document was declined and can no longer be signed", "declined");
    if (request.status === "completed") throw new ApiError(410, "This document has already been signed by everyone", "completed");
    if (request.status !== "sent") throw new ApiError(410, "This document is not open for signing", "closed");
  }
  return { signer, request };
}

export function requireSession(req: Request, signer: any) {
  const session = req.headers.get("x-sign-session") || "";
  if (!session || !signer.session_hash || !signer.session_expires_at) throw new ApiError(401, "Please verify your email code first", "verify_required");
  if (new Date(signer.session_expires_at) < new Date()) throw new ApiError(401, "Your session has expired. Please request a new code.", "verify_required");
  if (!safeEqual(sha256(`session:${session}`), signer.session_hash)) throw new ApiError(401, "Please verify your email code first", "verify_required");
}

/**
 * When every signer has signed: seal the document, store it, mark the request
 * completed and email everyone a copy. Safe to call more than once.
 */
export async function finalizeIfComplete(requestId: string, req: Request) {
  const db = adminDb();
  const signers = must(await db.from("signers").select(SIGNER_COLS).eq("request_id", requestId).order("sign_order")) as any[];
  if (!signers.length || signers.some((s) => s.status !== "signed")) return false;

  // Claim the job so only one request seals the document.
  const now = new Date().toISOString();
  const claimed = must(await db.from("signing_requests").update({ completed_at: now })
    .eq("id", requestId).eq("status", "sent").is("completed_at", null).select("*, firm:firms(id, name, legal_name, email, app_url)")) as any[];
  if (!claimed.length) return false;
  const r = claimed[0];
  try {
    const original = await download(r.original_path);
    if (sha256(original) !== r.original_sha256) throw new Error("Original document hash does not match");
    const sigs = await Promise.all(signers.map(async (s) => ({
      name: s.name, email: s.email, signed_name: s.signed_name, signed_at: s.signed_at, ip: s.ip, user_agent: s.user_agent,
      signature_png: await download(s.signature_path),
    })));
    await logEvent({ request_id: r.id, firm_id: r.firm_id, event: "completed", req });
    const events = must(await db.from("signing_events").select("created_at, event, detail, ip, signer_id").eq("request_id", r.id).order("created_at")) as any[];
    const byId = Object.fromEntries(signers.map((s) => [s.id, s.signed_name || s.name]));
    const firmName = r.firm.legal_name || r.firm.name;
    const sealed = await sealDocument({
      original, reference: shortRef(r.id), title: r.title, firmName, originalSha256: r.original_sha256,
      createdAt: r.created_at, completedAt: now, signers: sigs,
      events: events.map((e) => ({ created_at: e.created_at, event: e.event, detail: e.detail, ip: e.ip, who: e.signer_id ? byId[e.signer_id] : firmName })),
      verifyUrl: `${appUrl(r.firm)}/verify`,
    });
    const signedHash = sha256(sealed);
    const path = `${r.firm_id}/signing/${r.id}/signed.pdf`;
    await upload(path, sealed, "application/pdf");
    must(await db.from("signing_requests").update({ status: "completed", signed_path: path, signed_sha256: signedHash }).eq("id", r.id));

    const recipients = [...new Set([...signers.map((s) => s.email), ...(r.firm.email ? [r.firm.email] : [])])];
    const filename = `${r.title.replace(/[^\w\- ]+/g, "").trim() || "document"} (signed).pdf`;
    await sendEmail({
      to: recipients, replyTo: r.firm.email, fromName: firmName,
      subject: `Signed: ${r.title}`,
      html: layout({
        firm: firmName,
        heading: "Everyone has signed",
        body: `<p>All parties have signed <strong>${esc(r.title)}</strong>. The signed copy is attached, with a certificate of completion.</p>
          <p style="font-size:13px;color:#666">Reference: ${esc(shortRef(r.id))}<br>Signed file SHA-256: <span style="font-family:monospace;word-break:break-all">${esc(signedHash)}</span></p>`,
        footer: "Keep this email and the attached file for your records.",
      }),
      attachments: [{ filename, content: sealed }],
    });
    return true;
  } catch (e) {
    console.error("[signing] finalize failed", e);
    await db.from("signing_requests").update({ completed_at: null }).eq("id", r.id).eq("status", "sent");
    throw e;
  }
}

export async function requireRequest(db: any, firmId: string, id: string) {
  const r = must(await db.from("signing_requests").select("*, client:clients(id, name), matter:matters(id, file_number, title)").eq("firm_id", firmId).eq("id", id).maybeSingle()) as any;
  if (!r) throw notFound("Signing request not found");
  return r;
}

export const assertDraftOrSent = (r: any) => {
  if (!["draft", "sent"].includes(r.status)) throw badRequest(`This request is ${r.status} and can no longer be changed`);
};

import { z } from "zod";
import { PDFDocument } from "pdf-lib";
import { route, json, must, badRequest } from "@/lib/http";
import { requireFirm } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { documentType, sha256 } from "@/lib/signing";
import { upload } from "@/lib/storage";
import { emailSigningLinks, logEvent, SIGNER_COLS } from "@/lib/signflow";
import { blockDuplicate, findEarlierSends } from "@/lib/duplicates";

const MAX_BYTES = 15 * 1024 * 1024;

const meta = z.object({
  title: z.string().trim().min(2, "Give the document a title").max(200),
  document_type: z.string(),
  client_id: z.string().uuid().nullable().optional(),
  matter_id: z.string().uuid().nullable().optional(),
  message: z.string().trim().max(2000).nullable().optional(),
  expires_days: z.coerce.number().int().min(1).max(90).default(14),
  signers: z.array(z.object({
    name: z.string().trim().min(2, "Each signer needs a name").max(120),
    email: z.string().trim().toLowerCase().email("Each signer needs a valid email"),
  })).min(1, "Add at least one signer").max(10),
  send: z.coerce.boolean().default(false),
  allow_duplicate: z.coerce.boolean().default(false),
});

export const GET = route(async (req) => {
  const ctx = await requireFirm(req);
  const sp = new URL(req.url).searchParams;
  const status = sp.get("status");
  // Earlier sends of the same PDF (fingerprint) or the same title for a client, to warn before sending twice.
  if (sp.get("sha256") || sp.get("title")) {
    const earlier = await findEarlierSends(ctx.db, ctx.firmId, { sha256: sp.get("sha256") || "", title: sp.get("title") || "", clientId: sp.get("client_id") });
    return json({ earlier });
  }
  let q = ctx.db.from("signing_requests")
    .select(`id, title, document_type, status, created_at, sent_at, completed_at, expires_at, client:clients(id, name), matter:matters(id, file_number), signers(${"id, name, email, status, signed_at"})`)
    .eq("firm_id", ctx.firmId).order("created_at", { ascending: false }).limit(500);
  if (status) q = q.eq("status", status);
  return json({ requests: must(await q) });
});

/** Create a signing request from an uploaded PDF (multipart form). */
export const POST = route(async (req) => {
  const ctx = await requireFirm(req);
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) throw badRequest("Upload the PDF to be signed");
  if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) throw badRequest("Only PDF documents can be sent for signature");
  if (file.size > MAX_BYTES) throw badRequest("The PDF must be smaller than 15 MB");

  let signersRaw: unknown = [];
  try { signersRaw = JSON.parse(String(form.get("signers") || "[]")); } catch { throw badRequest("Signers are not valid"); }
  const input = meta.parse({
    title: form.get("title"), document_type: form.get("document_type"),
    client_id: form.get("client_id") || null, matter_id: form.get("matter_id") || null,
    message: form.get("message") || null, expires_days: form.get("expires_days") || 14,
    signers: signersRaw, send: form.get("send") === "true", allow_duplicate: form.get("allow_duplicate") === "true",
  });

  const type = documentType(input.document_type);
  if (!type) throw badRequest("Choose the type of document");
  if (!type.allowed) throw badRequest(type.note || "This type of document cannot be signed electronically");
  const emails = input.signers.map((s) => s.email);
  if (new Set(emails).size !== emails.length) throw badRequest("Each signer must have a different email address");

  const bytes = new Uint8Array(await file.arrayBuffer());
  let pages = 0;
  try {
    const pdf = await PDFDocument.load(bytes, { ignoreEncryption: false });
    pages = pdf.getPageCount();
  } catch (e: any) {
    if (/encrypt/i.test(String(e?.message))) throw badRequest("This PDF is password protected. Remove the password and upload it again.");
    throw badRequest("This file could not be read as a PDF");
  }

  const fingerprint = sha256(bytes);
  if (input.send) {
    blockDuplicate(await findEarlierSends(ctx.db, ctx.firmId, { sha256: fingerprint, title: input.title, clientId: input.client_id ?? null }), input.allow_duplicate);
  }

  const expires = new Date(Date.now() + input.expires_days * 86400_000).toISOString();
  const request = must(await ctx.db.from("signing_requests").insert({
    firm_id: ctx.firmId, client_id: input.client_id ?? null, matter_id: input.matter_id ?? null,
    title: input.title, document_type: type.value, message: input.message ?? null,
    original_name: file.name.slice(0, 200), original_sha256: fingerprint, page_count: pages,
    expires_at: expires, created_by: ctx.user.id,
  }).select("*").single()) as any;

  const path = `${ctx.firmId}/signing/${request.id}/original.pdf`;
  await upload(path, bytes, "application/pdf");
  must(await ctx.db.from("signing_requests").update({ original_path: path }).eq("id", request.id));
  must(await ctx.db.from("signers").insert(input.signers.map((s, i) => ({
    request_id: request.id, firm_id: ctx.firmId, sign_order: i + 1, name: s.name, email: s.email,
  }))));
  await logEvent({ request_id: request.id, firm_id: ctx.firmId, event: "created", detail: `by ${ctx.user.email}`, req });
  await audit(ctx, req, "signing_request", request.id, "created", { title: input.title, signers: emails });

  let delivery: unknown = null;
  if (input.send) {
    must(await ctx.db.from("signing_requests").update({ status: "sent", sent_at: new Date().toISOString() }).eq("id", request.id));
    delivery = await emailSigningLinks(request.id, { event: "sent", req });
    await audit(ctx, req, "signing_request", request.id, "sent");
  }
  const signers = must(await ctx.db.from("signers").select(SIGNER_COLS).eq("request_id", request.id).order("sign_order"));
  return json({ request: { ...request, original_path: path, status: input.send ? "sent" : "draft" }, signers, delivery }, 201);
});

import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { safe, wrap, GREY, LIGHT, LINE, BG, INK, mm } from "./text";
import { fmtDateTime } from "../money";
import { markTestPage, testSubject } from "./testmark";

export type SealSigner = {
  name: string; email: string; signed_name: string | null; signed_at: string;
  ip: string | null; user_agent: string | null; signature_png: Uint8Array;
};
export type SealEvent = { created_at: string; event: string; detail: string | null; ip: string | null; who: string | null };

const LABELS: Record<string, string> = {
  created: "Request created",
  sent: "Sent for signature",
  reminder_sent: "Reminder sent",
  opened: "Signing link opened",
  otp_sent: "Verification code sent",
  otp_verified: "Identity verified by email code",
  otp_failed: "Incorrect verification code",
  viewed: "Document viewed",
  signed: "Document signed",
  declined: "Signing declined",
  completed: "All parties signed. Document sealed",
  cancelled: "Request cancelled",
};

/**
 * Produces the final signed document:
 *  1. the original pages, each stamped with the reference in the bottom margin,
 *  2. a signature page with every signer's signature,
 *  3. a certificate of completion with the evidence trail and original hash.
 * The SHA-256 of the returned file is stored as the signed hash.
 */
export async function sealDocument(opts: {
  original: Uint8Array;
  reference: string;
  title: string;
  firmName: string;
  originalSha256: string;
  createdAt: string;
  completedAt: string;
  signers: SealSigner[];
  events: SealEvent[];
  verifyUrl?: string | null;
}): Promise<Uint8Array> {
  const src = await PDFDocument.load(opts.original, { ignoreEncryption: false, updateMetadata: false });
  const out = await PDFDocument.create();
  out.setTitle(safe(`${opts.title} (signed)`));
  out.setAuthor(safe(opts.firmName));
  out.setProducer("Pryse e-signature");
  out.setCreator("Pryse");
  out.setSubject(`Ref ${opts.reference}. Original SHA-256 ${opts.originalSha256}` + testSubject());

  const R_ = await out.embedFont(StandardFonts.Helvetica);
  const B_ = await out.embedFont(StandardFonts.HelveticaBold);

  // 1. Original pages with a reference stamp.
  const copied = await out.copyPages(src, src.getPageIndices());
  const total = copied.length;
  copied.forEach((p, i) => {
    out.addPage(p);
    const { width } = p.getSize();
    const label = safe(`Electronically signed through Pryse  |  Ref ${opts.reference}  |  Page ${i + 1} of ${total}`);
    const size = 6;
    const w = R_.widthOfTextAtSize(label, size);
    p.drawRectangle({ x: (width - w) / 2 - 4, y: 4, width: w + 8, height: 10, color: rgb(1, 1, 1), opacity: 0.85 });
    p.drawText(label, { x: (width - w) / 2, y: 7, size, font: R_, color: GREY });
  });

  const W = 595.28, H = 841.89, L = mm(20), R = W - mm(20), CW = R - L;
  let page = out.addPage([W, H]);
  let y = H - mm(22);
  const t = (s: string, x: number, yy: number, size = 9, font = R_, color = INK) =>
    page.drawText(safe(s), { x, y: yy, size, font, color });

  const header = (heading: string) => {
    t(opts.firmName.toUpperCase(), L, y, 7.5, B_, LIGHT);
    y -= mm(10);
    t(heading, L, y, 18, B_);
    y -= mm(6);
    page.drawRectangle({ x: L, y, width: CW, height: 1.5, color: INK });
    y -= mm(9);
    const meta: [string, string][] = [
      ["Document", opts.title],
      ["Reference", opts.reference],
      ["Original document SHA-256", opts.originalSha256],
    ];
    for (const [k, v] of meta) {
      t(k.toUpperCase(), L, y, 6.5, B_, LIGHT);
      const ls = wrap(v, R_, 8.5, CW - mm(55));
      ls.forEach((ln, i) => t(ln, L + mm(55), y - i * 11, 8.5, k === "Document" ? B_ : R_));
      y -= 13 + (ls.length - 1) * 11;
    }
    y -= mm(6);
  };

  // 2. Signature page(s)
  header("Signature Page");
  for (const s of opts.signers) {
    const boxH = mm(46);
    if (y - boxH < mm(25)) { page = out.addPage([W, H]); y = H - mm(22); header("Signature Page (continued)"); }
    page.drawRectangle({ x: L, y: y - boxH, width: CW, height: boxH, borderColor: LINE, borderWidth: 0.8, color: rgb(1, 1, 1) });
    // signature image
    try {
      const img = await out.embedPng(s.signature_png);
      const maxW = CW * 0.45, maxH = mm(24);
      const sc = Math.min(maxW / img.width, maxH / img.height);
      page.drawImage(img, { x: L + mm(6), y: y - mm(6) - img.height * sc, width: img.width * sc, height: img.height * sc });
    } catch { /* signature image missing: details still printed */ }
    page.drawLine({ start: { x: L + mm(6), y: y - mm(32) }, end: { x: L + CW * 0.5, y: y - mm(32) }, thickness: 0.6, color: GREY });
    t(s.signed_name || s.name, L + mm(6), y - mm(37), 9.5, B_);
    t(s.email, L + mm(6), y - mm(42), 8, R_, GREY);
    const rx = L + CW * 0.56;
    const rows: [string, string][] = [
      ["Signed", fmtDateTime(s.signed_at)],
      ["IP address", s.ip || "Not recorded"],
      ["Verified by", "One-time code sent to email"],
    ];
    let ry = y - mm(9);
    for (const [k, v] of rows) {
      t(k.toUpperCase(), rx, ry, 6.3, B_, LIGHT);
      ry -= 10;
      for (const ln of wrap(v, R_, 8.2, R - rx - mm(5))) { t(ln, rx, ry, 8.2); ry -= 10; }
      ry -= 4;
    }
    y -= boxH + mm(6);
  }

  // 3. Certificate of completion
  page = out.addPage([W, H]);
  y = H - mm(22);
  header("Certificate of Completion");
  const facts: [string, string][] = [
    ["Created", fmtDateTime(opts.createdAt)],
    ["Completed", fmtDateTime(opts.completedAt)],
    ["Signers", opts.signers.map((s) => `${s.signed_name || s.name} (${s.email})`).join("; ")],
    ["Original pages", String(total)],
  ];
  for (const [k, v] of facts) {
    t(k.toUpperCase(), L, y, 6.5, B_, LIGHT);
    const ls = wrap(v, R_, 8.5, CW - mm(55));
    ls.forEach((ln, i) => t(ln, L + mm(55), y - i * 11, 8.5));
    y -= 13 + (ls.length - 1) * 11;
  }
  y -= mm(6);
  t("EVIDENCE TRAIL", L, y, 7, B_, GREY);
  y -= mm(4);
  const cx = [L + 6, L + CW * 0.27, L + CW * 0.62, L + CW * 0.83];
  const thead = () => {
    page.drawRectangle({ x: L, y: y - 16, width: CW, height: 16, color: BG });
    ["TIME", "EVENT", "BY", "IP"].forEach((h, i) => t(h, cx[i], y - 11, 6.3, B_, GREY));
    y -= 16;
  };
  thead();
  for (const e of opts.events) {
    const ev = LABELS[e.event] || e.event;
    const cells = [
      wrap(fmtDateTime(e.created_at), R_, 7.4, CW * 0.26 - 8),
      wrap(e.detail ? `${ev}. ${e.detail}` : ev, R_, 7.4, CW * 0.34 - 8),
      wrap(e.who || "", R_, 7.4, CW * 0.2 - 8),
      wrap(e.ip || "", R_, 7.4, CW * 0.17 - 8),
    ];
    const n = Math.max(...cells.map((c) => c.length));
    const rh = n * 9 + 8;
    if (y - rh < mm(30)) { page = out.addPage([W, H]); y = H - mm(22); thead(); }
    cells.forEach((c, i) => c.forEach((ln, k) => t(ln, cx[i], y - 11 - k * 9, 7.4, R_, i === 1 ? INK : GREY)));
    y -= rh;
    page.drawLine({ start: { x: L, y }, end: { x: R, y }, thickness: 0.4, color: LINE });
  }
  y -= mm(8);
  const statement =
    "This document was signed electronically through Pryse. Each signer opened a personal link sent to their email address and confirmed their identity with a one-time code sent to that address before signing. " +
    "The SHA-256 fingerprint above identifies the original document exactly. The fingerprint of this signed file is recorded by the issuing firm" +
    (opts.verifyUrl ? ` and can be checked at ${opts.verifyUrl}` : "") +
    ". Any change to this file after signing will change its fingerprint.";
  const ls = wrap(statement, R_, 7.8, CW);
  if (y - ls.length * 10 < mm(20)) { page = out.addPage([W, H]); y = H - mm(22); }
  for (const ln of ls) { t(ln, L, y, 7.8, R_, GREY); y -= 10; }

  out.getPages().slice(total).forEach((p, i, arr) => {
    const s = `Ref ${opts.reference}  |  Pryse e-signature  |  ${i + 1} of ${arr.length}`;
    p.drawText(safe(s), { x: L, y: mm(12), size: 6.5, font: R_, color: LIGHT });
  });

  out.getPages().forEach((p) => markTestPage(p, B_, R_));
  return out.save();
}

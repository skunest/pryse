import { PDFDocument, StandardFonts, degrees, rgb, PDFImage } from "pdf-lib";
import { safe, wrap, hex, GREY, LIGHT, LINE, BG, INK, mm } from "./text";
import { rand, fmtDate } from "../money";
import { markTestPage, testSubject } from "./testmark";

export type FirmInfo = {
  name: string; legal_name?: string | null; registration_number?: string | null;
  vat_registered?: boolean | null; vat_number?: string | null;
  email?: string | null; phone?: string | null; address?: string | null;
  bank_name?: string | null; bank_account_name?: string | null; bank_account_number?: string | null; bank_branch_code?: string | null;
  invoice_footer?: string | null; brand_color?: string | null;
};
export type ClientInfo = {
  name: string; id_or_reg_number?: string | null; vat_number?: string | null;
  email?: string | null; phone?: string | null; address?: string | null;
};
export type InvoiceLine = {
  description: string; kind: string; quantity: number | string; unit_price_cents: number; vat_rate: number | string;
  amount_cents: number; vat_cents: number;
};
export type InvoiceData = {
  number: string | null; status: string; issue_date: string | null; due_date: string | null;
  reference?: string | null; notes?: string | null;
  subtotal_cents: number; vat_cents: number; total_cents: number; paid_cents: number;
  matter?: { file_number: string | null; title: string } | null;
};

const W = 595.28, H = 841.89;
const L = mm(18), R = W - mm(18), CW = R - L;

export async function renderInvoicePdf(opts: {
  invoice: InvoiceData; lines: InvoiceLine[]; firm: FirmInfo; client: ClientInfo; logo?: Uint8Array | null; logoType?: string | null;
}): Promise<Uint8Array> {
  const { invoice, lines, firm, client } = opts;
  const doc = await PDFDocument.create();
  const isTax = firm.vat_registered !== false;
  const title = invoice.status === "draft" ? "DRAFT INVOICE" : isTax ? "TAX INVOICE" : "INVOICE";
  doc.setTitle(`${title} ${invoice.number ?? ""}`.trim() + testSubject());
  doc.setAuthor(safe(firm.name));
  doc.setProducer("Pryse");
  doc.setCreator("Pryse");

  const R_ = await doc.embedFont(StandardFonts.Helvetica);
  const B_ = await doc.embedFont(StandardFonts.HelveticaBold);
  const accent = hex(firm.brand_color);

  let logo: PDFImage | null = null;
  if (opts.logo && opts.logo.length) {
    try {
      logo = opts.logoType?.includes("png") || isPng(opts.logo) ? await doc.embedPng(opts.logo) : await doc.embedJpg(opts.logo);
    } catch { logo = null; }
  }

  let page = doc.addPage([W, H]);
  let y = H - mm(18);

  const text = (s: string, x: number, yy: number, size = 9, font = R_, color = INK) =>
    page.drawText(safe(s), { x, y: yy, size, font, color });
  const rtext = (s: string, x: number, yy: number, size = 9, font = R_, color = INK) =>
    page.drawText(safe(s), { x: x - font.widthOfTextAtSize(safe(s), size), y: yy, size, font, color });

  // ---- Header: logo or firm name (left), firm details (right)
  const headerTop = y;
  if (logo) {
    const maxW = mm(60), maxH = mm(22);
    const s = Math.min(maxW / logo.width, maxH / logo.height);
    page.drawImage(logo, { x: L, y: headerTop - logo.height * s, width: logo.width * s, height: logo.height * s });
  } else {
    const nameLines = wrap(firm.legal_name || firm.name, B_, 15, mm(90));
    let ny = headerTop - 14;
    for (const ln of nameLines) { text(ln, L, ny, 15, B_); ny -= 18; }
  }
  const details = [
    firm.legal_name && firm.legal_name !== firm.name ? firm.legal_name : firm.name,
    ...(firm.address ? safe(firm.address).split(/\r?\n/) : []),
    firm.phone ? `Tel: ${firm.phone}` : "",
    firm.email || "",
    firm.registration_number ? `Reg No: ${firm.registration_number}` : "",
    isTax && firm.vat_number ? `VAT No: ${firm.vat_number}` : "",
  ].filter(Boolean);
  let dy = headerTop - 8;
  details.forEach((d, i) => { rtext(d, R, dy, 8.2, i === 0 ? B_ : R_, i === 0 ? INK : GREY); dy -= 11; });

  y = Math.min(dy, headerTop - mm(26)) - mm(8);
  page.drawRectangle({ x: L, y, width: CW, height: 2, color: accent });
  y -= mm(12);

  // ---- Title and meta
  text(title, L, y, 20, B_, invoice.status === "draft" ? LIGHT : INK);
  const meta: [string, string][] = [
    ["Invoice number", invoice.number ?? "Assigned when issued"],
    ["Date", fmtDate(invoice.issue_date) || "Not issued"],
    ["Due date", fmtDate(invoice.due_date) || ""],
  ];
  if (invoice.matter) meta.push(["Matter", [invoice.matter.file_number, invoice.matter.title].filter(Boolean).join("  ")]);
  if (invoice.reference) meta.push(["Your reference", invoice.reference]);
  let my = y + 4;
  for (const [k, v] of meta) {
    rtext(k.toUpperCase(), R - mm(62), my, 6.8, B_, LIGHT);
    const vs = wrap(v, R_, 8.6, mm(60));
    vs.forEach((ln, i) => rtext(ln, R, my - i * 11, 8.6, i === 0 ? B_ : R_));
    my -= 13 + (vs.length - 1) * 11;
  }

  // ---- Bill to
  let by = y - mm(14);
  text("BILL TO", L, by, 6.8, B_, LIGHT);
  by -= 13;
  text(client.name, L, by, 10, B_);
  by -= 12;
  const cl = [
    ...(client.address ? safe(client.address).split(/\r?\n/) : []),
    client.id_or_reg_number ? `ID / Reg No: ${client.id_or_reg_number}` : "",
    client.vat_number ? `VAT No: ${client.vat_number}` : "",
    client.email || "",
  ].filter(Boolean);
  for (const c of cl) { for (const ln of wrap(c, R_, 8.6, mm(85))) { text(ln, L, by, 8.6, R_, GREY); by -= 11; } }

  y = Math.min(by, my) - mm(10);

  // ---- Lines table
  const cols = [
    { label: "DESCRIPTION", x: L + 8, w: CW * 0.5 - 8, align: "left" as const },
    { label: "QTY", x: L + CW * 0.56, w: CW * 0.08, align: "right" as const },
    { label: "UNIT PRICE", x: L + CW * 0.72, w: CW * 0.14, align: "right" as const },
    { label: "VAT", x: L + CW * 0.81, w: CW * 0.08, align: "right" as const },
    { label: "AMOUNT", x: R - 8, w: CW * 0.16, align: "right" as const },
  ];
  const head = () => {
    page.drawRectangle({ x: L, y: y - 20, width: CW, height: 20, color: BG });
    for (const c of cols) {
      if (c.align === "left") text(c.label, c.x, y - 13, 6.8, B_, GREY);
      else rtext(c.label, c.x, y - 13, 6.8, B_, GREY);
    }
    y -= 20;
  };
  const newPage = () => {
    page = doc.addPage([W, H]);
    y = H - mm(20);
    text(`${title} ${invoice.number ?? ""} (continued)`, L, y, 9, B_, GREY);
    y -= mm(8);
    head();
  };
  head();

  const sorted = [...lines];
  for (const ln of sorted) {
    const desc = wrap(ln.description + (ln.kind === "disbursement" ? "  (disbursement)" : ""), R_, 8.8, cols[0].w);
    const rh = desc.length * 11 + 10;
    if (y - rh < mm(60)) newPage();
    let ty = y - 14;
    desc.forEach((d, i) => text(d, cols[0].x, ty - i * 11, 8.8));
    rtext(trimQty(ln.quantity), cols[1].x, ty, 8.8);
    rtext(rand(ln.unit_price_cents), cols[2].x, ty, 8.8);
    rtext(isTax ? `${trimQty(ln.vat_rate)}%` : "-", cols[3].x, ty, 8.8, R_, GREY);
    rtext(rand(ln.amount_cents), cols[4].x, ty, 8.8, B_);
    y -= rh;
    page.drawLine({ start: { x: L, y }, end: { x: R, y }, thickness: 0.5, color: LINE });
  }

  // ---- Totals
  if (y < mm(95)) { page = doc.addPage([W, H]); y = H - mm(24); }
  y -= mm(6);
  const tx = R - mm(70);
  const totalRow = (k: string, v: string, bold = false, size = 9) => {
    text(k, tx, y, size, bold ? B_ : R_, bold ? INK : GREY);
    rtext(v, R - 8, y, size, bold ? B_ : R_);
    y -= size + 7;
  };
  totalRow(isTax ? "Subtotal (excl. VAT)" : "Subtotal", rand(invoice.subtotal_cents));
  if (isTax) totalRow("VAT", rand(invoice.vat_cents));
  page.drawRectangle({ x: tx - 8, y: y - 6, width: R - tx + 8, height: 22, color: BG });
  y += 2;
  totalRow("TOTAL", rand(invoice.total_cents), true, 11);
  y -= 4;
  if (invoice.paid_cents > 0) {
    totalRow("Paid", rand(invoice.paid_cents));
    totalRow("Balance due", rand(invoice.total_cents - invoice.paid_cents), true, 9.5);
  }
  const afterTotals = y;

  // ---- Bank details and notes (left of totals area / below)
  y = afterTotals - mm(8);
  const blocks: [string, string[]][] = [];
  if (firm.bank_name || firm.bank_account_number) {
    blocks.push(["PAYMENT DETAILS", [
      firm.bank_account_name ? `Account name: ${firm.bank_account_name}` : "",
      firm.bank_name ? `Bank: ${firm.bank_name}` : "",
      firm.bank_account_number ? `Account number: ${firm.bank_account_number}` : "",
      firm.bank_branch_code ? `Branch code: ${firm.bank_branch_code}` : "",
      invoice.number ? `Reference: ${invoice.number}` : "",
    ].filter(Boolean)]);
  }
  if (invoice.notes) blocks.push(["NOTES", [invoice.notes]]);
  for (const [k, vals] of blocks) {
    const linesOut = vals.flatMap((v) => wrap(v, R_, 8.6, CW));
    if (y - (linesOut.length * 11 + 20) < mm(28)) { page = doc.addPage([W, H]); y = H - mm(24); }
    text(k, L, y, 6.8, B_, LIGHT);
    y -= 13;
    for (const ln of linesOut) { text(ln, L, y, 8.6, R_, GREY); y -= 11; }
    y -= mm(5);
  }

  // ---- Footer and status stamp on every page
  const pages = doc.getPages();
  pages.forEach((p, i) => {
    p.drawLine({ start: { x: L, y: mm(16) }, end: { x: R, y: mm(16) }, thickness: 0.5, color: LINE });
    const foot = safe(firm.invoice_footer || `${firm.legal_name || firm.name}`);
    p.drawText(foot.slice(0, 140), { x: L, y: mm(11), size: 7, font: R_, color: LIGHT });
    const pg = `Page ${i + 1} of ${pages.length}`;
    p.drawText(pg, { x: R - R_.widthOfTextAtSize(pg, 7), y: mm(11), size: 7, font: R_, color: LIGHT });
    const stamp = invoice.status === "void" ? "VOID" : invoice.status === "paid" ? "PAID" : invoice.status === "draft" ? "DRAFT" : null;
    if (stamp) {
      const size = 90;
      const sw = B_.widthOfTextAtSize(stamp, size);
      const col = stamp === "PAID" ? rgb(0.18, 0.55, 0.3) : stamp === "VOID" ? rgb(0.75, 0.2, 0.2) : rgb(0.5, 0.5, 0.5);
      p.drawText(stamp, { x: W / 2 - sw * 0.35, y: H / 2 - sw * 0.35, size, font: B_, color: col, opacity: 0.1, rotate: degrees(45) });
    }
    markTestPage(p, B_, R_);
  });

  return doc.save();
}

function trimQty(q: number | string) {
  const n = Number(q);
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0$/, "");
}

function isPng(b: Uint8Array) {
  return b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47;
}

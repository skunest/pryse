import "server-only";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { must, notFound } from "./http";
import { renderInvoicePdf } from "./pdf/invoice";
import { download } from "./storage";

export const lineSchema = z.object({
  kind: z.enum(["fee", "disbursement"]).default("fee"),
  description: z.string().trim().min(1, "Each line needs a description").max(1000),
  quantity: z.coerce.number().positive().max(100000).default(1),
  unit_price_cents: z.coerce.number().int().min(0).max(10_000_000_000),
  vat_rate: z.coerce.number().min(0).max(100).optional(),
});
export type LineInput = z.infer<typeof lineSchema>;

export const INVOICE_SELECT =
  "*, client:clients(id, name, email, vat_number, address, id_or_reg_number, phone), matter:matters(id, file_number, title)";

export async function loadInvoice(db: SupabaseClient, firmId: string, id: string) {
  const invoice = must(await db.from("invoices").select(INVOICE_SELECT).eq("firm_id", firmId).eq("id", id).maybeSingle()) as any;
  if (!invoice) throw notFound("Invoice not found");
  const [lines, payments] = await Promise.all([
    db.from("invoice_lines").select("*").eq("invoice_id", id).order("position"),
    db.from("payments").select("*").eq("invoice_id", id).order("paid_on"),
  ]);
  return { invoice, lines: must(lines) as any[], payments: must(payments) as any[] };
}

export async function writeLines(db: SupabaseClient, firmId: string, invoiceId: string, lines: LineInput[], firm: { vat_registered: boolean; default_vat_rate: number }) {
  const existing = must(await db.from("invoice_lines").select("id").eq("invoice_id", invoiceId)) as { id: string }[];
  if (lines.length) {
    must(await db.from("invoice_lines").insert(lines.map((l, i) => ({
      invoice_id: invoiceId, firm_id: firmId, position: i, kind: l.kind, description: l.description,
      quantity: l.quantity, unit_price_cents: l.unit_price_cents,
      vat_rate: firm.vat_registered ? (l.vat_rate ?? Number(firm.default_vat_rate)) : 0,
    }))));
  }
  if (existing.length) must(await db.from("invoice_lines").delete().in("id", existing.map((e) => e.id)));
}

/** Builds the PDF. Issued invoices use the details frozen at issue. */
export async function invoicePdf(db: SupabaseClient, firmId: string, id: string) {
  const { invoice, lines } = await loadInvoice(db, firmId, id);
  let firm = invoice.firm_snapshot;
  let client = invoice.client_snapshot;
  if (!firm) firm = must(await db.from("firms").select("*").eq("id", firmId).single());
  if (!client) client = invoice.client;
  let logo: Uint8Array | null = null;
  if (firm.logo_path) { try { logo = await download(firm.logo_path); } catch { logo = null; } }
  const pdf = await renderInvoicePdf({
    invoice: { ...invoice, matter: invoice.matter },
    lines: lines.map((l) => ({ ...l, amount_cents: Number(l.amount_cents), vat_cents: Number(l.vat_cents), unit_price_cents: Number(l.unit_price_cents) })),
    firm, client, logo,
  });
  return { pdf, invoice, firm, client };
}

export function withOverdue<T extends { status: string; due_date: string | null }>(inv: T) {
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Johannesburg" });
  return { ...inv, overdue: ["issued", "partially_paid"].includes(inv.status) && !!inv.due_date && inv.due_date < today };
}

"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { api, openPdf, toCents, today } from "@/lib/browser";
import { rand, fmtDate, fmtDateTime } from "@/lib/money";
import { InvoiceEditor } from "@/components/InvoiceEditor";
import { useSession, canBill, canRecordPayments } from "@/components/AppShell";
import { TestBadge } from "@/components/TestBadge";
import { Badge, Button, Card, ErrorBox, Field, Input, Loading, Modal, Notice, PageHeader, Select, Textarea, useToast } from "@/components/ui";

const METHOD: Record<string, string> = { eft: "EFT", cash: "Cash", card: "Card", trust_transfer: "Transfer from trust", other: "Other" };

export default function InvoicePage() {
  const { id } = useParams<{ id: string }>();
  const { firm } = useSession();
  const toast = useToast();
  const [d, setD] = useState<any>(null);
  const [error, setError] = useState("");
  const [modal, setModal] = useState<"" | "pay" | "email" | "void">("");

  const load = useCallback(() => api(`/invoices/${id}`).then(setD).catch((e) => setError(e.message)), [id]);
  useEffect(() => { load(); }, [load]);

  if (error) return <ErrorBox message={error} />;
  if (!d) return <Loading />;
  const inv = d.invoice;

  if (inv.status === "draft") {
    return (
      <>
        <PageHeader back={{ href: "/invoices", label: "Invoices" }} title="Draft invoice" sub={<Badge status="draft" />} />
        {canBill(firm.role)
          ? <InvoiceEditor key={inv.updated_at} invoice={inv} lines={d.lines} onIssued={load} />
          : <Notice>Only fee earners, bookkeepers and administrators can edit invoices.</Notice>}
      </>
    );
  }

  const firmSnap = inv.firm_snapshot || {};
  const clientSnap = inv.client_snapshot || inv.client || {};
  const isTax = firmSnap.vat_registered !== false;
  const balance = inv.total_cents - inv.paid_cents;
  const open = ["issued", "partially_paid"].includes(inv.status);

  return (
    <>
      <PageHeader back={{ href: "/invoices", label: "Invoices" }}
        title={<span className="num">{inv.number}</span>}
        sub={<span className="flex flex-wrap items-center gap-2"><Badge status={inv.status} overdue={inv.overdue} /> {clientSnap.name}{inv.status !== "void" && (inv.emailed_at
          ? <span className="rounded-full bg-ok-soft px-2.5 py-0.5 text-[12px] font-medium text-ok">✓ Sent to {inv.last_emailed_to || "client"} on {fmtDate(inv.emailed_at)}{inv.email_count > 1 ? ` (${inv.email_count} times)` : ""}</span>
          : <span className="rounded-full bg-warn-soft px-2.5 py-0.5 text-[12px] font-medium text-warn">Not sent to the client yet</span>)}</span>}
        actions={<>
          <Button variant="secondary" onClick={() => openPdf(`/invoices/${id}/pdf`).catch((e) => toast(e.message, "bad"))}>View PDF</Button>
          <Button variant="secondary" onClick={() => openPdf(`/invoices/${id}/pdf`, true, `${inv.number}.pdf`).catch((e) => toast(e.message, "bad"))}>Download</Button>
          {inv.status !== "void" && canBill(firm.role) && <Button variant={inv.emailed_at ? "secondary" : "primary"} onClick={() => setModal("email")}>{inv.emailed_at ? "Email again" : "Email to client"}</Button>}
          {open && canRecordPayments(firm.role) && <Button onClick={() => setModal("pay")}>Record payment</Button>}
        </>} />

      {inv.status === "void" && <div className="mb-6"><Notice tone="bad">Voided on {fmtDate(inv.voided_at)}. Reason: {inv.void_reason}. The number {inv.number} is kept and will not be reused.</Notice></div>}

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        {/* Paper view */}
        <div className="rounded-xl border border-line bg-white p-6 sm:p-10">
          <div className="flex flex-wrap items-start justify-between gap-6">
            <div>
              <div className="flex items-center gap-2"><span className="text-[12px] font-semibold uppercase tracking-[.18em] text-brand-dark">{isTax ? "Tax invoice" : "Invoice"}</span><TestBadge /></div>
              <div className="num mt-1 text-2xl font-semibold">{inv.number}</div>
            </div>
            <div className="text-right text-[13px] leading-relaxed text-muted">
              <div className="font-semibold text-ink">{firmSnap.legal_name || firmSnap.name}</div>
              {firmSnap.address && <div className="whitespace-pre-line">{firmSnap.address}</div>}
              {isTax && firmSnap.vat_number && <div>VAT No: {firmSnap.vat_number}</div>}
            </div>
          </div>
          <div className="mt-8 grid gap-6 text-sm sm:grid-cols-2">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wider text-faint">Bill to</div>
              <div className="mt-1 font-medium">{clientSnap.name}</div>
              {clientSnap.address && <div className="whitespace-pre-line text-muted">{clientSnap.address}</div>}
              {clientSnap.vat_number && <div className="text-muted">VAT No: {clientSnap.vat_number}</div>}
            </div>
            <dl className="grid grid-cols-2 gap-y-1 text-[13px]">
              <dt className="text-muted">Issue date</dt><dd className="text-right">{fmtDate(inv.issue_date)}</dd>
              <dt className="text-muted">Due date</dt><dd className={`text-right ${inv.overdue ? "text-bad font-medium" : ""}`}>{fmtDate(inv.due_date)}</dd>
              {inv.matter && <><dt className="text-muted">Matter</dt><dd className="text-right">{inv.matter.file_number}</dd></>}
              {inv.reference && <><dt className="text-muted">Reference</dt><dd className="text-right">{inv.reference}</dd></>}
            </dl>
          </div>
          <div className="mt-8 overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-line text-left text-[11px] uppercase tracking-wider text-faint">
                <th className="py-2 pr-3 font-semibold">Description</th><th className="py-2 px-3 text-right font-semibold">Qty</th>
                <th className="py-2 px-3 text-right font-semibold">Unit</th>{isTax && <th className="py-2 px-3 text-right font-semibold">VAT</th>}
                <th className="py-2 pl-3 text-right font-semibold">Amount</th>
              </tr></thead>
              <tbody className="divide-y divide-line">
                {d.lines.map((l: any) => (
                  <tr key={l.id}>
                    <td className="py-2.5 pr-3"><div className="whitespace-pre-line">{l.description}</div>{l.kind === "disbursement" && <div className="text-[12px] text-faint">Disbursement</div>}</td>
                    <td className="num py-2.5 px-3 text-right">{Number(l.quantity)}</td>
                    <td className="num py-2.5 px-3 text-right">{rand(l.unit_price_cents)}</td>
                    {isTax && <td className="num py-2.5 px-3 text-right text-muted">{Number(l.vat_rate)}%</td>}
                    <td className="num py-2.5 pl-3 text-right">{rand(l.amount_cents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <dl className="ml-auto mt-6 max-w-[280px] space-y-1.5 text-sm">
            <div className="flex justify-between"><dt className="text-muted">Subtotal</dt><dd className="num">{rand(inv.subtotal_cents)}</dd></div>
            {isTax && <div className="flex justify-between"><dt className="text-muted">VAT</dt><dd className="num">{rand(inv.vat_cents)}</dd></div>}
            <div className="flex justify-between border-t border-line pt-2 font-semibold"><dt>Total</dt><dd className="num">{rand(inv.total_cents)}</dd></div>
            {inv.paid_cents > 0 && <div className="flex justify-between text-ok"><dt>Paid</dt><dd className="num">-{rand(inv.paid_cents)}</dd></div>}
            {inv.status !== "void" && <div className="flex justify-between font-semibold"><dt>Balance due</dt><dd className="num">{rand(balance)}</dd></div>}
          </dl>
          {inv.notes && <p className="mt-8 whitespace-pre-line border-t border-line pt-4 text-[13px] text-muted">{inv.notes}</p>}
        </div>

        <div className="space-y-6">
          <Card title="Payments" pad={false}>
            {d.payments.length === 0 ? <p className="px-5 py-5 text-sm text-muted">No payments recorded.</p> : (
              <ul className="divide-y divide-line">{d.payments.map((p: any) => (
                <li key={p.id} className="px-5 py-3 text-sm">
                  <div className="flex justify-between"><span>{fmtDate(p.paid_on)}</span><span className="num font-medium">{rand(p.amount_cents)}</span></div>
                  <div className="text-[12px] text-muted">{METHOD[p.method] ?? p.method}{p.reference ? ` · ${p.reference}` : ""}</div>
                </li>))}</ul>
            )}
            {open && <div className="border-t border-line px-5 py-3 text-[13px]"><span className="text-muted">Balance due</span> <span className="num float-right font-semibold">{rand(balance)}</span></div>}
          </Card>
          <Card title="History">
            <ul className="space-y-2 text-[13px] text-muted">
              <li>Created {fmtDateTime(inv.created_at)}</li>
              <li>Issued {fmtDateTime(inv.issued_at)}</li>
              {inv.emailed_at && <li>Emailed {inv.email_count > 1 ? `${inv.email_count} times, last` : ""} {fmtDateTime(inv.emailed_at)}{inv.last_emailed_to ? ` to ${inv.last_emailed_to}` : ""}</li>}
              {inv.voided_at && <li className="text-bad">Voided {fmtDateTime(inv.voided_at)}</li>}
            </ul>
          </Card>
          {inv.status === "issued" && inv.paid_cents === 0 && canRecordPayments(firm.role) && (
            <button onClick={() => setModal("void")} className="w-full text-center text-[13px] text-muted hover:text-bad">Void this invoice</button>
          )}
          <Link href={`/clients/${inv.client_id}`} className="block text-center text-[13px] text-muted hover:text-ink">View client</Link>
        </div>
      </div>

      {modal === "pay" && <PaymentModal invoice={inv} onClose={() => setModal("")} onDone={(r) => { setD(r); setModal(""); toast("Payment recorded"); }} />}
      {modal === "email" && <EmailModal invoice={inv} to={clientSnap.email} onClose={() => setModal("")} onDone={(to) => { setModal(""); toast(`Invoice emailed to ${to}`); load(); }} />}
      {modal === "void" && <VoidModal invoice={inv} onClose={() => setModal("")} onDone={(r) => { setD(r); setModal(""); toast("Invoice voided"); }} />}
    </>
  );
}

function PaymentModal({ invoice, onClose, onDone }: { invoice: any; onClose: () => void; onDone: (r: any) => void }) {
  const balance = invoice.total_cents - invoice.paid_cents;
  const [amount, setAmount] = useState((balance / 100).toFixed(2));
  const [date, setDate] = useState(today());
  const [method, setMethod] = useState("eft");
  const [ref, setRef] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setError(""); setBusy(true);
    try { onDone(await api(`/invoices/${invoice.id}/payments`, { method: "POST", json: { amount_cents: toCents(amount), paid_on: date, method, reference: ref || null } })); }
    catch (e: any) { setError(e.message); setBusy(false); }
  };
  return (
    <Modal open onClose={onClose} title={`Record payment for ${invoice.number}`}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={save} loading={busy}>Record payment</Button></>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Amount (R)" hint={`Balance due ${rand(balance)}`}><Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
        <Field label="Date received"><Input type="date" value={date} max={today()} onChange={(e) => setDate(e.target.value)} /></Field>
        <Field label="Method"><Select value={method} onChange={(e) => setMethod(e.target.value)}>{Object.entries(METHOD).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
        <Field label="Reference"><Input value={ref} onChange={(e) => setRef(e.target.value)} placeholder="Bank reference" /></Field>
      </div>
      {method === "trust_transfer" && <Notice tone="warn">Transfers from trust must also be recorded in your trust accounting system, with the client&apos;s authority.</Notice>}
      <p className="text-[12px] text-muted">Payments cannot be edited or deleted once recorded.</p>
      {error && <Notice tone="bad">{error}</Notice>}
    </Modal>
  );
}

function EmailModal({ invoice, to: defaultTo, onClose, onDone }: { invoice: any; to?: string; onClose: () => void; onDone: (to: string) => void }) {
  const [to, setTo] = useState(defaultTo || "");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const send = async () => {
    setError(""); setBusy(true);
    try { const r = await api(`/invoices/${invoice.id}/email`, { method: "POST", json: { to: to || undefined, message: message || undefined, resend: !!invoice.emailed_at } }); onDone(r.to); }
    catch (e: any) { setError(e.message); setBusy(false); }
  };
  return (
    <Modal open onClose={onClose} title={invoice.emailed_at ? `Send ${invoice.number} again?` : `Email ${invoice.number}`}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={send} loading={busy}>{invoice.emailed_at ? "Yes, send again" : "Send"}</Button></>}>
      {invoice.emailed_at && <Notice tone="warn">This invoice was already emailed{invoice.last_emailed_to ? ` to ${invoice.last_emailed_to}` : ""} on {fmtDateTime(invoice.emailed_at)}{invoice.email_count > 1 ? `, ${invoice.email_count} times in total` : ""}. Only send it again if the client asks for it.</Notice>}
      <Field label="To"><Input type="email" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
      <Field label="Message (optional)" hint="The invoice PDF is attached automatically."><Textarea rows={4} value={message} onChange={(e) => setMessage(e.target.value)} placeholder={`Please find attached invoice ${invoice.number}.`} /></Field>
      {error && <Notice tone="bad">{error}</Notice>}
    </Modal>
  );
}

function VoidModal({ invoice, onClose, onDone }: { invoice: any; onClose: () => void; onDone: (r: any) => void }) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const go = async () => {
    setError(""); setBusy(true);
    try { onDone(await api(`/invoices/${invoice.id}/void`, { method: "POST", json: { reason } })); }
    catch (e: any) { setError(e.message); setBusy(false); }
  };
  return (
    <Modal open onClose={onClose} title={`Void ${invoice.number}?`}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button variant="danger" onClick={go} loading={busy}>Void invoice</Button></>}>
      <p className="text-sm text-ink-2">Voiding cancels the invoice permanently. The number is kept so your invoice sequence has no gaps. If the client has received it, let them know and issue a corrected invoice.</p>
      <Field label="Reason"><Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Wrong client, re-issued as INV-00012" /></Field>
      {error && <Notice tone="bad">{error}</Notice>}
    </Modal>
  );
}

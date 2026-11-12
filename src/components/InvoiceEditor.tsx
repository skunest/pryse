"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { api, openPdf, toCents } from "@/lib/browser";
import { rand } from "@/lib/money";
import { ClientModal, MatterModal, type Client } from "./ClientForm";
import { Button, Card, Field, Input, Modal, Notice, Select, Textarea, useToast } from "./ui";

type Line = { key: string; kind: "fee" | "disbursement"; description: string; quantity: string; unit_price: string; vat_rate: string };
type Firm = { vat_registered: boolean; default_vat_rate: number; default_payment_days: number; invoice_prefix: string; next_invoice_number: number };

let n = 0;
const newLine = (rate: number, kind: Line["kind"] = "fee"): Line => ({ key: `l${++n}`, kind, description: "", quantity: "1", unit_price: "", vat_rate: String(rate) });

export function InvoiceEditor({ invoice, lines: initialLines, presetClient, onIssued }: { invoice?: any; lines?: any[]; presetClient?: string | null; onIssued?: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const [firm, setFirm] = useState<Firm | null>(null);
  const [clients, setClients] = useState<Client[]>([]);
  const [matters, setMatters] = useState<any[]>([]);
  const [clientId, setClientId] = useState<string>(invoice?.client_id ?? presetClient ?? "");
  const [matterId, setMatterId] = useState<string>(invoice?.matter_id ?? "");
  const [reference, setReference] = useState<string>(invoice?.reference ?? "");
  const [dueDate, setDueDate] = useState<string>(invoice?.due_date ?? "");
  const [notes, setNotes] = useState<string>(invoice?.notes ?? "");
  const [lines, setLines] = useState<Line[]>([]);
  const [busy, setBusy] = useState<"" | "save" | "issue" | "delete" | "preview">("");
  const [error, setError] = useState("");
  const [newClient, setNewClient] = useState(false);
  const [newMatter, setNewMatter] = useState(false);
  const [confirmIssue, setConfirmIssue] = useState(false);

  useEffect(() => {
    Promise.all([api<{ firm: Firm }>("/firm"), api<{ clients: Client[] }>("/clients")]).then(([f, c]) => {
      setFirm(f.firm);
      setClients(c.clients);
      const rate = f.firm.vat_registered ? Number(f.firm.default_vat_rate) : 0;
      setLines(initialLines?.length
        ? initialLines.map((l) => ({ key: `l${++n}`, kind: l.kind, description: l.description, quantity: String(Number(l.quantity)), unit_price: (Number(l.unit_price_cents) / 100).toFixed(2), vat_rate: String(Number(l.vat_rate)) }))
        : [newLine(rate)]);
    }).catch((e) => setError(e.message));
  }, [initialLines]);

  useEffect(() => {
    if (!clientId) { setMatters([]); return; }
    api<{ matters: any[] }>(`/matters?client_id=${clientId}&status=open`).then((r) => setMatters(r.matters)).catch(() => setMatters([]));
  }, [clientId]);

  const vat = firm?.vat_registered ?? true;
  const calc = useMemo(() => {
    let sub = 0, tax = 0;
    const rows = lines.map((l) => {
      const amount = Math.round((Number(l.quantity) || 0) * toCents(l.unit_price));
      const v = vat ? Math.round(amount * (Number(l.vat_rate) || 0) / 100) : 0;
      sub += amount; tax += v;
      return amount;
    });
    return { rows, sub, tax, total: sub + tax };
  }, [lines, vat]);

  const upd = (key: string, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const move = (i: number, d: number) => setLines((ls) => { const c = [...ls]; const j = i + d; if (j < 0 || j >= c.length) return c; [c[i], c[j]] = [c[j], c[i]]; return c; });

  const payload = () => ({
    client_id: clientId, matter_id: matterId || null, reference: reference || null, notes: notes || null, due_date: dueDate || null,
    lines: lines.filter((l) => l.description.trim() || toCents(l.unit_price)).map((l) => ({
      kind: l.kind, description: l.description, quantity: Number(l.quantity) || 1, unit_price_cents: toCents(l.unit_price),
      vat_rate: vat ? Number(l.vat_rate) || 0 : 0,
    })),
  });

  const validate = () => {
    if (!clientId) return "Choose a client";
    const p = payload();
    if (!p.lines.length) return "Add at least one line";
    if (p.lines.some((l) => !l.description.trim())) return "Each line needs a description";
    return "";
  };

  const save = async (then?: "issue" | "preview") => {
    const v = validate();
    if (v) { setError(v); return null; }
    setError(""); setBusy(then ?? "save");
    try {
      const r = invoice
        ? await api(`/invoices/${invoice.id}`, { method: "PATCH", json: payload() })
        : await api(`/invoices`, { method: "POST", json: payload() });
      const id = r.invoice.id;
      if (then === "issue") {
        await api(`/invoices/${id}/issue`, { method: "POST", json: {} });
        toast("Invoice issued");
        if (invoice && onIssued) onIssued();
        else router.replace(`/invoices/${id}`);
        return id;
      }
      if (then === "preview") await openPdf(`/invoices/${id}/pdf`);
      else toast("Draft saved");
      if (!invoice) router.replace(`/invoices/${id}`);
      return id;
    } catch (e: any) { setError(e.message); return null; }
    finally { setBusy(""); }
  };

  const del = async () => {
    if (!invoice || !confirm("Delete this draft invoice?")) return;
    setBusy("delete");
    try { await api(`/invoices/${invoice.id}`, { method: "DELETE" }); toast("Draft deleted"); router.replace("/invoices"); }
    catch (e: any) { setError(e.message); setBusy(""); }
  };

  if (!firm) return error ? <Notice tone="bad">{error}</Notice> : null;
  const client = clients.find((c) => c.id === clientId);
  const nextNo = `${firm.invoice_prefix}-${String(firm.next_invoice_number).padStart(5, "0")}`;

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
      <div className="space-y-6">
        <Card title="Bill to">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Client">
              <div className="flex gap-2">
                <Select value={clientId} onChange={(e) => { setClientId(e.target.value); setMatterId(""); }}>
                  <option value="">Choose a client...</option>
                  {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </Select>
                <Button variant="secondary" onClick={() => setNewClient(true)} title="New client">+</Button>
              </div>
            </Field>
            <Field label="Matter (optional)">
              <div className="flex gap-2">
                <Select value={matterId} onChange={(e) => setMatterId(e.target.value)} disabled={!clientId}>
                  <option value="">No matter</option>
                  {matters.map((m) => <option key={m.id} value={m.id}>{m.file_number} · {m.title}</option>)}
                </Select>
                <Button variant="secondary" onClick={() => setNewMatter(true)} disabled={!clientId} title="New matter">+</Button>
              </div>
            </Field>
            <Field label="Client reference (optional)" hint="An order number or reference the client asked for."><Input value={reference} onChange={(e) => setReference(e.target.value)} /></Field>
            <Field label="Due date" hint={`Leave blank for ${firm.default_payment_days} days from the issue date.`}><Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} /></Field>
          </div>
          {client && vat && !client.vat_number && client.type !== "individual" && (
            <p className="mt-4 text-[13px] text-warn">This client has no VAT number. If they are VAT registered, SARS requires it on tax invoices over R5 000.</p>
          )}
          {client && !client.address && <p className="mt-2 text-[13px] text-muted">Tip: add the client&apos;s address so it prints on the invoice.</p>}
        </Card>

        <Card title="Lines" pad={false}>
          <div className="divide-y divide-line">
            {lines.map((l, i) => (
              <div key={l.key} className="space-y-2.5 px-5 py-4">
                <div className="flex items-start gap-2">
                  <span className="mt-2.5 w-5 shrink-0 text-[12px] text-faint">{i + 1}.</span>
                  <Textarea rows={2} value={l.description} onChange={(e) => upd(l.key, { description: e.target.value })}
                    placeholder={l.kind === "fee" ? "Description, e.g. Consultation and advice on the merits of the claim" : "Description, e.g. Sheriff's fees for service of summons"} className="min-h-[44px] flex-1" />
                  <div className="flex shrink-0 flex-col text-muted">
                    <button onClick={() => move(i, -1)} disabled={i === 0} className="rounded px-1.5 py-0.5 hover:bg-soft hover:text-ink disabled:opacity-30" aria-label="Move up">↑</button>
                    <button onClick={() => setLines((ls) => ls.length > 1 ? ls.filter((x) => x.key !== l.key) : ls)} className="rounded px-1.5 py-0.5 hover:bg-soft hover:text-bad" aria-label="Remove line">✕</button>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 pl-7 pr-9 sm:grid-cols-[140px_80px_1fr_80px_1fr]">
                  <label className="block"><span className="mb-1 block text-[11px] text-faint">Type</span>
                    <Select value={l.kind} onChange={(e) => upd(l.key, { kind: e.target.value as Line["kind"] })}><option value="fee">Fee</option><option value="disbursement">Disbursement</option></Select></label>
                  <label className="block"><span className="mb-1 block text-[11px] text-faint">Qty / hours</span>
                    <Input inputMode="decimal" value={l.quantity} onChange={(e) => upd(l.key, { quantity: e.target.value })} className="text-right" /></label>
                  <label className="block"><span className="mb-1 block text-[11px] text-faint">Unit price (R, excl. VAT)</span>
                    <Input inputMode="decimal" value={l.unit_price} onChange={(e) => upd(l.key, { unit_price: e.target.value })} placeholder="0.00" className="text-right" /></label>
                  {vat ? <label className="block"><span className="mb-1 block text-[11px] text-faint">VAT %</span>
                    <Input inputMode="decimal" value={l.vat_rate} onChange={(e) => upd(l.key, { vat_rate: e.target.value })} className="text-right" /></label> : <span className="hidden sm:block" />}
                  <div className="col-span-2 flex items-end justify-end sm:col-span-1"><div className="pb-2.5 text-right"><span className="mb-1 block text-[11px] text-faint">Amount</span><span className="num text-sm font-semibold">{rand(calc.rows[i])}</span></div></div>
                </div>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap gap-2 border-t border-line px-5 py-3">
            <Button size="sm" variant="secondary" onClick={() => setLines((ls) => [...ls, newLine(vat ? Number(firm.default_vat_rate) : 0)])}>Add fee</Button>
            <Button size="sm" variant="ghost" onClick={() => setLines((ls) => [...ls, newLine(vat ? Number(firm.default_vat_rate) : 0, "disbursement")])}>Add disbursement</Button>
          </div>
        </Card>

        <Card title="Note on the invoice">
          <Textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional. For example: Thank you for your instruction." />
        </Card>
      </div>

      <div className="lg:sticky lg:top-8 lg:self-start">
        <Card>
          <dl className="space-y-2.5 text-sm">
            <div className="flex justify-between"><dt className="text-muted">Subtotal</dt><dd className="num">{rand(calc.sub)}</dd></div>
            {vat && <div className="flex justify-between"><dt className="text-muted">VAT</dt><dd className="num">{rand(calc.tax)}</dd></div>}
            <div className="flex justify-between border-t border-line pt-3 text-base font-semibold"><dt>Total</dt><dd className="num">{rand(calc.total)}</dd></div>
          </dl>
          {error && <div className="mt-4"><Notice tone="bad">{error}</Notice></div>}
          <div className="mt-5 space-y-2">
            <Button className="w-full" onClick={() => { const v = validate(); if (v) setError(v); else setConfirmIssue(true); }} loading={busy === "issue"}>Issue invoice</Button>
            <Button className="w-full" variant="secondary" onClick={() => save()} loading={busy === "save"}>Save draft</Button>
            <Button className="w-full" variant="ghost" onClick={() => save("preview")} loading={busy === "preview"}>Preview PDF</Button>
            {invoice && <Button className="w-full" variant="ghost" onClick={del} loading={busy === "delete"}><span className="text-bad">Delete draft</span></Button>}
          </div>
          <p className="mt-4 text-[12px] leading-relaxed text-muted">Drafts can be changed freely. Once issued, the invoice gets its number and is locked, as SARS requires. Mistakes are corrected by voiding and re-issuing.</p>
        </Card>
      </div>

      <Modal open={confirmIssue} onClose={() => setConfirmIssue(false)} title="Issue this invoice?"
        footer={<><Button variant="secondary" onClick={() => setConfirmIssue(false)}>Cancel</Button><Button loading={busy === "issue"} onClick={async () => { const ok = await save("issue"); if (!ok) setConfirmIssue(false); }}>Issue {rand(calc.total)}</Button></>}>
        <p className="text-sm text-ink-2">The invoice will be numbered <strong className="num">{nextNo}</strong> (or the next free number) and locked. It can no longer be edited, only voided.</p>
        <p className="text-sm text-muted">Remember to capture it in your accounting system.</p>
      </Modal>
      <ClientModal open={newClient} onClose={() => setNewClient(false)} onSaved={(c) => { setClients((x) => [...x, c].sort((a, b) => a.name.localeCompare(b.name))); setClientId(c.id); setMatterId(""); setNewClient(false); }} />
      {clientId && <MatterModal open={newMatter} clientId={clientId} onClose={() => setNewMatter(false)} onSaved={(m) => { setMatters((x) => [m, ...x]); setMatterId(m.id); setNewMatter(false); }} />}
    </div>
  );
}

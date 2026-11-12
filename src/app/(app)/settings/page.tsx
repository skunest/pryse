"use client";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/browser";
import { fmtDate } from "@/lib/money";
import { useSession, canAdmin, ROLE_LABEL, type Role } from "@/components/AppShell";
import { Button, Card, ErrorBox, Field, Input, Loading, Modal, Notice, PageHeader, Select, Textarea, useToast, cx } from "@/components/ui";

const TABS = [{ v: "firm", label: "Firm details" }, { v: "invoices", label: "Invoices" }, { v: "team", label: "Team" }] as const;

export default function SettingsPage() {
  const { firm: me } = useSession();
  const [tab, setTab] = useState<(typeof TABS)[number]["v"]>("firm");
  const [welcome, setWelcome] = useState(false);
  useEffect(() => { setWelcome(new URLSearchParams(window.location.search).has("welcome")); }, []);

  return (
    <>
      <PageHeader title="Settings" sub="Firm details printed on invoices, invoice numbering and who can use Pryse." />
      {welcome && <div className="mb-6"><Notice tone="ok">Welcome to Pryse. Start by completing your firm details below: they are printed on every invoice. Then invite your team.</Notice></div>}
      {!canAdmin(me.role) && <div className="mb-6"><Notice>Only the owner and administrators can change settings.</Notice></div>}
      <div className="mb-6 flex w-fit gap-1 rounded-lg bg-soft p-1">
        {TABS.map((t) => <button key={t.v} onClick={() => setTab(t.v)} className={cx("rounded-md px-4 py-1.5 text-[13px]", tab === t.v ? "bg-white font-medium shadow-sm" : "text-muted hover:text-ink")}>{t.label}</button>)}
      </div>
      {tab === "team" ? <Team /> : <FirmForm section={tab} />}
    </>
  );
}

function FirmForm({ section }: { section: "firm" | "invoices" }) {
  const { firm: me } = useSession();
  const toast = useToast();
  const [f, setF] = useState<any>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const admin = canAdmin(me.role);

  useEffect(() => { api("/firm").then((r) => setF(r.firm)).catch((e) => setError(e.message)); }, []);
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setF((x: any) => ({ ...x, [k]: e.target.value }));

  const save = async () => {
    setError(""); setSaving(true);
    const keys = section === "firm"
      ? ["name", "legal_name", "registration_number", "vat_registered", "vat_number", "email", "phone", "address", "bank_name", "bank_account_name", "bank_account_number", "bank_branch_code"]
      : ["invoice_prefix", "matter_prefix", "default_payment_days", "default_vat_rate", "invoice_footer", "brand_color"];
    const body: any = {};
    for (const k of keys) body[k] = f[k] ?? null;
    if (section === "invoices") {
      body.default_payment_days = Number(body.default_payment_days);
      body.default_vat_rate = Number(body.default_vat_rate);
      body.invoice_prefix = String(body.invoice_prefix || "").toUpperCase();
      body.matter_prefix = String(body.matter_prefix || "").toUpperCase();
    }
    try { await api("/firm", { method: "PATCH", json: body }); toast("Settings saved"); }
    catch (e: any) { setError(e.message); }
    finally { setSaving(false); }
  };

  const uploadLogo = async (file?: File | null) => {
    if (!file) return;
    setUploading(true); setError("");
    const fd = new FormData(); fd.set("file", file);
    try { const r = await api("/firm/logo", { method: "POST", body: fd }); setF((x: any) => ({ ...x, logo_path: r.logo_path, logo_url: r.logo_url })); toast("Logo updated"); }
    catch (e: any) { setError(e.message); }
    finally { setUploading(false); }
  };
  const removeLogo = async () => { await api("/firm/logo", { method: "DELETE" }); setF((x: any) => ({ ...x, logo_path: null, logo_url: null })); };

  if (!f) return error ? <ErrorBox message={error} /> : <Loading />;

  return (
    <fieldset disabled={!admin} className="space-y-6">
      {section === "firm" ? (
        <>
          <Card title="Firm">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Trading name"><Input value={f.name ?? ""} onChange={set("name")} /></Field>
              <Field label="Registered name" hint="As registered with CIPC, e.g. Maanda Attorneys Inc."><Input value={f.legal_name ?? ""} onChange={set("legal_name")} /></Field>
              <Field label="Registration number"><Input value={f.registration_number ?? ""} onChange={set("registration_number")} /></Field>
              <Field label="Email" hint="Clients reply here. Also receives signed documents."><Input type="email" value={f.email ?? ""} onChange={set("email")} /></Field>
              <Field label="Phone"><Input value={f.phone ?? ""} onChange={set("phone")} /></Field>
              <Field label="Address" className="sm:col-span-2"><Textarea rows={3} value={f.address ?? ""} onChange={set("address")} /></Field>
            </div>
          </Card>
          <Card title="VAT">
            <label className="flex items-start gap-3 text-sm">
              <input type="checkbox" className="mt-1" checked={!!f.vat_registered} onChange={(e) => setF((x: any) => ({ ...x, vat_registered: e.target.checked }))} />
              <span><span className="font-medium">The firm is registered for VAT</span><span className="block text-muted">Invoices are titled &quot;Tax Invoice&quot; and show VAT. Turn off if the firm is not VAT registered.</span></span>
            </label>
            {f.vat_registered && <Field label="VAT number" className="mt-4 max-w-xs"><Input value={f.vat_number ?? ""} onChange={set("vat_number")} /></Field>}
            {f.vat_registered && !f.vat_number && <p className="mt-2 text-[13px] text-warn">SARS requires the firm&apos;s VAT number on every tax invoice.</p>}
          </Card>
          <Card title="Banking details" actions={<span className="text-[12px] text-muted">Printed on invoices for EFT payments</span>}>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Bank"><Input value={f.bank_name ?? ""} onChange={set("bank_name")} /></Field>
              <Field label="Account name"><Input value={f.bank_account_name ?? ""} onChange={set("bank_account_name")} /></Field>
              <Field label="Account number"><Input value={f.bank_account_number ?? ""} onChange={set("bank_account_number")} /></Field>
              <Field label="Branch code"><Input value={f.bank_branch_code ?? ""} onChange={set("bank_branch_code")} /></Field>
            </div>
            <p className="mt-3 text-[12px] text-muted">Use the firm&apos;s business account. Never print the trust account on fee invoices unless your accountant advises it.</p>
          </Card>
          <Card title="Logo" actions={<span className="text-[12px] text-muted">Printed on invoices and the signing page</span>}>
            <div className="flex flex-wrap items-center gap-5">
              <div className="flex h-20 w-48 items-center justify-center rounded-lg border border-line bg-soft">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {f.logo_url ? <img src={f.logo_url} alt="Logo" className="max-h-16 max-w-44 object-contain" /> : <span className="text-[12px] text-faint">No logo</span>}
              </div>
              <div className="flex gap-2">
                <label className={cx("inline-flex cursor-pointer items-center rounded-lg border border-line bg-white px-4 py-2 text-sm font-medium hover:border-ink-2", (!admin || uploading) && "pointer-events-none opacity-50")}>
                  {uploading ? "Uploading..." : f.logo_url ? "Replace" : "Upload logo"}
                  <input type="file" accept="image/png,image/jpeg" className="hidden" onChange={(e) => uploadLogo(e.target.files?.[0])} />
                </label>
                {f.logo_url && <Button variant="ghost" onClick={removeLogo}>Remove</Button>}
              </div>
              <span className="text-[12px] text-muted">PNG or JPEG, under 2 MB. A wide logo on a white or transparent background works best.</span>
            </div>
          </Card>
        </>
      ) : (
        <Card title="Invoice settings">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Invoice number prefix" hint={`Next invoice: ${String(f.invoice_prefix || "INV").toUpperCase()}-${String(f.next_invoice_number).padStart(5, "0")}. Use a prefix different from your accounting system's, so numbers never clash.`}>
              <Input value={f.invoice_prefix ?? ""} maxLength={8} onChange={set("invoice_prefix")} />
            </Field>
            <Field label="Matter file number prefix" hint={`Next matter: ${String(f.matter_prefix || "MAT").toUpperCase()}/${String(f.next_matter_number).padStart(5, "0")}`}>
              <Input value={f.matter_prefix ?? ""} maxLength={8} onChange={set("matter_prefix")} />
            </Field>
            <Field label="Payment terms (days)" hint="Used for the due date when none is set."><Input type="number" min={0} max={365} value={f.default_payment_days ?? 30} onChange={set("default_payment_days")} /></Field>
            <Field label="VAT rate (%)"><Input type="number" step="0.01" min={0} max={100} value={f.default_vat_rate ?? 15} onChange={set("default_vat_rate")} /></Field>
            <Field label="Accent colour" hint="Used for headings on the invoice PDF.">
              <div className="flex items-center gap-2"><input type="color" value={f.brand_color || "#111111"} onChange={set("brand_color")} className="h-10 w-12 cursor-pointer rounded border border-line" /><Input value={f.brand_color ?? ""} onChange={set("brand_color")} className="max-w-[120px] font-mono" /></div>
            </Field>
            <Field label="Invoice footer" hint="Printed at the bottom of every invoice." className="sm:col-span-2"><Textarea rows={2} value={f.invoice_footer ?? ""} onChange={set("invoice_footer")} placeholder="e.g. Please use the invoice number as your payment reference." /></Field>
          </div>
        </Card>
      )}
      {error && <Notice tone="bad">{error}</Notice>}
      {admin && <div className="flex justify-end"><Button onClick={save} loading={saving}>Save changes</Button></div>}
    </fieldset>
  );
}

function Team() {
  const { firm: me, user } = useSession();
  const toast = useToast();
  const [rows, setRows] = useState<any[] | null>(null);
  const [error, setError] = useState("");
  const [invite, setInvite] = useState(false);
  const [shareLink, setShareLink] = useState<{ email: string; link: string; error?: string } | null>(null);
  const admin = canAdmin(me.role);
  const load = useCallback(() => api("/members").then((r) => setRows(r.members)).catch((e) => setError(e.message)), []);
  useEffect(() => { load(); }, [load]);

  const change = async (m: any, role: Role) => {
    try { await api(`/members/${m.user_id}`, { method: "PATCH", json: { role } }); toast("Role updated"); load(); } catch (e: any) { toast(e.message, "bad"); }
  };
  const resend = async (m: any) => {
    try {
      const r = await api(`/members/${m.user_id}`, { method: "PATCH", json: { resend_invite: true } });
      if (r.link) setShareLink({ email: m.email, link: r.link, error: r.email_error });
      else toast(`Invite sent again to ${m.email}`);
    } catch (e: any) { toast(e.message, "bad"); }
  };
  const remove = async (m: any) => {
    if (!confirm(`Remove ${m.full_name || m.email} from Pryse? They will no longer be able to sign in to the firm.`)) return;
    try { await api(`/members/${m.user_id}`, { method: "DELETE" }); toast("Removed"); load(); } catch (e: any) { toast(e.message, "bad"); }
  };

  return (
    <>
      <Card title="Team" pad={false} actions={admin && <Button size="sm" onClick={() => setInvite(true)}>Invite someone</Button>}>
        {error && <div className="p-5"><ErrorBox message={error} /></div>}
        {!rows && !error && <Loading />}
        {rows && (
          <ul className="divide-y divide-line">
            {rows.map((m) => (
              <li key={m.user_id} className="flex flex-wrap items-center gap-3 px-5 py-4">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium">{m.full_name || m.email}{m.user_id === user.id && <span className="text-muted"> (you)</span>}</div>
                  <div className="text-[13px] text-muted">{m.email}{m.last_sign_in_at ? ` · Last signed in ${fmtDate(m.last_sign_in_at)}` : ""}</div>
                </div>
                {m.invite_pending && <span className="rounded-full bg-warn-soft px-2.5 py-0.5 text-[12px] font-medium text-warn">Invite pending</span>}
                {admin && m.role !== "owner" && m.user_id !== user.id ? (
                  <Select value={m.role} onChange={(e) => change(m, e.target.value as Role)} className="w-auto py-1.5 text-[13px]">
                    {(["admin", "fee_earner", "bookkeeper", "staff"] as Role[]).map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
                  </Select>
                ) : <span className="text-[13px] text-muted">{ROLE_LABEL[m.role as Role]}</span>}
                {admin && m.invite_pending && <Button size="sm" variant="ghost" onClick={() => resend(m)}>Resend</Button>}
                {admin && m.role !== "owner" && m.user_id !== user.id && <Button size="sm" variant="ghost" onClick={() => remove(m)}><span className="text-bad">Remove</span></Button>}
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Card title="What each role can do" className="mt-6">
        <ul className="space-y-1.5 text-[13px] text-ink-2">
          <li><strong>Owner and Administrator:</strong> everything, including settings and the team.</li>
          <li><strong>Bookkeeper:</strong> create and issue invoices, record payments, void invoices, send documents for signature.</li>
          <li><strong>Fee earner:</strong> create and issue invoices, email them, send documents for signature.</li>
          <li><strong>Staff:</strong> view invoices, manage clients, send documents for signature.</li>
        </ul>
      </Card>
      {invite && <InviteModal onClose={() => setInvite(false)} onDone={(email, r) => {
        setInvite(false); load();
        if (r?.link) setShareLink({ email, link: r.link, error: r.email_error });
        else toast(`Invite sent to ${email}`);
      }} />}
      {shareLink && (
        <Modal open onClose={() => setShareLink(null)} title="Email could not be sent"
          footer={<><Button variant="secondary" onClick={() => setShareLink(null)}>Close</Button><Button onClick={() => { navigator.clipboard?.writeText(shareLink.link); toast("Link copied"); }}>Copy link</Button></>}>
          <Notice tone="warn">The invite for {shareLink.email} was created, but the email did not go out{shareLink.error ? ` (${shareLink.error})` : ""}.</Notice>
          <p className="text-sm text-ink-2">Copy this personal link and send it to them yourself, for example on WhatsApp. It works once, for that person only.</p>
          <Input readOnly value={shareLink.link} onFocus={(e) => e.currentTarget.select()} className="font-mono text-[12px]" />
        </Modal>
      )}
    </>
  );
}

function InviteModal({ onClose, onDone }: { onClose: () => void; onDone: (email: string, r?: { link?: string; email_error?: string }) => void }) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<Role>("fee_earner");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const send = async () => {
    setError(""); setBusy(true);
    try { const r = await api("/members", { method: "POST", json: { email, full_name: name || undefined, role } }); onDone(email, r); }
    catch (e: any) { setError(e.message); setBusy(false); }
  };
  return (
    <Modal open onClose={onClose} title="Invite someone"
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={send} loading={busy}>Send invite</Button></>}>
      <Field label="Full name"><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>
      <Field label="Email"><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
      <Field label="Role"><Select value={role} onChange={(e) => setRole(e.target.value as Role)}>
        {(["admin", "fee_earner", "bookkeeper", "staff"] as Role[]).map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
      </Select></Field>
      <p className="text-[12px] text-muted">They will get an email with a link to choose a password.</p>
      {error && <Notice tone="bad">{error}</Notice>}
    </Modal>
  );
}

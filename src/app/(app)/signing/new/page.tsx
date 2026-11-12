"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/browser";
import { fmtDate } from "@/lib/money";
import type { Client } from "@/components/ClientForm";
import { Button, Card, Field, Input, Modal, Notice, PageHeader, Select, Textarea, useToast, cx } from "@/components/ui";

type DocType = { value: string; label: string; allowed: boolean; note?: string };
type Signer = { key: number; name: string; email: string };
let k = 0;

function NewSigning() {
  const router = useRouter();
  const toast = useToast();
  const sp = useSearchParams();
  const [types, setTypes] = useState<DocType[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [matters, setMatters] = useState<any[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [docType, setDocType] = useState("engagement_letter");
  const [clientId, setClientId] = useState(sp.get("client") || "");
  const [matterId, setMatterId] = useState("");
  const [message, setMessage] = useState("");
  const [days, setDays] = useState("14");
  const [signers, setSigners] = useState<Signer[]>([{ key: ++k, name: "", email: "" }]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<"" | "draft" | "send">("");
  const [drag, setDrag] = useState(false);
  const [sha, setSha] = useState("");
  const [earlier, setEarlier] = useState<any[]>([]);
  const [dup, setDup] = useState("");

  useEffect(() => {
    api("/signing/types").then((r) => setTypes(r.types));
    api("/clients").then((r) => setClients(r.clients));
  }, []);

  useEffect(() => {
    if (!clientId) { setMatters([]); return; }
    api(`/matters?client_id=${clientId}&status=open`).then((r) => setMatters(r.matters));
    const c = clients.find((x) => x.id === clientId);
    if (c) setSigners((s) => (s.length === 1 && !s[0].name && !s[0].email ? [{ key: s[0].key, name: c.name, email: c.email || "" }] : s));
  }, [clientId, clients]);

  // Warn early if this PDF, or a document with this title for this client, was already sent.
  useEffect(() => {
    if (!sha && !(clientId && title.trim())) { setEarlier([]); return; }
    const t = setTimeout(() => {
      api(`/signing?sha256=${sha}&title=${encodeURIComponent(title.trim())}&client_id=${clientId}`).then((r) => setEarlier(r.earlier || [])).catch(() => setEarlier([]));
    }, 400);
    return () => clearTimeout(t);
  }, [sha, title, clientId]);

  const type = useMemo(() => types.find((t) => t.value === docType), [types, docType]);

  const pick = (f: File | null | undefined) => {
    if (!f) return;
    if (!f.name.toLowerCase().endsWith(".pdf")) { setError("Only PDF documents can be sent for signature."); return; }
    if (f.size > 15 * 1024 * 1024) { setError("The PDF must be smaller than 15 MB."); return; }
    setError(""); setFile(f); setSha("");
    f.arrayBuffer().then((b) => crypto.subtle.digest("SHA-256", b)).then((d) => setSha(Array.from(new Uint8Array(d)).map((x) => x.toString(16).padStart(2, "0")).join(""))).catch(() => {});
    if (!title) setTitle(f.name.replace(/\.pdf$/i, "").replace(/[_-]+/g, " "));
  };

  const submit = async (send: boolean, allowDuplicate = false) => {
    setError("");
    if (!file) return setError("Upload the PDF to be signed.");
    if (!type?.allowed) return setError(type?.note || "This type of document cannot be signed electronically.");
    const clean = signers.filter((s) => s.name.trim() || s.email.trim());
    if (!clean.length) return setError("Add at least one signer.");
    setBusy(send ? "send" : "draft");
    const fd = new FormData();
    fd.set("file", file);
    fd.set("title", title);
    fd.set("document_type", docType);
    if (clientId) fd.set("client_id", clientId);
    if (matterId) fd.set("matter_id", matterId);
    if (message) fd.set("message", message);
    fd.set("expires_days", days);
    fd.set("signers", JSON.stringify(clean.map(({ name, email }) => ({ name, email }))));
    fd.set("send", String(send));
    if (allowDuplicate) fd.set("allow_duplicate", "true");
    try {
      const r = await api("/signing", { method: "POST", body: fd });
      const failed = (r.delivery || []).filter((x: any) => !x.sent);
      if (send && failed.length) toast(`Created, but the email to ${failed.map((f: any) => f.email).join(", ")} was not delivered. Check the email settings.`, "bad");
      else toast(send ? "Sent for signature" : "Draft saved");
      router.replace(`/signing/${r.request.id}`);
    } catch (e: any) {
      setBusy("");
      if (String(e.code || "").startsWith("already_sent")) setDup(e.message);
      else setError(e.message);
    }
  };

  return (
    <>
      <PageHeader back={{ href: "/signing", label: "E-signing" }} title="Send for signature" />
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          <Card title="1. Document">
            <label
              onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
              onDrop={(e) => { e.preventDefault(); setDrag(false); pick(e.dataTransfer.files?.[0]); }}
              className={cx("flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-10 text-center transition", drag ? "border-brand bg-brand-soft" : file ? "border-ok/40 bg-ok-soft/40" : "border-line hover:border-ink-2")}>
              <input type="file" accept="application/pdf,.pdf" className="hidden" onChange={(e) => pick(e.target.files?.[0])} />
              {file ? (<><div className="text-sm font-medium">{file.name}</div><div className="mt-1 text-[12px] text-muted">{(file.size / 1024 / 1024).toFixed(2)} MB · click to replace</div></>)
                : (<><div className="text-sm font-medium">Drop a PDF here, or click to choose</div><div className="mt-1 text-[12px] text-muted">PDF only, up to 15 MB. Not password protected.</div></>)}
            </label>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <Field label="Title" hint="The signers see this in the email."><Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Letter of engagement" /></Field>
              <Field label="Type of document">
                <Select value={docType} onChange={(e) => setDocType(e.target.value)}>
                  <optgroup label="Can be signed electronically">{types.filter((t) => t.allowed).map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}</optgroup>
                  <optgroup label="Cannot be signed electronically">{types.filter((t) => !t.allowed).map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}</optgroup>
                </Select>
              </Field>
            </div>
            {type?.note && <div className="mt-4"><Notice tone={type.allowed ? "warn" : "bad"}>{type.note}</Notice></div>}
          </Card>

          <Card title="2. Who must sign">
            <div className="space-y-3">
              {signers.map((s, i) => (
                <div key={s.key} className="grid grid-cols-[24px_1fr_1fr_28px] items-center gap-2">
                  <span className="text-[13px] text-faint">{i + 1}.</span>
                  <Input placeholder="Full name" value={s.name} onChange={(e) => setSigners((x) => x.map((y) => y.key === s.key ? { ...y, name: e.target.value } : y))} />
                  <Input type="email" placeholder="Email address" value={s.email} onChange={(e) => setSigners((x) => x.map((y) => y.key === s.key ? { ...y, email: e.target.value } : y))} />
                  <button onClick={() => setSigners((x) => x.length > 1 ? x.filter((y) => y.key !== s.key) : x)} className="text-muted hover:text-bad" aria-label="Remove signer">✕</button>
                </div>
              ))}
            </div>
            {signers.length < 10 && <Button size="sm" variant="ghost" className="mt-3" onClick={() => setSigners((x) => [...x, { key: ++k, name: "", email: "" }])}>+ Add another signer</Button>}
            <p className="mt-3 text-[12px] text-muted">Each signer gets their own link and must enter a one-time code sent to their email before they can view and sign. They can sign in any order.</p>
          </Card>

          <Card title="3. Message (optional)">
            <Textarea rows={3} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Shown in the email. For example: Please review and sign the attached letter of engagement." />
          </Card>
        </div>

        <div className="space-y-6 lg:sticky lg:top-8 lg:self-start">
          <Card title="Link to (optional)">
            <div className="space-y-4">
              <Field label="Client"><Select value={clientId} onChange={(e) => { setClientId(e.target.value); setMatterId(""); }}>
                <option value="">None</option>{clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select></Field>
              <Field label="Matter"><Select value={matterId} onChange={(e) => setMatterId(e.target.value)} disabled={!clientId}>
                <option value="">None</option>{matters.map((m) => <option key={m.id} value={m.id}>{m.file_number} · {m.title}</option>)}
              </Select></Field>
              <Field label="Link expires after"><Select value={days} onChange={(e) => setDays(e.target.value)}>
                {[3, 7, 14, 30, 60, 90].map((d) => <option key={d} value={d}>{d} days</option>)}
              </Select></Field>
            </div>
          </Card>
          {earlier.length > 0 && (
            <Notice tone="warn">
              <strong>Already sent.</strong> {earlier.slice(0, 3).map((r: any) => (
                <span key={r.id} className="mt-1 block">
                  <a href={`/signing/${r.id}`} className="underline">{r.title}</a> to {(r.signers || []).map((s: any) => s.name).join(", ")} on {fmtDate(r.sent_at)} ({r.status === "completed" ? "signed" : "awaiting signature"})
                </span>
              ))}
              <span className="mt-1 block">Use Send reminder on the existing request instead of sending it again.</span>
            </Notice>
          )}
          {error && <Notice tone="bad">{error}</Notice>}
          <div className="space-y-2">
            <Button className="w-full" onClick={() => submit(true)} loading={busy === "send"} disabled={!type?.allowed}>Send for signature</Button>
            <Button className="w-full" variant="secondary" onClick={() => submit(false)} loading={busy === "draft"} disabled={!type?.allowed}>Save as draft</Button>
          </div>
          <p className="text-[12px] leading-relaxed text-muted">Signatures are ordinary electronic signatures under the Electronic Communications and Transactions Act 25 of 2002. When everyone has signed, Pryse seals the document with a certificate of completion and emails a copy to all parties.</p>
        </div>
      </div>
      <Modal open={!!dup} onClose={() => setDup("")} title="This was already sent"
        footer={<><Button variant="secondary" onClick={() => setDup("")}>Don&apos;t send</Button><Button onClick={() => { setDup(""); submit(true, true); }}>Send again anyway</Button></>}>
        <p className="text-sm text-ink-2">{dup}</p>
        <p className="text-sm text-muted">If the client lost the email, open the existing request and click Send reminder instead. That sends a fresh link without creating a second copy.</p>
      </Modal>
    </>
  );
}

export default function Page() {
  return <Suspense><NewSigning /></Suspense>;
}

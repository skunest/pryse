"use client";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/browser";
import { fmtDate, fmtDateTime } from "@/lib/money";
import { Badge, Button, Card, ErrorBox, Loading, Modal, Notice, PageHeader, useToast } from "@/components/ui";

const EVENT: Record<string, string> = {
  created: "Request created", sent: "Sent for signature", reminder_sent: "Reminder sent", opened: "Opened the signing link",
  otp_sent: "Verification code sent", otp_verified: "Verified with email code", otp_failed: "Entered an incorrect code",
  viewed: "Viewed the document", signed: "Signed", declined: "Declined to sign", completed: "Everyone signed. Document sealed",
  cancelled: "Request cancelled",
};

export default function SigningDetail() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const toast = useToast();
  const [d, setD] = useState<any>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [confirmCancel, setConfirmCancel] = useState(false);

  const load = useCallback(() => api(`/signing/${id}`).then(setD).catch((e) => setError(e.message)), [id]);
  useEffect(() => { load(); }, [load]);

  const act = async (name: string, path: string, method = "POST", ok?: string) => {
    setBusy(name);
    try {
      const r = await api(path, { method });
      const failed = (r?.delivery || []).filter((x: any) => !x.sent);
      if (failed.length) toast(`The email to ${failed.map((f: any) => f.email).join(", ")} was not delivered. Check the email settings.`, "bad");
      else if (ok) toast(ok);
      return r;
    } catch (e: any) { toast(e.message, "bad"); }
    finally { setBusy(""); }
  };

  const download = async (version: "original" | "signed") => {
    setBusy(version);
    try { const r = await api(`/signing/${id}/file?version=${version}`); window.location.href = r.url; }
    catch (e: any) { toast(e.message, "bad"); }
    finally { setBusy(""); }
  };

  if (error) return <ErrorBox message={error} />;
  if (!d) return <Loading />;
  const r = d.request;
  const byId: Record<string, string> = Object.fromEntries(d.signers.map((s: any) => [s.id, s.name]));
  const allSigned = d.signers.length > 0 && d.signers.every((s: any) => s.status === "signed");

  return (
    <>
      <PageHeader back={{ href: "/signing", label: "E-signing" }} title={r.title}
        sub={<span className="flex flex-wrap items-center gap-2"><Badge status={r.status} /> {r.document_type_label} · Ref <span className="font-mono text-[12px]">{r.reference}</span></span>}
        actions={<>
          {r.status === "completed" && <Button onClick={() => download("signed")} loading={busy === "signed"}>Download signed copy</Button>}
          <Button variant="secondary" onClick={() => download("original")} loading={busy === "original"}>Original</Button>
          {r.status === "draft" && <Button onClick={async () => { await act("send", `/signing/${id}/send`, "POST", "Sent for signature"); load(); }} loading={busy === "send"}>Send now</Button>}
          {r.status === "sent" && !allSigned && <Button variant="secondary" onClick={async () => { await act("remind", `/signing/${id}/remind`, "POST", "Reminder sent with a new link"); load(); }} loading={busy === "remind"}>Send reminder</Button>}
        </>} />

      {r.status === "sent" && allSigned && (
        <div className="mb-6"><Notice tone="warn">Everyone has signed, but sealing did not finish. <button className="font-medium underline" onClick={async () => { await act("fin", `/signing/${id}/finalize`, "POST", "Document sealed"); load(); }}>Try again</button></Notice></div>
      )}
      {r.status === "completed" && (
        <div className="mb-6"><Notice tone="ok">Signed by everyone on {fmtDateTime(r.completed_at)}. A sealed copy with a certificate of completion was emailed to all parties.</Notice></div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="space-y-6">
          <Card title="Signers" pad={false}>
            <ul className="divide-y divide-line">
              {d.signers.map((s: any) => (
                <li key={s.id} className="flex flex-wrap items-center gap-3 px-5 py-4">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium">{s.name}</div>
                    <div className="text-[13px] text-muted">{s.email}</div>
                    {s.status === "signed" && <div className="mt-1 text-[12px] text-muted">Signed {fmtDateTime(s.signed_at)} as &quot;{s.signed_name}&quot;{s.ip ? ` from ${s.ip}` : ""}</div>}
                    {s.status === "declined" && <div className="mt-1 text-[12px] text-bad">Declined: {s.decline_reason}</div>}
                  </div>
                  <Badge status={s.status} />
                </li>
              ))}
            </ul>
          </Card>
          <Card title="Audit trail" pad={false}>
            <ol className="divide-y divide-line">
              {d.events.map((e: any) => (
                <li key={e.id} className="grid gap-1 px-5 py-3 text-[13px] sm:grid-cols-[180px_1fr]">
                  <span className="num text-muted">{fmtDateTime(e.created_at)}</span>
                  <span><span className="font-medium">{EVENT[e.event] ?? e.event}</span>{e.signer_id && <span className="text-muted"> · {byId[e.signer_id]}</span>}{e.detail && <span className="text-muted"> · {e.detail}</span>}{e.ip && <span className="text-faint"> · {e.ip}</span>}</span>
                </li>
              ))}
            </ol>
          </Card>
        </div>
        <div className="space-y-6">
          <Card title="Details">
            <dl className="space-y-3 text-sm">
              {r.client && <div><dt className="text-[12px] text-faint">Client</dt><dd><Link href={`/clients/${r.client.id}`} className="hover:underline">{r.client.name}</Link></dd></div>}
              {r.matter && <div><dt className="text-[12px] text-faint">Matter</dt><dd>{r.matter.file_number} · {r.matter.title}</dd></div>}
              <div><dt className="text-[12px] text-faint">File</dt><dd>{r.original_name} · {r.page_count} page{r.page_count === 1 ? "" : "s"}</dd></div>
              <div><dt className="text-[12px] text-faint">Created</dt><dd>{fmtDateTime(r.created_at)}</dd></div>
              {r.sent_at && <div><dt className="text-[12px] text-faint">Sent</dt><dd>{fmtDateTime(r.sent_at)}</dd></div>}
              {r.expires_at && r.status === "sent" && <div><dt className="text-[12px] text-faint">Link expires</dt><dd>{fmtDate(r.expires_at)}</dd></div>}
              {r.message && <div><dt className="text-[12px] text-faint">Message</dt><dd className="whitespace-pre-line text-muted">{r.message}</dd></div>}
              <div><dt className="text-[12px] text-faint">Original fingerprint (SHA-256)</dt><dd className="break-all font-mono text-[11px] text-muted">{r.original_sha256}</dd></div>
              {r.signed_sha256 && <div><dt className="text-[12px] text-faint">Signed fingerprint (SHA-256)</dt><dd className="break-all font-mono text-[11px] text-muted">{r.signed_sha256}</dd></div>}
            </dl>
            {r.status === "completed" && <p className="mt-4 text-[12px] text-muted">Anyone can check a copy is genuine at <Link href="/verify" className="underline">{d.verify_url}</Link>.</p>}
          </Card>
          {r.status === "draft" && <button onClick={async () => { if (confirm("Delete this draft?")) { await act("del", `/signing/${id}`, "DELETE", "Draft deleted"); router.replace("/signing"); } }} className="w-full text-center text-[13px] text-muted hover:text-bad">Delete draft</button>}
          {r.status === "sent" && <button onClick={() => setConfirmCancel(true)} className="w-full text-center text-[13px] text-muted hover:text-bad">Cancel this request</button>}
        </div>
      </div>

      <Modal open={confirmCancel} onClose={() => setConfirmCancel(false)} title="Cancel this signing request?"
        footer={<><Button variant="secondary" onClick={() => setConfirmCancel(false)}>Keep it</Button><Button variant="danger" loading={busy === "cancel"} onClick={async () => { await act("cancel", `/signing/${id}/cancel`, "POST", "Request cancelled"); setConfirmCancel(false); load(); }}>Cancel request</Button></>}>
        <p className="text-sm text-ink-2">The signing links stop working straight away. Signatures already given are kept in the audit trail, but the document will not be completed.</p>
      </Modal>
    </>
  );
}

"use client";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { SignaturePad } from "@/components/SignaturePad";
import { Button, Field, Input, Notice, Spinner, Textarea } from "@/components/ui";
import { fmtDate, fmtDateTime } from "@/lib/money";
import { TestBadge, TestStrip } from "@/components/TestBadge";

type Info = {
  request: { reference: string; title: string; message: string | null; status: string; document_type: string; page_count: number; expires_at: string | null; completed_at: string | null };
  firm: { name: string; email: string | null; logo_url: string | null };
  signer: { name: string; email: string; status: string; signed_at: string | null; session_active: boolean };
  signers: { name: string; status: string }[];
};

async function call<T = any>(token: string, path: string, init: RequestInit & { json?: unknown; session?: string | null } = {}): Promise<T> {
  const headers = new Headers();
  if (init.json !== undefined) headers.set("Content-Type", "application/json");
  if (init.session) headers.set("X-Sign-Session", init.session);
  const res = await fetch(`/api/public/sign/${token}${path}`, { method: init.method, headers, body: init.json !== undefined ? JSON.stringify(init.json) : undefined, cache: "no-store" });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) { const e: any = new Error(data?.error?.message || "Something went wrong"); e.code = data?.error?.code; e.status = res.status; throw e; }
  return data;
}

export default function SignPage() {
  const { token } = useParams<{ token: string }>();
  const key = `pryse-sign-${token.slice(0, 12)}`;
  const [info, setInfo] = useState<Info | null>(null);
  const [fatal, setFatal] = useState("");
  const [session, setSession] = useState<string | null>(null);
  const [step, setStep] = useState<"intro" | "code" | "review" | "done" | "declined">("intro");
  const [sentTo, setSentTo] = useState("");
  const [code, setCode] = useState("");
  const [docUrl, setDocUrl] = useState("");
  const [reviewed, setReviewed] = useState(false);
  const [name, setName] = useState("");
  const [sig, setSig] = useState<string | null>(null);
  const [consent, setConsent] = useState(false);
  const [declining, setDeclining] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [completed, setCompleted] = useState(false);

  const loadDoc = useCallback(async (s: string) => {
    const r = await call<{ url: string }>(token, "/document", { session: s });
    setDocUrl(r.url);
  }, [token]);

  useEffect(() => {
    call<Info>(token, "").then(async (i) => {
      setInfo(i);
      setName(i.signer.name);
      if (i.signer.status === "signed") { setStep("done"); return; }
      if (i.signer.status === "declined") { setStep("declined"); return; }
      let s: string | null = null;
      try { s = sessionStorage.getItem(key); } catch { /* ignore */ }
      if (s && i.signer.session_active && i.request.status === "sent") {
        try { await loadDoc(s); setSession(s); setStep("review"); } catch { /* need a new code */ }
      }
    }).catch((e) => setFatal(e.message));
  }, [token, key, loadDoc]);

  const sendCode = async () => {
    setError(""); setBusy(true);
    try { const r = await call(token, "/otp", { method: "POST" }); setSentTo(r.sent_to); setStep("code"); }
    catch (e: any) { if (e.code === "too_soon") setStep("code"); setError(e.message); }
    finally { setBusy(false); }
  };

  const verify = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(""); setBusy(true);
    try {
      const r = await call(token, "/verify", { method: "POST", json: { code } });
      setSession(r.session);
      try { sessionStorage.setItem(key, r.session); } catch { /* ignore */ }
      await loadDoc(r.session);
      setStep("review");
    } catch (e: any) { setError(e.message); }
    finally { setBusy(false); }
  };

  const expired = (e: any) => {
    if (e.code === "verify_required") { setSession(null); setStep("intro"); setCode(""); }
    setError(e.message);
  };

  const sign = async () => {
    setError("");
    if (!reviewed) return setError("Please confirm that you have read the document.");
    if (!sig) return setError("Please draw or type your signature.");
    if (!consent) return setError("Please confirm that you agree to sign electronically.");
    setBusy(true);
    try {
      const r = await call(token, "/sign", { method: "POST", session, json: { signature_png: sig, signed_name: name, consent: true } });
      setCompleted(r.completed);
      try { sessionStorage.removeItem(key); } catch { /* ignore */ }
      setStep("done");
    } catch (e: any) { expired(e); }
    finally { setBusy(false); }
  };

  const decline = async () => {
    setError(""); setBusy(true);
    try { await call(token, "/decline", { method: "POST", session, json: { reason } }); setStep("declined"); }
    catch (e: any) { expired(e); }
    finally { setBusy(false); }
  };

  if (fatal) return <Shell><h1 className="text-xl font-semibold">This link cannot be used</h1><p className="mt-2 text-sm text-muted">{fatal}</p></Shell>;
  if (!info) return <Shell><div className="flex items-center gap-2 text-sm text-muted"><Spinner /> Loading...</div></Shell>;

  const closed = info.request.status !== "sent";
  const closedMsg: Record<string, string> = {
    cancelled: "The firm cancelled this signing request. Contact them if you think this is a mistake.",
    expired: "This signing link has expired. Ask the firm to send you a new one.",
    declined: "This document was declined and can no longer be signed.",
    completed: "Everyone has signed this document. A signed copy was emailed to you.",
    draft: "This document is not open for signing yet.",
  };

  return (
    <Shell firm={info.firm}>
      <div className="text-[12px] font-medium uppercase tracking-wider text-faint">{info.firm.name} · {info.request.document_type}</div>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight">{info.request.title}</h1>
      <p className="mt-1 text-sm text-muted">For {info.signer.name} · Ref {info.request.reference}{info.request.page_count ? ` · ${info.request.page_count} page${info.request.page_count === 1 ? "" : "s"}` : ""}</p>

      {step === "done" ? (
        <div className="mt-8 rounded-xl border border-ok/20 bg-ok-soft p-6">
          <div className="text-lg font-semibold text-ok">Thank you, you have signed</div>
          <p className="mt-1 text-sm text-ink-2">
            {completed || info.request.status === "completed"
              ? "Everyone has now signed. A sealed copy with a certificate of completion has been emailed to you."
              : `Your signature has been recorded${info.signer.signed_at ? ` on ${fmtDateTime(info.signer.signed_at)}` : ""}. Once everyone has signed, you will receive the final signed copy by email.`}
          </p>
        </div>
      ) : step === "declined" ? (
        <div className="mt-8"><Notice tone="bad">You declined to sign this document. {info.firm.name} has been told.</Notice></div>
      ) : closed ? (
        <div className="mt-8"><Notice tone={info.request.status === "completed" ? "ok" : "warn"}>{closedMsg[info.request.status] ?? "This document is not open for signing."}</Notice></div>
      ) : (
        <>
          {info.request.message && <div className="mt-6 whitespace-pre-line rounded-xl bg-soft px-4 py-3 text-sm text-ink-2">{info.request.message}</div>}

          {step === "intro" && (
            <div className="mt-8">
              <h2 className="text-[15px] font-semibold">Confirm it is you</h2>
              <p className="mt-1 text-sm text-muted">We will email a 6-digit code to {info.signer.email}. Enter it on the next screen to view and sign the document.</p>
              {error && <div className="mt-4"><Notice tone="bad">{error}</Notice></div>}
              <Button className="mt-5" onClick={sendCode} loading={busy}>Email me a code</Button>
              {info.request.expires_at && <p className="mt-4 text-[12px] text-faint">This link expires on {fmtDate(info.request.expires_at)}.</p>}
            </div>
          )}

          {step === "code" && (
            <form onSubmit={verify} className="mt-8 max-w-sm">
              <h2 className="text-[15px] font-semibold">Enter your code</h2>
              <p className="mt-1 text-sm text-muted">{sentTo ? `We sent a code to ${sentTo}.` : "Check your email for the code."} It expires in 10 minutes.</p>
              <Input inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                className="mt-4 text-center font-mono text-2xl tracking-[.5em]" placeholder="000000" autoFocus />
              {error && <div className="mt-3"><Notice tone="bad">{error}</Notice></div>}
              <div className="mt-4 flex items-center gap-4">
                <Button type="submit" loading={busy} disabled={code.length !== 6}>Continue</Button>
                <button type="button" onClick={sendCode} disabled={busy} className="text-[13px] text-muted hover:text-ink">Send a new code</button>
              </div>
            </form>
          )}

          {step === "review" && (
            <div className="mt-8 space-y-8">
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <h2 className="text-[15px] font-semibold">1. Read the document</h2>
                  {docUrl && <a href={docUrl} target="_blank" rel="noreferrer" className="text-[13px] text-muted underline hover:text-ink">Open in a new tab</a>}
                </div>
                {docUrl ? <iframe src={docUrl} title="Document" className="h-[70vh] w-full rounded-xl border border-line bg-soft" /> : <div className="flex h-40 items-center justify-center rounded-xl border border-line text-sm text-muted"><Spinner /></div>}
                <label className="mt-3 flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={reviewed} onChange={(e) => setReviewed(e.target.checked)} /> I have read the whole document.</label>
              </div>

              {!declining ? (
                <div>
                  <h2 className="mb-3 text-[15px] font-semibold">2. Sign</h2>
                  <Field label="Your full name" className="mb-4 max-w-sm"><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>
                  <SignaturePad name={name} onChange={setSig} />
                  <label className="mt-4 flex items-start gap-2 text-sm text-ink-2">
                    <input type="checkbox" className="mt-1" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
                    <span>I agree to sign this document electronically. I understand that my electronic signature is legally binding, as if I had signed by hand, under the Electronic Communications and Transactions Act 25 of 2002.</span>
                  </label>
                  {error && <div className="mt-4"><Notice tone="bad">{error}</Notice></div>}
                  <div className="mt-5 flex flex-wrap items-center gap-4">
                    <Button variant="brand" onClick={sign} loading={busy}>Sign document</Button>
                    <button onClick={() => { setDeclining(true); setError(""); }} className="text-[13px] text-muted hover:text-bad">I do not want to sign</button>
                  </div>
                </div>
              ) : (
                <div className="max-w-lg">
                  <h2 className="text-[15px] font-semibold">Decline to sign</h2>
                  <p className="mt-1 text-sm text-muted">{info.firm.name} will be told. The document cannot be signed by anyone after it is declined.</p>
                  <Field label="Reason" className="mt-4"><Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
                  {error && <div className="mt-3"><Notice tone="bad">{error}</Notice></div>}
                  <div className="mt-4 flex gap-3">
                    <Button variant="danger" onClick={decline} loading={busy}>Decline</Button>
                    <Button variant="ghost" onClick={() => setDeclining(false)}>Back</Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {info.signers.length > 1 && (
        <div className="mt-10 border-t border-line pt-5">
          <div className="text-[12px] font-medium uppercase tracking-wider text-faint">Signers</div>
          <ul className="mt-2 space-y-1 text-sm">{info.signers.map((s, i) => <li key={i} className="flex justify-between"><span>{s.name}</span><span className={s.status === "signed" ? "text-ok" : "text-muted"}>{s.status === "signed" ? "Signed" : s.status === "declined" ? "Declined" : "Waiting"}</span></li>)}</ul>
        </div>
      )}
    </Shell>
  );
}

function Shell({ children, firm }: { children: React.ReactNode; firm?: Info["firm"] }) {
  return (
    <div className="min-h-screen bg-canvas">
      <TestStrip text="This is a test signing page. Documents signed here are not legally binding." />
      <header className="border-b border-line bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-5 py-4">
          {firm?.logo_url
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={firm.logo_url} alt={firm.name} className="h-9 w-auto max-w-[180px] object-contain" />
            : <span className="text-[15px] font-semibold">{firm?.name ?? ""}</span>}
          <span className="flex items-center gap-1.5 text-[12px] text-muted">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 018 0v4" /></svg>
            Secure signing
            <TestBadge className="ml-2" />
          </span>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-5 py-10">
        <div className="rounded-2xl border border-line bg-white p-6 sm:p-9">{children}</div>
        <p className="mt-6 text-center text-[12px] text-faint">
          Powered by Pryse{firm?.email ? <> · Questions? Contact {firm.name} at <a className="underline" href={`mailto:${firm.email}`}>{firm.email}</a></> : null}
        </p>
      </main>
    </div>
  );
}

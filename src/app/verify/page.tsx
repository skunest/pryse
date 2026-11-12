"use client";
import Image from "next/image";
import { useState } from "react";
import { Notice, Spinner, cx } from "@/components/ui";
import { fmtDateTime } from "@/lib/money";
import { TestBadge, TestStrip } from "@/components/TestBadge";

type Result = { match: false } | { match: true; document: { reference: string; title: string; completed_at: string; firm: string; signers: { name: string; signed_at: string }[] } };

/** Anyone can check that a signed PDF is genuine and unchanged. The file never leaves their device. */
export default function VerifyPage() {
  const [busy, setBusy] = useState(false);
  const [hash, setHash] = useState("");
  const [name, setName] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState("");
  const [drag, setDrag] = useState(false);

  const check = async (f?: File | null) => {
    if (!f) return;
    setError(""); setResult(null); setBusy(true); setName(f.name);
    try {
      const buf = await f.arrayBuffer();
      const digest = await crypto.subtle.digest("SHA-256", buf);
      const h = Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
      setHash(h);
      const res = await fetch(`/api/public/verify?sha256=${h}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message || "Could not check the file");
      setResult(data);
    } catch (e: any) { setError(e.message); }
    finally { setBusy(false); }
  };

  return (
    <>
    <TestStrip />
    <div className="min-h-screen bg-canvas px-5 py-14">
      <div className="mx-auto max-w-xl">
        <Image src="/pryse-logo.png" alt="Pryse" width={120} height={43} className="mx-auto h-auto w-[120px]" />
        <div className="mb-10 mt-3 text-center"><TestBadge /></div>
        <div className="rounded-2xl border border-line bg-white p-7">
          <h1 className="text-xl font-semibold tracking-tight">Check a signed document</h1>
          <p className="mt-1 text-sm text-muted">Choose a PDF that was signed through Pryse. We check its fingerprint against our records. The file is not uploaded.</p>
          <label
            onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
            onDrop={(e) => { e.preventDefault(); setDrag(false); check(e.dataTransfer.files?.[0]); }}
            className={cx("mt-6 flex cursor-pointer flex-col items-center rounded-xl border-2 border-dashed px-6 py-10 text-center transition", drag ? "border-brand bg-brand-soft" : "border-line hover:border-ink-2")}>
            <input type="file" accept="application/pdf,.pdf" className="hidden" onChange={(e) => check(e.target.files?.[0])} />
            {busy ? <span className="flex items-center gap-2 text-sm text-muted"><Spinner /> Checking...</span>
              : <><span className="text-sm font-medium">{name || "Drop the signed PDF here, or click to choose"}</span><span className="mt-1 text-[12px] text-muted">PDF files only</span></>}
          </label>
          {error && <div className="mt-5"><Notice tone="bad">{error}</Notice></div>}
          {result && (result.match ? (
            <div className="mt-6 rounded-xl border border-ok/20 bg-ok-soft p-5 text-sm">
              <div className="font-semibold text-ok">Genuine and unchanged</div>
              <p className="mt-1 text-ink-2">This is the exact file sealed by Pryse for <strong>{result.document.firm}</strong>.</p>
              <dl className="mt-3 space-y-1 text-[13px]">
                <div><span className="text-muted">Document:</span> {result.document.title}</div>
                <div><span className="text-muted">Reference:</span> {result.document.reference}</div>
                <div><span className="text-muted">Completed:</span> {fmtDateTime(result.document.completed_at)}</div>
                {result.document.signers.map((s, i) => <div key={i}><span className="text-muted">Signed by:</span> {s.name}, {fmtDateTime(s.signed_at)}</div>)}
              </dl>
            </div>
          ) : (
            <div className="mt-6"><Notice tone="warn">No match. This file was not sealed by Pryse, or it has been changed since it was signed. Even re-saving or printing to PDF changes the fingerprint, so compare with the copy that was emailed to you.</Notice></div>
          ))}
          {hash && <p className="mt-4 break-all font-mono text-[11px] text-faint">SHA-256: {hash}</p>}
        </div>
      </div>
    </div>
    </>
  );
}

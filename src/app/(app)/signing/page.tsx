"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "@/lib/browser";
import { fmtDate } from "@/lib/money";
import { useSession, canBill } from "@/components/AppShell";
import { Badge, Button, Empty, ErrorBox, Loading, PageHeader, Table, cx } from "@/components/ui";

const TABS = [{ v: "", label: "All" }, { v: "sent", label: "Awaiting" }, { v: "completed", label: "Signed" }, { v: "draft", label: "Drafts" }, { v: "declined", label: "Declined" }, { v: "cancelled", label: "Cancelled" }];

export default function SigningPage() {
  const router = useRouter();
  const { firm } = useSession();
  const [status, setStatus] = useState("");
  const [rows, setRows] = useState<any[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    setRows(null);
    api(`/signing${status ? `?status=${status}` : ""}`).then((r) => setRows(r.requests)).catch((e) => setError(e.message));
  }, [status]);

  return (
    <>
      <PageHeader title="E-signing" sub="Send documents to clients to sign electronically, with a full audit trail."
        actions={canBill(firm.role) && <Button href="/signing/new">Send for signature</Button>} />
      <div className="mb-4 flex flex-wrap gap-1 rounded-lg bg-soft p-1 w-fit">
        {TABS.map((t) => (
          <button key={t.v} onClick={() => setStatus(t.v)} className={cx("rounded-md px-3 py-1.5 text-[13px] transition", status === t.v ? "bg-white font-medium shadow-sm" : "text-muted hover:text-ink")}>{t.label}</button>
        ))}
      </div>
      {error && <ErrorBox message={error} />}
      {!rows && !error && <Loading />}
      {rows && rows.length === 0 && (status
        ? <Empty title="Nothing here" sub="No signing requests with this status." />
        : <Empty title="No documents sent yet" sub="Upload a PDF, add the people who must sign, and Pryse emails each of them a secure signing link." action={canBill(firm.role) && <Button href="/signing/new">Send a document</Button>} />)}
      {rows && rows.length > 0 && (
        <Table head={["Document", "Client", "Signers", "Sent", "Status"]}>
          {rows.map((r) => {
            const signed = r.signers.filter((s: any) => s.status === "signed").length;
            return (
              <tr key={r.id} className="cursor-pointer hover:bg-soft/60" onClick={() => router.push(`/signing/${r.id}`)}>
                <td className="px-4 py-3"><Link href={`/signing/${r.id}`} className="font-medium">{r.title}</Link></td>
                <td className="px-4 py-3 text-muted">{r.client?.name ?? "-"}</td>
                <td className="px-4 py-3 text-muted"><span className="num">{signed}/{r.signers.length}</span> <span className="hidden sm:inline">· {r.signers.map((s: any) => s.name).join(", ")}</span></td>
                <td className="px-4 py-3 text-muted">{r.sent_at ? fmtDate(r.sent_at) : "-"}</td>
                <td className="px-4 py-3"><Badge status={r.status} /></td>
              </tr>
            );
          })}
        </Table>
      )}
    </>
  );
}

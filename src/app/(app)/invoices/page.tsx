"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "@/lib/browser";
import { rand, fmtDate } from "@/lib/money";
import { useSession, canBill } from "@/components/AppShell";
import { Badge, Button, Empty, ErrorBox, Input, Loading, PageHeader, Table, cx } from "@/components/ui";

const TABS = [
  { v: "", label: "All" }, { v: "draft", label: "Drafts" }, { v: "outstanding", label: "Unpaid" },
  { v: "overdue", label: "Overdue" }, { v: "paid", label: "Paid" }, { v: "void", label: "Void" },
];

export default function InvoicesPage() {
  const router = useRouter();
  const { firm } = useSession();
  const [status, setStatus] = useState("");
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<any[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const t = setTimeout(() => {
      setRows(null);
      api(`/invoices?status=${status}&q=${encodeURIComponent(q)}`).then((r) => setRows(r.invoices)).catch((e) => setError(e.message));
    }, q ? 250 : 0);
    return () => clearTimeout(t);
  }, [status, q]);

  const total = (rows ?? []).filter((i) => i.status !== "void").reduce((a, i) => a + i.total_cents, 0);
  const owed = (rows ?? []).filter((i) => ["issued", "partially_paid"].includes(i.status)).reduce((a, i) => a + i.total_cents - i.paid_cents, 0);

  return (
    <>
      <PageHeader title="Invoices" sub={rows && rows.length ? <>Showing {rows.length} · Total <span className="num">{rand(total)}</span>{owed > 0 && <> · Unpaid <span className="num">{rand(owed)}</span></>}</> : "Fee notes and tax invoices for your clients."}
        actions={canBill(firm.role) && <Button href="/invoices/new">New invoice</Button>} />
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1 rounded-lg bg-soft p-1">
          {TABS.map((t) => (
            <button key={t.v} onClick={() => setStatus(t.v)} className={cx("rounded-md px-3 py-1.5 text-[13px] transition", status === t.v ? "bg-white font-medium shadow-sm" : "text-muted hover:text-ink")}>{t.label}</button>
          ))}
        </div>
        <Input placeholder="Search invoice number" value={q} onChange={(e) => setQ(e.target.value)} className="max-w-[240px]" />
      </div>
      {error && <ErrorBox message={error} />}
      {!rows && !error && <Loading />}
      {rows && rows.length === 0 && (status || q
        ? <Empty title="No invoices match" sub="Try another filter." />
        : <Empty title="No invoices yet" sub="Create your first invoice. You can save it as a draft and issue it when it is ready." action={canBill(firm.role) && <Button href="/invoices/new">Create an invoice</Button>} />)}
      {rows && rows.length > 0 && (
        <Table head={["Number", "Client", "Matter", "Issued", "Due", { label: "Total", right: true }, { label: "Balance", right: true }, "Sent to client", "Status"]}>
          {rows.map((i) => (
            <tr key={i.id} className="cursor-pointer hover:bg-soft/60" onClick={() => router.push(`/invoices/${i.id}`)}>
              <td className="num px-4 py-3 font-medium"><Link href={`/invoices/${i.id}`}>{i.number ?? <span className="text-muted">Draft</span>}</Link></td>
              <td className="px-4 py-3">{i.client?.name}</td>
              <td className="px-4 py-3 text-muted">{i.matter?.file_number ?? "-"}</td>
              <td className="whitespace-nowrap px-4 py-3 text-muted">{i.issue_date ? fmtDate(i.issue_date) : "-"}</td>
              <td className={cx("whitespace-nowrap px-4 py-3", i.overdue ? "text-bad" : "text-muted")}>{i.due_date ? fmtDate(i.due_date) : "-"}</td>
              <td className="num px-4 py-3 text-right">{rand(i.total_cents)}</td>
              <td className="num px-4 py-3 text-right">{i.status === "void" || i.status === "draft" ? "-" : rand(i.total_cents - i.paid_cents)}</td>
              <td className="px-4 py-3"><SentCell inv={i} /></td>
              <td className="px-4 py-3"><Badge status={i.status} overdue={i.overdue} /></td>
            </tr>
          ))}
        </Table>
      )}
    </>
  );
}

function SentCell({ inv }: { inv: any }) {
  if (inv.status === "draft") return <span className="text-faint">-</span>;
  if (!inv.emailed_at) return <span className="inline-flex items-center gap-1 rounded-full bg-warn-soft px-2 py-0.5 text-[12px] font-medium text-warn">Not sent</span>;
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-ok-soft px-2 py-0.5 text-[12px] font-medium text-ok" title={inv.last_emailed_to ? `Last sent to ${inv.last_emailed_to}` : undefined}>
      ✓ {fmtDate(inv.emailed_at)}{inv.email_count > 1 ? ` (${inv.email_count}×)` : ""}
    </span>
  );
}

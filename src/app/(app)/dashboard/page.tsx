"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/browser";
import { rand, fmtDate } from "@/lib/money";
import { useSession, canBill } from "@/components/AppShell";
import { Badge, Button, Card, ErrorBox, Loading, PageHeader, Stat } from "@/components/ui";

export default function Dashboard() {
  const { firm } = useSession();
  const [d, setD] = useState<any>(null);
  const [error, setError] = useState("");
  useEffect(() => { api("/dashboard").then(setD).catch((e) => setError(e.message)); }, []);

  const hour = Number(new Date().toLocaleString("en-ZA", { hour: "numeric", hour12: false, timeZone: "Africa/Johannesburg" }));
  const greet = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  return (
    <>
      <PageHeader title={greet} sub={firm.name} actions={canBill(firm.role) && <>
        <Button variant="secondary" href="/signing/new">Send for signature</Button>
        <Button href="/invoices/new">New invoice</Button>
      </>} />
      {error && <ErrorBox message={error} />}
      {!d && !error && <Loading />}
      {d && (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Outstanding" value={rand(d.invoices.outstanding_cents)} sub={`${d.invoices.outstanding_count} unpaid invoice${d.invoices.outstanding_count === 1 ? "" : "s"}`} />
            <Stat label="Overdue" value={rand(d.invoices.overdue_cents)} tone={d.invoices.overdue_count ? "bad" : undefined} sub={`${d.invoices.overdue_count} past due date`} />
            <Stat label="Received this month" value={rand(d.invoices.received_this_month_cents)} tone="ok" sub={d.invoices.drafts ? `${d.invoices.drafts} draft${d.invoices.drafts === 1 ? "" : "s"} not yet issued` : "Payments recorded"} />
            <Stat label="Awaiting signature" value={d.signing.awaiting} sub={`${d.signing.completed_this_month} signed this month`} />
          </div>
          <div className="grid gap-6 lg:grid-cols-2">
            <Card title="Recent invoices" pad={false} actions={<Link href="/invoices" className="text-[13px] text-muted hover:text-ink">View all</Link>}>
              {d.invoices.recent.length === 0 ? <p className="px-5 py-8 text-center text-sm text-muted">No invoices yet.</p> : (
                <ul className="divide-y divide-line">
                  {d.invoices.recent.map((i: any) => (
                    <li key={i.id}><Link href={`/invoices/${i.id}`} className="flex items-center gap-4 px-5 py-3.5 hover:bg-soft/60">
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium">{i.client?.name}</div>
                        <div className="text-[12px] text-muted">{i.number ?? "Draft"}{i.issue_date ? ` · ${fmtDate(i.issue_date)}` : ""}</div>
                      </div>
                      <div className="num text-sm font-medium">{rand(i.total_cents)}</div>
                      <Badge status={i.status} overdue={i.overdue} />
                    </Link></li>
                  ))}
                </ul>
              )}
            </Card>
            <Card title="Recent signing requests" pad={false} actions={<Link href="/signing" className="text-[13px] text-muted hover:text-ink">View all</Link>}>
              {d.signing.recent.length === 0 ? <p className="px-5 py-8 text-center text-sm text-muted">No documents sent for signature yet.</p> : (
                <ul className="divide-y divide-line">
                  {d.signing.recent.map((s: any) => {
                    const signed = (s.signers || []).filter((x: any) => x.status === "signed").length;
                    return (
                      <li key={s.id}><Link href={`/signing/${s.id}`} className="flex items-center gap-4 px-5 py-3.5 hover:bg-soft/60">
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-medium">{s.title}</div>
                          <div className="text-[12px] text-muted">{signed} of {(s.signers || []).length} signed</div>
                        </div>
                        <Badge status={s.status} />
                      </Link></li>
                    );
                  })}
                </ul>
              )}
            </Card>
          </div>
        </div>
      )}
    </>
  );
}

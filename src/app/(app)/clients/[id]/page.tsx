"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/browser";
import { rand, fmtDate } from "@/lib/money";
import { ClientModal, MatterModal } from "@/components/ClientForm";
import { useSession, canBill } from "@/components/AppShell";
import { Badge, Button, Card, ErrorBox, Loading, PageHeader, useToast } from "@/components/ui";

export default function ClientPage() {
  const { id } = useParams<{ id: string }>();
  const { firm } = useSession();
  const toast = useToast();
  const [d, setD] = useState<any>(null);
  const [error, setError] = useState("");
  const [edit, setEdit] = useState(false);
  const [newMatter, setNewMatter] = useState(false);

  const load = useCallback(() => api(`/clients/${id}`).then(setD).catch((e) => setError(e.message)), [id]);
  useEffect(() => { load(); }, [load]);

  const toggleArchive = async () => {
    await api(`/clients/${id}`, { method: "PATCH", json: { archived: !d.client.archived } });
    toast(d.client.archived ? "Client restored" : "Client archived");
    load();
  };
  const closeMatter = async (m: any) => {
    await api(`/matters/${m.id}`, { method: "PATCH", json: { status: m.status === "open" ? "closed" : "open" } });
    load();
  };

  if (error) return <ErrorBox message={error} />;
  if (!d) return <Loading />;
  const c = d.client;
  const owed = d.invoices.filter((i: any) => ["issued", "partially_paid"].includes(i.status)).reduce((a: number, i: any) => a + i.total_cents - i.paid_cents, 0);

  return (
    <>
      <PageHeader back={{ href: "/clients", label: "Clients" }} title={c.name}
        sub={<>{c.archived && <span className="mr-2"><Badge status="void" /></span>}{owed > 0 ? <>Owes <span className="num font-medium text-ink">{rand(owed)}</span></> : "Nothing outstanding"}</>}
        actions={<>
          <Button variant="ghost" onClick={toggleArchive}>{c.archived ? "Restore" : "Archive"}</Button>
          <Button variant="secondary" onClick={() => setEdit(true)}>Edit</Button>
          {canBill(firm.role) && <Button variant="secondary" href={`/signing/new?client=${id}`}>Send for signature</Button>}
          {canBill(firm.role) && <Button href={`/invoices/new?client=${id}`}>New invoice</Button>}
        </>} />

      <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
        <Card title="Details">
          <dl className="space-y-3 text-sm">
            {[["Email", c.email], ["Phone", c.phone], [c.type === "individual" ? "ID number" : "Registration number", c.id_or_reg_number], ["VAT number", c.vat_number], ["Address", c.address], ["Notes", c.notes]].map(([k, v]) => (
              <div key={k as string}><dt className="text-[12px] text-faint">{k}</dt><dd className="whitespace-pre-line">{v || "-"}</dd></div>
            ))}
          </dl>
        </Card>
        <div className="space-y-6">
          <Card title="Matters" pad={false} actions={<Button size="sm" variant="secondary" onClick={() => setNewMatter(true)}>Add matter</Button>}>
            {d.matters.length === 0 ? <p className="px-5 py-6 text-sm text-muted">No matters yet. Matters are optional, but help group invoices and documents.</p> : (
              <ul className="divide-y divide-line">{d.matters.map((m: any) => (
                <li key={m.id} className="flex items-center gap-3 px-5 py-3">
                  <span className="num w-28 shrink-0 text-[13px] text-muted">{m.file_number}</span>
                  <span className="min-w-0 flex-1 truncate text-sm">{m.title}{m.practice_area && <span className="text-muted"> · {m.practice_area}</span>}</span>
                  <Badge status={m.status} />
                  <button onClick={() => closeMatter(m)} className="text-[12px] text-muted hover:text-ink">{m.status === "open" ? "Close" : "Reopen"}</button>
                </li>))}</ul>
            )}
          </Card>
          <Card title="Invoices" pad={false}>
            {d.invoices.length === 0 ? <p className="px-5 py-6 text-sm text-muted">No invoices yet.</p> : (
              <ul className="divide-y divide-line">{d.invoices.map((i: any) => (
                <li key={i.id}><Link href={`/invoices/${i.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-soft/60">
                  <span className="num w-28 shrink-0 text-[13px] font-medium">{i.number ?? "Draft"}</span>
                  <span className="flex-1 text-[13px] text-muted">{i.issue_date ? fmtDate(i.issue_date) : "Not issued"}</span>
                  <span className="num text-sm">{rand(i.total_cents)}</span>
                  <Badge status={i.status} />
                </Link></li>))}</ul>
            )}
          </Card>
          <Card title="Documents for signature" pad={false}>
            {d.signing.length === 0 ? <p className="px-5 py-6 text-sm text-muted">No documents sent for signature yet.</p> : (
              <ul className="divide-y divide-line">{d.signing.map((s: any) => (
                <li key={s.id}><Link href={`/signing/${s.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-soft/60">
                  <span className="min-w-0 flex-1 truncate text-sm">{s.title}</span>
                  <span className="text-[12px] text-muted">{fmtDate(s.created_at)}</span>
                  <Badge status={s.status} />
                </Link></li>))}</ul>
            )}
          </Card>
        </div>
      </div>
      {edit && <ClientModal open client={c} onClose={() => setEdit(false)} onSaved={() => { setEdit(false); toast("Client saved"); load(); }} />}
      <MatterModal open={newMatter} clientId={id} onClose={() => setNewMatter(false)} onSaved={() => { setNewMatter(false); toast("Matter added"); load(); }} />
    </>
  );
}

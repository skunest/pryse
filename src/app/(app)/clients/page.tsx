"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "@/lib/browser";
import { ClientModal, type Client } from "@/components/ClientForm";
import { Button, Empty, ErrorBox, Input, Loading, PageHeader, Table } from "@/components/ui";

const TYPE: Record<string, string> = { individual: "Individual", company: "Company", trust: "Trust", other: "Other" };

export default function ClientsPage() {
  const router = useRouter();
  const [rows, setRows] = useState<Client[] | null>(null);
  const [q, setQ] = useState("");
  const [archived, setArchived] = useState(false);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => {
      api<{ clients: Client[] }>(`/clients?q=${encodeURIComponent(q)}&archived=${archived}`).then((r) => setRows(r.clients)).catch((e) => setError(e.message));
    }, 200);
    return () => clearTimeout(t);
  }, [q, archived]);

  return (
    <>
      <PageHeader title="Clients" sub="The people and companies you invoice and send documents to." actions={<Button onClick={() => setOpen(true)}>New client</Button>} />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Input placeholder="Search by name, email or ID number" value={q} onChange={(e) => setQ(e.target.value)} className="max-w-sm" />
        <label className="flex items-center gap-2 text-sm text-muted"><input type="checkbox" checked={archived} onChange={(e) => setArchived(e.target.checked)} /> Show archived</label>
      </div>
      {error && <ErrorBox message={error} />}
      {!rows && !error && <Loading />}
      {rows && rows.length === 0 && (q || archived
        ? <Empty title="No clients found" sub="Try a different search." />
        : <Empty title="No clients yet" sub="Add your first client to start invoicing and sending documents for signature." action={<Button onClick={() => setOpen(true)}>Add a client</Button>} />)}
      {rows && rows.length > 0 && (
        <Table head={["Name", "Type", "Email", "Phone", "ID / Reg no."]}>
          {rows.map((c) => (
            <tr key={c.id} className="cursor-pointer hover:bg-soft/60" onClick={() => router.push(`/clients/${c.id}`)}>
              <td className="px-4 py-3 font-medium"><Link href={`/clients/${c.id}`}>{c.name}</Link></td>
              <td className="px-4 py-3 text-muted">{TYPE[c.type] ?? c.type}</td>
              <td className="px-4 py-3 text-muted">{c.email || "-"}</td>
              <td className="px-4 py-3 text-muted">{c.phone || "-"}</td>
              <td className="px-4 py-3 text-muted">{c.id_or_reg_number || "-"}</td>
            </tr>
          ))}
        </Table>
      )}
      <ClientModal open={open} onClose={() => setOpen(false)} onSaved={(c) => { setOpen(false); router.push(`/clients/${c.id}`); }} />
    </>
  );
}

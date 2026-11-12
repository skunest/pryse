"use client";
import { useState } from "react";
import { api } from "@/lib/browser";
import { Button, Field, Input, Modal, Notice, Select, Textarea } from "./ui";

export type Client = {
  id: string; type: string; name: string; id_or_reg_number: string | null; vat_number: string | null;
  email: string | null; phone: string | null; address: string | null; notes: string | null; archived?: boolean;
};

const blank = { type: "individual", name: "", id_or_reg_number: "", vat_number: "", email: "", phone: "", address: "", notes: "" };

export function ClientModal({ open, onClose, onSaved, client }: { open: boolean; onClose: () => void; onSaved: (c: Client) => void; client?: Client | null }) {
  const [f, setF] = useState<Record<string, string>>(() => client ? Object.fromEntries(Object.entries({ ...blank, ...client }).map(([k, v]) => [k, (v ?? "") as string])) : blank);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF((x) => ({ ...x, [k]: e.target.value }));

  const save = async () => {
    setError(""); setSaving(true);
    try {
      const payload = { type: f.type, name: f.name, id_or_reg_number: f.id_or_reg_number, vat_number: f.vat_number, email: f.email, phone: f.phone, address: f.address, notes: f.notes };
      const r = client
        ? await api<{ client: Client }>(`/clients/${client.id}`, { method: "PATCH", json: payload })
        : await api<{ client: Client }>("/clients", { method: "POST", json: payload });
      onSaved(r.client);
      if (!client) setF(blank);
    } catch (e: any) { setError(e.message); }
    finally { setSaving(false); }
  };

  const company = f.type === "company" || f.type === "trust";
  return (
    <Modal open={open} onClose={onClose} title={client ? "Edit client" : "New client"} wide
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={save} loading={saving}>{client ? "Save changes" : "Add client"}</Button></>}>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Type"><Select value={f.type} onChange={set("type")}>
          <option value="individual">Individual</option><option value="company">Company</option><option value="trust">Trust</option><option value="other">Other</option>
        </Select></Field>
        <Field label={company ? "Registered name" : "Full name"} className="sm:col-span-2"><Input value={f.name} onChange={set("name")} autoFocus /></Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={company ? "Registration number" : "ID number"}><Input value={f.id_or_reg_number} onChange={set("id_or_reg_number")} /></Field>
        <Field label="VAT number" hint="Printed on tax invoices. Required on invoices over R5 000 for VAT-registered clients."><Input value={f.vat_number} onChange={set("vat_number")} /></Field>
        <Field label="Email" hint="Invoices are emailed here."><Input type="email" value={f.email} onChange={set("email")} /></Field>
        <Field label="Phone"><Input value={f.phone} onChange={set("phone")} /></Field>
      </div>
      <Field label="Address" hint="Printed on invoices."><Textarea rows={3} value={f.address} onChange={set("address")} /></Field>
      <Field label="Notes (internal)"><Textarea rows={2} value={f.notes} onChange={set("notes")} /></Field>
      {error && <Notice tone="bad">{error}</Notice>}
    </Modal>
  );
}

export function MatterModal({ open, onClose, onSaved, clientId }: { open: boolean; onClose: () => void; onSaved: (m: any) => void; clientId: string }) {
  const [title, setTitle] = useState("");
  const [area, setArea] = useState("");
  const [fileNo, setFileNo] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const save = async () => {
    setError(""); setSaving(true);
    try {
      const r = await api<{ matter: any }>("/matters", { method: "POST", json: { client_id: clientId, title, practice_area: area || null, file_number: fileNo || undefined } });
      onSaved(r.matter); setTitle(""); setArea(""); setFileNo("");
    } catch (e: any) { setError(e.message); }
    finally { setSaving(false); }
  };
  return (
    <Modal open={open} onClose={onClose} title="New matter"
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={save} loading={saving}>Add matter</Button></>}>
      <Field label="Matter description"><Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Divorce: Smith v Smith" autoFocus /></Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Practice area"><Select value={area} onChange={(e) => setArea(e.target.value)}>
          <option value="">Choose...</option>
          {["Litigation", "Road Accident Fund", "Family law", "Labour law", "Commercial", "Conveyancing", "Estates and wills", "Debt collection", "Criminal", "Other"].map((a) => <option key={a}>{a}</option>)}
        </Select></Field>
        <Field label="File number" hint="Leave blank to number it automatically."><Input value={fileNo} onChange={(e) => setFileNo(e.target.value)} /></Field>
      </div>
      {error && <Notice tone="bad">{error}</Notice>}
    </Modal>
  );
}

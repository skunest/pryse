import { route, json, must } from "@/lib/http";
import { requireFirm } from "@/lib/auth";
import { withOverdue } from "@/lib/invoices";

export const GET = route(async (req) => {
  const ctx = await requireFirm(req);
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Johannesburg" });
  const monthStart = today.slice(0, 8) + "01";
  const [open, payments, drafts, signing, recentInv] = await Promise.all([
    ctx.db.from("invoices").select("id, total_cents, paid_cents, status, due_date").eq("firm_id", ctx.firmId).in("status", ["issued", "partially_paid"]),
    ctx.db.from("payments").select("amount_cents").eq("firm_id", ctx.firmId).gte("paid_on", monthStart),
    ctx.db.from("invoices").select("id", { count: "exact", head: true }).eq("firm_id", ctx.firmId).eq("status", "draft"),
    ctx.db.from("signing_requests").select("id, title, status, sent_at, completed_at, signers(name, status)").eq("firm_id", ctx.firmId).order("created_at", { ascending: false }).limit(50),
    ctx.db.from("invoices").select("id, number, status, issue_date, due_date, total_cents, paid_cents, created_at, client:clients(name)").eq("firm_id", ctx.firmId).order("created_at", { ascending: false }).limit(6),
  ]);
  const openRows = (must(open) as any[]).map(withOverdue);
  const sign = must(signing) as any[];
  const owed = (rows: any[]) => rows.reduce((a, r) => a + Number(r.total_cents) - Number(r.paid_cents), 0);
  return json({
    invoices: {
      outstanding_cents: owed(openRows),
      outstanding_count: openRows.length,
      overdue_cents: owed(openRows.filter((r) => r.overdue)),
      overdue_count: openRows.filter((r) => r.overdue).length,
      received_this_month_cents: (must(payments) as any[]).reduce((a, p) => a + Number(p.amount_cents), 0),
      drafts: drafts.count ?? 0,
      recent: (must(recentInv) as any[]).map(withOverdue),
    },
    signing: {
      awaiting: sign.filter((s) => s.status === "sent").length,
      completed_this_month: sign.filter((s) => s.status === "completed" && s.completed_at >= monthStart).length,
      recent: sign.slice(0, 6),
    },
  });
});

import { z } from "zod";
import { route, json, must, body, badRequest } from "@/lib/http";
import { requireFirm, BILLING_ROLES } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { invoicePdf } from "@/lib/invoices";
import { sendEmail, layout, esc } from "@/lib/email";
import { rand, fmtDate } from "@/lib/money";

const schema = z.object({
  to: z.string().trim().email().optional(),
  message: z.string().trim().max(2000).optional(),
});

/** Email the invoice PDF to the client. */
export const POST = route<{ id: string }>(async (req, { id }) => {
  const ctx = await requireFirm(req, BILLING_ROLES);
  const input = schema.parse(await body(req));
  const { pdf, invoice, firm, client } = await invoicePdf(ctx.db, ctx.firmId, id);
  if (invoice.status === "draft") throw badRequest("Issue the invoice before emailing it");
  if (invoice.status === "void") throw badRequest("A void invoice cannot be emailed");
  const to = input.to || client.email;
  if (!to) throw badRequest("This client has no email address. Add one or enter an address.");
  const firmName = firm.legal_name || firm.name;
  const result = await sendEmail({
    to, replyTo: firm.email, fromName: firmName,
    subject: `Invoice ${invoice.number} from ${firmName}`,
    html: layout({
      firm: firmName,
      heading: `Invoice ${invoice.number}`,
      body: `<p>Dear ${esc(client.name)},</p>
        ${input.message ? `<p>${esc(input.message).replace(/\n/g, "<br>")}</p>` : `<p>Please find attached invoice ${esc(invoice.number)}.</p>`}
        <p><strong>Amount due:</strong> ${esc(rand(invoice.total_cents - invoice.paid_cents))}<br>
        <strong>Due date:</strong> ${esc(fmtDate(invoice.due_date))}</p>
        <p>Kind regards,<br>${esc(firmName)}</p>`,
      footer: firm.email ? `Questions? Reply to this email or contact ${esc(firm.email)}.` : undefined,
    }),
    attachments: [{ filename: `${invoice.number}.pdf`, content: pdf }],
  });
  if (!result.sent) throw badRequest(result.error || "The email could not be sent");
  must(await ctx.db.from("invoices").update({ emailed_at: new Date().toISOString() }).eq("firm_id", ctx.firmId).eq("id", id));
  await audit(ctx, req, "invoice", id, "emailed", { to });
  return json({ ok: true, to });
});

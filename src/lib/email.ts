import "server-only";
import { IS_TESTING, TEST_LABEL, TEST_NOTE } from "./env";

type Attachment = { filename: string; content: Buffer | Uint8Array };

export type Email = {
  to: string | string[];
  subject: string;
  html: string;
  replyTo?: string | null;
  fromName?: string | null;
  attachments?: Attachment[];
};

/** Sends email through Resend. Without RESEND_API_KEY, logs and skips. */
export async function sendEmail(e: Email): Promise<{ sent: boolean; id?: string; error?: string }> {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.warn(`[email] RESEND_API_KEY not set. Skipped "${e.subject}" to ${e.to}`);
    return { sent: false, error: "Email is not configured" };
  }
  const base = process.env.EMAIL_FROM || "Pryse <no-reply@skun.co.za>";
  const address = base.match(/<(.+)>/)?.[1] ?? base;
  const from = e.fromName ? `${e.fromName.replace(/[<>"]/g, "")} <${address}>` : base;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from,
      to: Array.isArray(e.to) ? e.to : [e.to],
      subject: IS_TESTING ? `[${TEST_LABEL}] ${e.subject}` : e.subject,
      html: e.html,
      reply_to: e.replyTo || undefined,
      attachments: e.attachments?.map((a) => ({
        filename: a.filename,
        content: Buffer.from(a.content).toString("base64"),
      })),
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    console.error("[email] Resend error", res.status, text);
    return { sent: false, error: "The email could not be sent" };
  }
  const data = (await res.json()) as { id?: string };
  return { sent: true, id: data.id };
}

export function esc(s: unknown) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

/** A plain, professional email layout. */
export function layout(opts: { firm: string; heading: string; body: string; button?: { label: string; url: string }; footer?: string }) {
  const btn = opts.button
    ? `<p style="margin:28px 0"><a href="${esc(opts.button.url)}" style="background:#111111;color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:6px;font-weight:600;display:inline-block">${esc(opts.button.label)}</a></p>`
    : "";
  return `<!doctype html><html><body style="margin:0;background:#f5f5f5;font-family:Arial,Helvetica,sans-serif;color:#222">
<table width="100%" cellpadding="0" cellspacing="0" style="padding:32px 12px"><tr><td align="center">
<table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:10px;padding:32px">
<tr><td>
${IS_TESTING ? `<p style="background:#FE9132;color:#111;font-size:12px;font-weight:700;letter-spacing:.1em;padding:8px 12px;border-radius:6px;margin:0 0 18px">${TEST_LABEL}<span style="font-weight:400;letter-spacing:0"> &middot; ${esc(TEST_NOTE)}</span></p>` : ""}
<p style="font-size:13px;letter-spacing:.08em;color:#888;margin:0 0 18px;text-transform:uppercase">${esc(opts.firm)}</p>
<h1 style="font-size:20px;margin:0 0 16px;color:#111">${esc(opts.heading)}</h1>
<div style="font-size:15px;line-height:1.6">${opts.body}</div>
${btn}
<p style="font-size:12px;color:#999;margin-top:28px;border-top:1px solid #eee;padding-top:14px">${opts.footer ?? "Sent with Pryse"}</p>
</td></tr></table></td></tr></table></body></html>`;
}

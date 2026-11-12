import "server-only";
import { adminDb } from "./supabase";
import { siteUrl } from "./site";
import { sendEmail, layout, esc } from "./email";

/**
 * Invite and password emails are sent by Pryse through Resend, not by Supabase.
 * Supabase's built-in mailer only allows a couple of emails an hour, so inviting
 * a team through it fails after the first one or two. Here Supabase only creates
 * a secure one-time link (no email, no hourly limit) and Pryse emails it.
 */

type LinkType = "invite" | "magiclink" | "recovery";

async function oneTimeLink(type: LinkType, email: string, data?: Record<string, unknown>) {
  const admin = adminDb();
  const res = type === "invite"
    ? await admin.auth.admin.generateLink({ type: "invite", email, options: { data, redirectTo: `${siteUrl()}/auth/confirm` } })
    : await admin.auth.admin.generateLink({ type, email, options: { redirectTo: `${siteUrl()}/auth/confirm` } });
  if (res.error) return { error: res.error.message } as const;
  const hash = res.data.properties?.hashed_token;
  if (!hash) return { error: "Supabase did not return a link" } as const;
  return { userId: res.data.user?.id ?? null, url: `${siteUrl()}/auth/confirm?token_hash=${encodeURIComponent(hash)}&type=${type}` } as const;
}

/**
 * Creates (or finds) the account and emails a link to choose a password.
 * Returns the link as well, so an administrator can share it another way if email fails.
 */
export async function sendInvite(o: { email: string; fullName?: string | null; firmName: string; invitedBy?: string | null }) {
  let link = await oneTimeLink("invite", o.email, { full_name: o.fullName ?? null });
  // Already has an account (for example a pending invite): send a sign-in link instead.
  if ("error" in link && /already|registered|exists/i.test(link.error ?? "")) link = await oneTimeLink("magiclink", o.email);
  if ("error" in link) throw new Error(link.error);

  const mail = await sendEmail({
    to: o.email,
    subject: `You have been invited to Pryse by ${o.firmName}`,
    html: layout({
      firm: o.firmName,
      heading: "You have been invited to Pryse",
      body: `<p>${o.fullName ? `Dear ${esc(o.fullName)},` : "Hello,"}</p>
        <p>${o.invitedBy ? `${esc(o.invitedBy)} has` : `${esc(o.firmName)} has`} invited you to Pryse, the firm's system for invoicing and e-signing.</p>
        <p>Click below to choose your password. The link works once and expires after a while for your security. If it has expired, ask for a new invite.</p>`,
      button: { label: "Accept invite", url: link.url },
      footer: "If you were not expecting this, you can ignore this email.",
    }),
  });
  return { userId: link.userId, url: link.url, sent: mail.sent, error: mail.error };
}

/** Emails a password reset link. Says nothing about whether the account exists. */
export async function sendPasswordReset(email: string) {
  const link = await oneTimeLink("recovery", email);
  if ("error" in link) return; // unknown email: stay silent
  await sendEmail({
    to: email,
    subject: "Reset your Pryse password",
    html: layout({
      firm: "Pryse",
      heading: "Reset your password",
      body: "<p>Click below to choose a new password for Pryse. The link works once.</p>",
      button: { label: "Reset password", url: link.url },
      footer: "If you did not ask for this, you can ignore this email. Your password will not change.",
    }),
  });
}

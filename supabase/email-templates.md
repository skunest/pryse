# Supabase email templates for Pryse

Paste these in Supabase → Authentication → Emails. They send people to Pryse's `/auth/confirm` page, which signs them in and asks them to choose a password.

## Invite user

**Subject:** You have been invited to Pryse

```html
<div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#222">
  <p style="font-size:13px;letter-spacing:.08em;color:#888;text-transform:uppercase;margin:0 0 16px">Pryse</p>
  <h2 style="font-size:20px;margin:0 0 12px;color:#111">You have been invited to Pryse</h2>
  <p style="font-size:15px;line-height:1.6">Your firm has invited you to Pryse, its system for invoicing and e-signing. Click below to choose your password.</p>
  <p style="margin:28px 0"><a href="{{ .RedirectTo }}?token_hash={{ .TokenHash }}&type=invite" style="background:#111;color:#fff;text-decoration:none;padding:12px 22px;border-radius:6px;font-weight:600;display:inline-block">Accept invite</a></p>
  <p style="font-size:12px;color:#999">If you were not expecting this, you can ignore this email.</p>
</div>
```

## Reset password

**Subject:** Reset your Pryse password

```html
<div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#222">
  <p style="font-size:13px;letter-spacing:.08em;color:#888;text-transform:uppercase;margin:0 0 16px">Pryse</p>
  <h2 style="font-size:20px;margin:0 0 12px;color:#111">Reset your password</h2>
  <p style="font-size:15px;line-height:1.6">Click below to choose a new password for Pryse.</p>
  <p style="margin:28px 0"><a href="{{ .RedirectTo }}?token_hash={{ .TokenHash }}&type=recovery" style="background:#111;color:#fff;text-decoration:none;padding:12px 22px;border-radius:6px;font-weight:600;display:inline-block">Reset password</a></p>
  <p style="font-size:12px;color:#999">If you did not ask for this, you can ignore this email. Your password will not change.</p>
</div>
```

If `{{ .RedirectTo }}` comes through empty, check that `https://<your-pryse-domain>/auth/confirm` is listed under Authentication → URL Configuration → Redirect URLs.

## On the test (QA) system

In the QA Supabase project, start both subjects with `[TESTING]`, for example `[TESTING] You have been invited to Pryse`, so invites from the test system are never confused with the live one.

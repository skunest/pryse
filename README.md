# Pryse

Invoicing and e-signing for Maanda Attorneys Inc. Built by SKUN (PTY) LTD.

Pryse is a standalone system. It is separate from the firm's website and has its own Supabase project, its own Vercel project and its own address.

**Stack:** Next.js 16, React 19, Tailwind CSS 4, Supabase (Auth, Postgres, Storage), pdf-lib, Resend for email.

## What it does

**Invoicing**
- Clients and matters. Matter file numbers are assigned automatically.
- Draft invoices with fee and disbursement lines, VAT per line, and live totals.
- Issuing locks the invoice and gives it the next number in an unbroken sequence (for example `PRY-00001`). The database blocks any later change, as SARS requires.
- Tax invoice PDF with the firm's logo, VAT numbers and banking details.
- Invoices emailed to clients with the PDF attached.
- Payments recorded against an invoice (EFT, cash, card, transfer from trust). The status (issued, part paid, paid) follows the payments. Payments cannot be edited or deleted.
- Voiding with a reason. The number is kept, never reused.
- A dashboard showing outstanding, overdue and received amounts.

**E-signing**
- Upload a PDF, add up to 10 signers, and send.
- Each signer gets a personal link. They confirm who they are with a 6-digit code sent to their email, read the document, then draw or type their signature.
- Documents that the Electronic Communications and Transactions Act (ECTA) excludes cannot be sent: sale of land, long leases, wills, bills of exchange and affidavits. Some other document types show a warning.
- When everyone has signed, Pryse seals the document. It stamps every page with a reference, adds a signature page and a certificate of completion with the full audit trail and SHA-256 fingerprints, and emails the signed copy to everyone.
- Anyone can check a signed copy is genuine at `/verify`.
- Reminders (each one sends a fresh link), cancellation, and decline with a reason.

**Team**
- Invite staff by email. The roles are Owner, Administrator, Bookkeeper, Fee earner and Staff.
- An append-only audit trail of actions.

## Set up (about 20 minutes)

### 1. Supabase

1. Create a **new** Supabase project for Pryse. Do not use the website's project. Choose a region (for example Johannesburg if offered, otherwise the nearest).
2. In the SQL editor, run `supabase/migrations/0001_init.sql`. It creates the tables, rules, security policies and the private `documents` storage bucket. Then run the other files in `supabase/migrations` in number order (`0002_single_firm.sql`, `0003_send_tracking.sql`). If you set up Pryse earlier, run only the ones you have not run yet. Each is safe to run once.
3. Go to **Authentication → Sign In / Providers** and turn off **Allow new users to sign up**. Only invited people can use Pryse.
4. Go to **Authentication → URL Configuration**:
   - Site URL: `https://<your-pryse-domain>`
   - Redirect URLs: `https://<your-pryse-domain>/auth/confirm` (and `http://localhost:3000/auth/confirm` for local work)
5. Go to **Authentication → Emails** and paste the templates from `supabase/email-templates.md` (Invite user and Reset password).
6. Optional but recommended: under **Authentication → Emails → SMTP Settings**, use Resend's SMTP so that invites come from your own domain.

### 2. Resend (email)

Create an API key and verify the sending domain (for example `skun.co.za` or the firm's domain). Without a key, Pryse still works, but it will not send invoices, signing links or codes.

### 3. Environment variables

Copy `.env.local.example` to `.env.local` locally, and add the same values in Vercel → Project → Settings → Environment Variables:

| Variable | Value |
|---|---|
| `NEXT_PUBLIC_PRYSE_ENV` | `qa` on the test system, `production` on the live system only. Anything other than `production` marks every screen, invoice PDF, signed document and email with a TESTING badge. |
| `NEXT_PUBLIC_SITE_URL` | Pryse's public address, e.g. `https://pryse.vercel.app`. **Required.** Every link in emails (signing, invites) uses it. Use the production domain, never a deployment URL like `pryse-abc123-skun.vercel.app`: Vercel protects those and asks visitors to log in to Vercel. |
| `NEXT_PUBLIC_SUPABASE_URL` | From Supabase → Project Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Same page (anon / publishable key) |
| `SUPABASE_SERVICE_ROLE_KEY` | Same page (service role / secret key). **Server only.** Never prefix it with `NEXT_PUBLIC_`. |
| `RESEND_API_KEY` | From Resend |
| `EMAIL_FROM` | e.g. `Pryse <no-reply@skun.co.za>` |

### 4. Deploy

Create a new Vercel project from this folder (or its own repository) and deploy. It is a standard Next.js app with no special settings.

### 5. First user

1. In Supabase → Authentication → Users, choose **Invite user** and enter the first administrator's email (for example Mr Maanda's).
2. They open the email, choose a password and land on **Set up your firm**. They become the Owner.
3. In **Settings**, complete the firm details, VAT number, banking details and logo. Everything here prints on the invoices.
4. Set the **invoice prefix** to something different from the accounting system's (for example `PRY`), so that numbers never clash.
5. Invite the rest of the team from **Settings → Team**.

## Test and live systems

Run two copies of Pryse, each with its own Supabase project and Vercel project:

- **Test (QA):** `NEXT_PUBLIC_PRYSE_ENV=qa`. Every screen shows an orange TESTING badge and strip. Invoice PDFs and signed documents carry a TESTING watermark and the note "Test system. Not a valid tax invoice or legally signed document." Emails are sent with `[TESTING]` in the subject and a banner.
- **Live:** `NEXT_PUBLIC_PRYSE_ENV=production`. No testing marks. If the variable is missing, Pryse assumes it is a test system, so a forgotten setting can never send an unmarked test invoice.

The variable is read when the app is built, so redeploy after changing it.

## Local development

```bash
npm install
cp .env.local.example .env.local   # fill in the values
npm run dev                        # http://localhost:3000
```

## Images

The logo files are included:

- `public/pryse-logo.png`: the logo for light backgrounds (sign-in page, mobile top bar, verify page)
- `public/pryse-logo-white.png`: white version for the dark sidebar
- `src/app/icon.png` and `src/app/apple-icon.png`: favicons

To use a higher-resolution logo later, replace these files and keep the same names.

## Notes for the firm

- **Accounting:** Pryse issues invoices and records payments. It is not the firm's accounting system. Capture issued invoices and payments in the accounting system (Lexpro) as usual. Transfers from trust must also be recorded in trust accounting, with the client's authority.
- **VAT:** if the firm is not VAT registered, untick it in Settings. Invoices will then say "Invoice" without VAT.
- **E-signatures** are ordinary electronic signatures under ECTA, which are valid for most agreements. Documents that need a handwritten, witnessed or commissioned signature, or an advanced electronic signature, must not be signed through Pryse.
- **Data:** all documents are stored in a private bucket and are only reachable through short-lived links. Row level security in the database ensures only the firm's team can read its data.

## Project layout

```
src/app/(app)/        Signed-in screens: dashboard, invoices, e-signing, clients, settings
src/app/sign/[token]  Public signing page for clients
src/app/verify        Public page to check a signed document
src/app/api/          Server routes (invoices, signing, clients, team, public signing)
src/lib/              Database access, rules, emails, PDF generation and sealing
supabase/             Database migration and email templates
```

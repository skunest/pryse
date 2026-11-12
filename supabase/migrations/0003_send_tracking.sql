-- Pryse 0003: track how often an invoice has been emailed, and to whom,
-- so the team can see it was already sent and avoid sending it twice.
alter table public.invoices add column if not exists email_count integer not null default 0;
alter table public.invoices add column if not exists last_emailed_to text;
update public.invoices set email_count = 1 where emailed_at is not null and email_count = 0;

-- Faster duplicate checks for signing requests.
create index if not exists signing_requests_sha on public.signing_requests (firm_id, original_sha256);

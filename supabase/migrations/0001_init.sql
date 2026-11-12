-- =====================================================================
-- Pryse: core schema
-- Release 1: firms, members, clients, matters, invoicing, e-signing, audit
-- Every business table carries firm_id and is protected by row level
-- security, so one firm can never read another firm's data, even if
-- application code has a bug.
-- Amounts are stored in cents (bigint) to avoid rounding errors.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- Firms and members
-- ---------------------------------------------------------------------
create table public.firms (
  id                   uuid primary key default gen_random_uuid(),
  name                 text not null,
  legal_name           text,
  registration_number  text,
  vat_registered       boolean not null default true,
  vat_number           text,
  email                text,
  phone                text,
  address              text,
  bank_name            text,
  bank_account_name    text,
  bank_account_number  text,
  bank_branch_code     text,
  invoice_prefix       text not null default 'INV',
  next_invoice_number  integer not null default 1 check (next_invoice_number > 0),
  matter_prefix        text not null default 'MAT',
  next_matter_number   integer not null default 1 check (next_matter_number > 0),
  default_payment_days integer not null default 30 check (default_payment_days between 0 and 365),
  default_vat_rate     numeric(5,2) not null default 15.00,
  invoice_footer       text,
  logo_path            text,
  brand_color          text not null default '#111111',
  app_url              text,                         -- the firm's app, used in signing links
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create type public.member_role as enum ('owner', 'admin', 'fee_earner', 'bookkeeper', 'staff');

create table public.firm_members (
  firm_id     uuid not null references public.firms(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  role        public.member_role not null default 'staff',
  full_name   text,
  email       text,
  created_at  timestamptz not null default now(),
  primary key (firm_id, user_id)
);
create index on public.firm_members (user_id);

-- Membership helpers. SECURITY DEFINER so policies can call them without
-- recursing into firm_members' own policies.
create or replace function public.is_firm_member(fid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from firm_members where firm_id = fid and user_id = auth.uid());
$$;

create or replace function public.firm_role(fid uuid)
returns public.member_role language sql stable security definer set search_path = public as $$
  select role from firm_members where firm_id = fid and user_id = auth.uid();
$$;

create or replace function public.is_firm_admin(fid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.firm_role(fid) in ('owner', 'admin'), false);
$$;

-- First-time setup: the first signed-in user creates the firm and becomes owner.
-- After that, people join only by invitation from Settings, Team.
-- (Public sign-ups are disabled in Supabase, so only invited users can do this.)
create or replace function public.create_firm(p_name text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_email text;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  if exists (select 1 from firm_members where user_id = auth.uid()) then
    raise exception 'You already belong to a firm';
  end if;
  -- Pryse runs one firm per installation: setup happens once, by the first user.
  if exists (select 1 from firms) then
    raise exception 'The firm is already set up. Ask your administrator to invite you from Settings, Team.';
  end if;
  if coalesce(trim(p_name), '') = '' then raise exception 'Firm name is required'; end if;
  select email into v_email from auth.users where id = auth.uid();
  insert into firms (name) values (trim(p_name)) returning id into v_id;
  insert into firm_members (firm_id, user_id, role, email) values (v_id, auth.uid(), 'owner', v_email);
  return v_id;
end $$;

-- ---------------------------------------------------------------------
-- Clients and matters
-- ---------------------------------------------------------------------
create type public.client_type as enum ('individual', 'company', 'trust', 'other');

create table public.clients (
  id                uuid primary key default gen_random_uuid(),
  firm_id           uuid not null references public.firms(id) on delete cascade,
  type              public.client_type not null default 'individual',
  name              text not null,
  id_or_reg_number  text,
  vat_number        text,
  email             text,
  phone             text,
  address           text,
  notes             text,
  archived          boolean not null default false,
  created_by        uuid references auth.users(id),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index on public.clients (firm_id, name);

create type public.matter_status as enum ('open', 'closed');

create table public.matters (
  id              uuid primary key default gen_random_uuid(),
  firm_id         uuid not null references public.firms(id) on delete cascade,
  client_id       uuid not null references public.clients(id),
  file_number     text,
  title           text not null,
  practice_area   text,
  status          public.matter_status not null default 'open',
  responsible_id  uuid references auth.users(id),
  created_by      uuid references auth.users(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (firm_id, file_number)
);
create index on public.matters (firm_id, client_id);

-- File numbers are assigned automatically if not supplied: MAT/00001 ...
create or replace function public.assign_matter_number()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_prefix text; v_n integer;
begin
  if new.file_number is null or trim(new.file_number) = '' then
    update firms set next_matter_number = next_matter_number + 1
      where id = new.firm_id
      returning matter_prefix, next_matter_number - 1 into v_prefix, v_n;
    new.file_number := v_prefix || '/' || lpad(v_n::text, 5, '0');
  end if;
  return new;
end $$;
create trigger matters_number before insert on public.matters
  for each row execute function public.assign_matter_number();

-- A matter's client must belong to the same firm.
create or replace function public.check_same_firm_client()
returns trigger language plpgsql as $$
begin
  if new.client_id is not null and not exists (
    select 1 from clients where id = new.client_id and firm_id = new.firm_id) then
    raise exception 'Client does not belong to this firm';
  end if;
  return new;
end $$;
create trigger matters_same_firm before insert or update on public.matters
  for each row execute function public.check_same_firm_client();

-- ---------------------------------------------------------------------
-- Invoicing
-- ---------------------------------------------------------------------
create type public.invoice_status as enum ('draft', 'issued', 'partially_paid', 'paid', 'void');
create type public.line_kind as enum ('fee', 'disbursement');

create table public.invoices (
  id               uuid primary key default gen_random_uuid(),
  firm_id          uuid not null references public.firms(id) on delete cascade,
  client_id        uuid not null references public.clients(id),
  matter_id        uuid references public.matters(id),
  number           text,                         -- assigned when issued, never reused
  status           public.invoice_status not null default 'draft',
  issue_date       date,
  due_date         date,
  reference        text,                         -- client order number or other reference
  notes            text,                         -- printed on the invoice
  subtotal_cents   bigint not null default 0,
  vat_cents        bigint not null default 0,
  total_cents      bigint not null default 0,
  paid_cents       bigint not null default 0,
  firm_snapshot    jsonb,                        -- firm details frozen at issue
  client_snapshot  jsonb,                        -- client details frozen at issue
  issued_at        timestamptz,
  issued_by        uuid references auth.users(id),
  emailed_at       timestamptz,
  voided_at        timestamptz,
  voided_by        uuid references auth.users(id),
  void_reason      text,
  created_by       uuid references auth.users(id),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (firm_id, number)
);
create index on public.invoices (firm_id, status);
create index on public.invoices (firm_id, client_id);

-- Client and matter must belong to the same firm (and the matter to the client).
create or replace function public.check_same_firm_refs()
returns trigger language plpgsql as $$
begin
  if new.client_id is not null and not exists (
    select 1 from clients where id = new.client_id and firm_id = new.firm_id) then
    raise exception 'Client does not belong to this firm';
  end if;
  if new.matter_id is not null and not exists (
    select 1 from matters where id = new.matter_id and firm_id = new.firm_id
      and (new.client_id is null or client_id = new.client_id)) then
    raise exception 'Matter does not belong to this client';
  end if;
  return new;
end $$;
create trigger invoices_same_firm before insert or update on public.invoices
  for each row execute function public.check_same_firm_refs();

create table public.invoice_lines (
  id                uuid primary key default gen_random_uuid(),
  invoice_id        uuid not null references public.invoices(id) on delete cascade,
  firm_id           uuid not null references public.firms(id) on delete cascade,
  position          integer not null default 0,
  kind              public.line_kind not null default 'fee',
  description       text not null,
  quantity          numeric(12,2) not null default 1 check (quantity > 0),
  unit_price_cents  bigint not null check (unit_price_cents >= 0),
  vat_rate          numeric(5,2) not null default 15.00 check (vat_rate between 0 and 100),
  amount_cents      bigint generated always as (round(quantity * unit_price_cents)::bigint) stored,
  vat_cents         bigint generated always as (round(round(quantity * unit_price_cents) * vat_rate / 100)::bigint) stored,
  created_at        timestamptz not null default now()
);
create index on public.invoice_lines (invoice_id);

-- Lines can only change while the invoice is a draft.
create or replace function public.guard_invoice_lines()
returns trigger language plpgsql as $$
declare v_status public.invoice_status; v_inv uuid;
begin
  v_inv := coalesce(new.invoice_id, old.invoice_id);
  select status into v_status from invoices where id = v_inv;
  if v_status is distinct from 'draft' then
    raise exception 'Invoice lines cannot be changed after the invoice is issued';
  end if;
  return coalesce(new, old);
end $$;
create trigger invoice_lines_guard before insert or update or delete on public.invoice_lines
  for each row execute function public.guard_invoice_lines();

-- Keep invoice totals in step with its lines.
create or replace function public.recalc_invoice_totals()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_inv uuid;
begin
  v_inv := coalesce(new.invoice_id, old.invoice_id);
  update invoices i set
    subtotal_cents = coalesce(s.sub, 0),
    vat_cents      = coalesce(s.vat, 0),
    total_cents    = coalesce(s.sub, 0) + coalesce(s.vat, 0),
    updated_at     = now()
  from (select sum(amount_cents) sub, sum(vat_cents) vat from invoice_lines where invoice_id = v_inv) s
  where i.id = v_inv;
  return null;
end $$;
create trigger invoice_lines_totals after insert or update or delete on public.invoice_lines
  for each row execute function public.recalc_invoice_totals();

-- Once issued, an invoice's content is frozen. Only status, payment and
-- void fields may change, and a void invoice can never change again.
create or replace function public.guard_invoice()
returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    if old.status <> 'draft' then raise exception 'Issued invoices cannot be deleted. Void the invoice instead.'; end if;
    return old;
  end if;
  if old.status = 'void' then raise exception 'A void invoice cannot be changed'; end if;
  if old.status <> 'draft' then
    if new.number is distinct from old.number
      or new.client_id is distinct from old.client_id
      or new.matter_id is distinct from old.matter_id
      or new.issue_date is distinct from old.issue_date
      or new.due_date is distinct from old.due_date
      or new.reference is distinct from old.reference
      or new.notes is distinct from old.notes
      or new.subtotal_cents is distinct from old.subtotal_cents
      or new.vat_cents is distinct from old.vat_cents
      or new.total_cents is distinct from old.total_cents
      or new.firm_snapshot is distinct from old.firm_snapshot
      or new.client_snapshot is distinct from old.client_snapshot
      or new.firm_id is distinct from old.firm_id then
      raise exception 'Issued invoices cannot be edited. Void it and create a new invoice.';
    end if;
    if new.status = 'draft' then raise exception 'An issued invoice cannot go back to draft'; end if;
  end if;
  -- Paid amounts change only through recorded payments (apply_payment).
  if new.paid_cents is distinct from old.paid_cents
     and coalesce(current_setting('pryse.applying_payment', true), '') <> 'on' then
    raise exception 'Paid amounts change only by recording a payment';
  end if;
  if new.status = 'void' then
    if old.status = 'draft' then raise exception 'Delete a draft instead of voiding it'; end if;
    if old.paid_cents > 0 then raise exception 'An invoice with payments cannot be voided'; end if;
    if coalesce(trim(new.void_reason), '') = '' then raise exception 'A reason is required to void an invoice'; end if;
  elsif old.status <> 'draft' and new.status is distinct from (
      case when new.paid_cents = 0 then 'issued'
           when new.paid_cents >= new.total_cents then 'paid'
           else 'partially_paid' end)::invoice_status then
    raise exception 'Invoice status follows its payments and cannot be set directly';
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger invoices_guard before update or delete on public.invoices
  for each row execute function public.guard_invoice();

-- Issue an invoice: assigns the next number atomically, freezes details.
create or replace function public.issue_invoice(p_invoice uuid, p_issue_date date default current_date)
returns public.invoices language plpgsql security definer set search_path = public as $$
declare v_inv invoices; v_firm firms; v_client clients; v_n integer;
begin
  select * into v_inv from invoices where id = p_invoice for update;
  if not found then raise exception 'Invoice not found'; end if;
  if not is_firm_member(v_inv.firm_id) then raise exception 'Not allowed'; end if;
  if v_inv.status <> 'draft' then raise exception 'Only draft invoices can be issued'; end if;
  if not exists (select 1 from invoice_lines where invoice_id = p_invoice) then
    raise exception 'Add at least one line before issuing';
  end if;
  if v_inv.total_cents <= 0 then raise exception 'Invoice total must be more than zero'; end if;

  select * into v_firm from firms where id = v_inv.firm_id for update;
  select * into v_client from clients where id = v_inv.client_id;
  v_n := v_firm.next_invoice_number;
  update firms set next_invoice_number = v_n + 1, updated_at = now() where id = v_firm.id;

  update invoices set
    number          = v_firm.invoice_prefix || '-' || lpad(v_n::text, 5, '0'),
    status          = 'issued',
    issue_date      = coalesce(p_issue_date, current_date),
    due_date        = coalesce(v_inv.due_date, coalesce(p_issue_date, current_date) + v_firm.default_payment_days),
    firm_snapshot   = jsonb_build_object(
                        'name', v_firm.name, 'legal_name', v_firm.legal_name,
                        'registration_number', v_firm.registration_number,
                        'vat_registered', v_firm.vat_registered, 'vat_number', v_firm.vat_number,
                        'email', v_firm.email, 'phone', v_firm.phone, 'address', v_firm.address,
                        'bank_name', v_firm.bank_name, 'bank_account_name', v_firm.bank_account_name,
                        'bank_account_number', v_firm.bank_account_number, 'bank_branch_code', v_firm.bank_branch_code,
                        'invoice_footer', v_firm.invoice_footer, 'logo_path', v_firm.logo_path,
                        'brand_color', v_firm.brand_color),
    client_snapshot = jsonb_build_object(
                        'name', v_client.name, 'type', v_client.type, 'id_or_reg_number', v_client.id_or_reg_number,
                        'vat_number', v_client.vat_number, 'email', v_client.email,
                        'phone', v_client.phone, 'address', v_client.address),
    issued_at       = now(),
    issued_by       = auth.uid()
  where id = p_invoice
  returning * into v_inv;
  return v_inv;
end $$;

create table public.payments (
  id            uuid primary key default gen_random_uuid(),
  invoice_id    uuid not null references public.invoices(id),
  firm_id       uuid not null references public.firms(id) on delete cascade,
  paid_on       date not null default current_date,
  amount_cents  bigint not null check (amount_cents > 0),
  method        text not null default 'eft',   -- eft, cash, card, trust_transfer, other
  reference     text,
  recorded_by   uuid references auth.users(id),
  created_at    timestamptz not null default now()
);
create index on public.payments (invoice_id);

-- Payments only against issued invoices, never more than what is owed.
create or replace function public.apply_payment()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_inv invoices; v_paid bigint;
begin
  select * into v_inv from invoices where id = new.invoice_id for update;
  if v_inv.firm_id <> new.firm_id then raise exception 'Invoice does not belong to this firm'; end if;
  if v_inv.status not in ('issued', 'partially_paid') then
    raise exception 'Payments can only be recorded against issued, unpaid invoices';
  end if;
  v_paid := v_inv.paid_cents + new.amount_cents;
  perform set_config('pryse.applying_payment', 'on', true);
  if v_paid > v_inv.total_cents then raise exception 'Payment is more than the amount outstanding'; end if;
  update invoices set
    paid_cents = v_paid,
    status = case when v_paid = v_inv.total_cents then 'paid'::invoice_status else 'partially_paid'::invoice_status end
  where id = new.invoice_id;
  perform set_config('pryse.applying_payment', 'off', true);
  return new;
end $$;
create trigger payments_apply before insert on public.payments
  for each row execute function public.apply_payment();

create or replace function public.block_change()
returns trigger language plpgsql as $$
begin raise exception '% records cannot be changed or deleted', tg_table_name; end $$;
create trigger payments_immutable before update or delete on public.payments
  for each row execute function public.block_change();

-- ---------------------------------------------------------------------
-- E-signing
-- ---------------------------------------------------------------------
create type public.signing_status as enum ('draft', 'sent', 'completed', 'declined', 'cancelled', 'expired');
create type public.signer_status as enum ('pending', 'viewed', 'signed', 'declined');

create table public.signing_requests (
  id               uuid primary key default gen_random_uuid(),
  firm_id          uuid not null references public.firms(id) on delete cascade,
  client_id        uuid references public.clients(id),
  matter_id        uuid references public.matters(id),
  title            text not null,
  document_type    text not null,
  message          text,
  status           public.signing_status not null default 'draft',
  original_path    text,
  original_name    text,
  original_sha256  text,
  page_count       integer,
  signed_path      text,
  signed_sha256    text,
  expires_at       timestamptz,
  sent_at          timestamptz,
  completed_at     timestamptz,
  cancelled_at     timestamptz,
  created_by       uuid references auth.users(id),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index on public.signing_requests (firm_id, status);
create trigger signing_same_firm before insert or update on public.signing_requests
  for each row execute function public.check_same_firm_refs();

create table public.signers (
  id              uuid primary key default gen_random_uuid(),
  request_id      uuid not null references public.signing_requests(id) on delete cascade,
  firm_id         uuid not null references public.firms(id) on delete cascade,
  sign_order      integer not null default 1,
  name            text not null,
  email           text not null,
  status          public.signer_status not null default 'pending',
  token_hash      text unique,          -- sha256 of the link token, never the token itself
  otp_hash        text,
  otp_expires_at  timestamptz,
  otp_attempts    integer not null default 0,
  otp_sent_at     timestamptz,
  session_hash    text,                 -- issued after the code is verified
  session_expires_at timestamptz,
  verified_at     timestamptz,
  viewed_at       timestamptz,
  signed_at       timestamptz,
  signature_path  text,
  signed_name     text,
  ip              text,
  user_agent      text,
  decline_reason  text,
  created_at      timestamptz not null default now()
);
create index on public.signers (request_id);

-- Evidence trail for each signing request (printed on the certificate).
create table public.signing_events (
  id          bigserial primary key,
  request_id  uuid not null references public.signing_requests(id) on delete cascade,
  firm_id     uuid not null references public.firms(id) on delete cascade,
  signer_id   uuid references public.signers(id),
  event       text not null,
  detail      text,
  ip          text,
  user_agent  text,
  created_at  timestamptz not null default now()
);
create index on public.signing_events (request_id, created_at);
create trigger signing_events_immutable before update or delete on public.signing_events
  for each row execute function public.block_change();

-- ---------------------------------------------------------------------
-- Audit trail (append only)
-- ---------------------------------------------------------------------
create table public.audit_events (
  id          bigserial primary key,
  firm_id     uuid not null references public.firms(id) on delete cascade,
  actor_id    uuid references auth.users(id),
  entity      text not null,
  entity_id   uuid,
  action      text not null,
  data        jsonb,
  ip          text,
  created_at  timestamptz not null default now()
);
create index on public.audit_events (firm_id, created_at desc);
create trigger audit_immutable before update or delete on public.audit_events
  for each row execute function public.block_change();

-- updated_at helpers
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$ begin new.updated_at := now(); return new; end $$;
create trigger firms_touch before update on public.firms for each row execute function public.touch_updated_at();
create trigger clients_touch before update on public.clients for each row execute function public.touch_updated_at();
create trigger matters_touch before update on public.matters for each row execute function public.touch_updated_at();
create trigger signing_touch before update on public.signing_requests for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------
alter table public.firms             enable row level security;
alter table public.firm_members      enable row level security;
alter table public.clients           enable row level security;
alter table public.matters           enable row level security;
alter table public.invoices          enable row level security;
alter table public.invoice_lines     enable row level security;
alter table public.payments          enable row level security;
alter table public.signing_requests  enable row level security;
alter table public.signers           enable row level security;
alter table public.signing_events    enable row level security;
alter table public.audit_events      enable row level security;

create policy firms_select on public.firms for select using (public.is_firm_member(id));
create policy firms_update on public.firms for update using (public.is_firm_admin(id)) with check (public.is_firm_admin(id));

create policy members_select on public.firm_members for select using (public.is_firm_member(firm_id));
-- Members are added and removed by the API with the service role (admins only).

-- Standard "members of the firm" policies for the business tables.
do $$
declare t text;
begin
  foreach t in array array['clients','matters','invoices','invoice_lines','payments','signing_requests','signers','signing_events','audit_events'] loop
    execute format('create policy %1$s_select on public.%1$s for select using (public.is_firm_member(firm_id))', t);
    execute format('create policy %1$s_insert on public.%1$s for insert with check (public.is_firm_member(firm_id))', t);
  end loop;
  foreach t in array array['clients','matters','invoices','invoice_lines','signing_requests','signers'] loop
    execute format('create policy %1$s_update on public.%1$s for update using (public.is_firm_member(firm_id)) with check (public.is_firm_member(firm_id))', t);
  end loop;
  foreach t in array array['invoices','invoice_lines','signing_requests','signers'] loop
    execute format('create policy %1$s_delete on public.%1$s for delete using (public.is_firm_member(firm_id))', t);
  end loop;
end $$;

-- Signer secrets are never readable through Pryse's user-scoped client.
-- (Column grants: table-level SELECT is removed and re-granted without the secret columns.)
revoke select on public.signers from authenticated, anon;
grant select (id, request_id, firm_id, sign_order, name, email, status, otp_expires_at, otp_attempts, otp_sent_at,
              verified_at, viewed_at, signed_at, signature_path, signed_name, ip, user_agent,
              decline_reason, created_at) on public.signers to authenticated;

-- ---------------------------------------------------------------------
-- Storage: private bucket, files stored under <firm_id>/...
-- All file access goes through Pryse with signed URLs.
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public) values ('documents', 'documents', false)
  on conflict (id) do nothing;

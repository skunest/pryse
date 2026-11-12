-- Pryse 0002: the firm is set up once.
-- Run this only if you ran 0001_init.sql before 4 November 2026.
-- After the first firm exists, nobody else can create one; people join by invitation.
create or replace function public.create_firm(p_name text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_email text;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  if exists (select 1 from firm_members where user_id = auth.uid()) then
    raise exception 'You already belong to a firm';
  end if;
  if exists (select 1 from firms) then
    raise exception 'The firm is already set up. Ask your administrator to invite you from Settings, Team.';
  end if;
  if coalesce(trim(p_name), '') = '' then raise exception 'Firm name is required'; end if;
  select email into v_email from auth.users where id = auth.uid();
  insert into firms (name) values (trim(p_name)) returning id into v_id;
  insert into firm_members (firm_id, user_id, role, email) values (v_id, auth.uid(), 'owner', v_email);
  return v_id;
end $$;

begin;

-- The legacy storefront tables live in the same Supabase project. They must not
-- remain readable through email checks or a public `true` policy now that this
-- project is the private KICKS CENTER POS system.
do $$
begin
  if to_regclass('public.orders') is not null then
    drop policy if exists "Allow admin to read orders" on public.orders;
    drop policy if exists orders_staff_select on public.orders;
    revoke select on table public.orders from anon;
    grant select on table public.orders to authenticated;
    create policy orders_staff_select
      on public.orders for select to authenticated
      using (private.kc_is_staff());
  end if;

  if to_regclass('public.product_variants') is not null then
    drop policy if exists "Anyone can read product variants" on public.product_variants;
    drop policy if exists product_variants_staff_select on public.product_variants;
    revoke select on table public.product_variants from anon;
    grant select on table public.product_variants to authenticated;
    create policy product_variants_staff_select
      on public.product_variants for select to authenticated
      using (private.kc_is_staff());
  end if;
end
$$;

create or replace function private.kc_capture_member_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.kc_audit_log (
    state_id,
    operation,
    action_summary,
    actor_id,
    actor_role,
    old_payload,
    new_payload
  ) values (
    'member:' || coalesce(new.user_id, old.user_id)::text,
    tg_op,
    '帳號權限異動',
    (select auth.uid()),
    private.kc_current_role(),
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) - 'user_id' end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) - 'user_id' end
  );

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end
$$;

drop trigger if exists kc_app_members_audit_trigger on public.kc_app_members;
create trigger kc_app_members_audit_trigger
after insert or update or delete on public.kc_app_members
for each row execute function private.kc_capture_member_change();

create or replace function private.kc_admin_set_member_access(
  p_email text,
  p_role text,
  p_vendor_id text default null,
  p_active boolean default true
)
returns table (
  email text,
  role text,
  vendor_id text,
  active boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_email text;
  v_vendor_id text;
  v_target_was_last_admin boolean;
begin
  if private.kc_current_role() <> 'admin' then
    raise exception using errcode = '42501', message = 'KICKS CENTER admin access required';
  end if;

  v_email := lower(trim(coalesce(p_email, '')));
  if v_email = '' or p_role not in ('admin', 'staff', 'vendor') then
    raise exception using errcode = '22023', message = 'Valid email and role are required';
  end if;

  select u.id into v_user_id
  from auth.users as u
  where lower(u.email) = v_email
  limit 1;

  if v_user_id is null then
    raise exception using errcode = 'P0002', message = 'Invite or create the Supabase Auth user first';
  end if;

  v_vendor_id := case when p_role = 'vendor' then nullif(trim(coalesce(p_vendor_id, '')), '') end;
  if p_role = 'vendor' and not exists (
    select 1
    from public.kc_pos_state as state,
         jsonb_array_elements(state.payload -> 'vendors') as vendor
    where state.id = 'main'
      and vendor ->> 'id' = v_vendor_id
  ) then
    raise exception using errcode = '22023', message = 'Vendor binding does not exist';
  end if;

  select exists (
    select 1
    from public.kc_app_members as member
    where member.user_id = v_user_id
      and member.role = 'admin'
      and member.active
      and not exists (
        select 1 from public.kc_app_members as another
        where another.role = 'admin'
          and another.active
          and another.user_id <> member.user_id
      )
  ) into v_target_was_last_admin;

  if v_target_was_last_admin and (p_role <> 'admin' or not p_active) then
    raise exception using errcode = '22023', message = 'The final active admin cannot be disabled or demoted';
  end if;

  insert into public.kc_app_members (user_id, role, vendor_id, active)
  values (v_user_id, p_role, v_vendor_id, p_active)
  on conflict (user_id) do update
  set role = excluded.role,
      vendor_id = excluded.vendor_id,
      active = excluded.active,
      updated_at = clock_timestamp();

  return query select v_email, p_role, v_vendor_id, p_active;
end
$$;

create or replace function public.kc_admin_set_member_access(
  p_email text,
  p_role text,
  p_vendor_id text default null,
  p_active boolean default true
)
returns table (
  email text,
  role text,
  vendor_id text,
  active boolean
)
language sql
security invoker
set search_path = ''
as $$
  select *
  from private.kc_admin_set_member_access(p_email, p_role, p_vendor_id, p_active)
$$;

revoke all on function private.kc_admin_set_member_access(text, text, text, boolean) from public, anon;
grant execute on function private.kc_admin_set_member_access(text, text, text, boolean) to authenticated;
revoke all on function public.kc_admin_set_member_access(text, text, text, boolean) from public, anon;
grant execute on function public.kc_admin_set_member_access(text, text, text, boolean) to authenticated;

commit;

begin;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table if not exists public.kc_app_members (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('admin', 'staff', 'vendor')),
  vendor_id text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint kc_vendor_role_requires_vendor check (
    (role = 'vendor' and vendor_id is not null)
    or (role <> 'vendor' and vendor_id is null)
  )
);

alter table public.kc_app_members enable row level security;
alter table public.kc_app_members force row level security;
revoke all on table public.kc_app_members from anon, authenticated;
grant select on table public.kc_app_members to authenticated;

insert into public.kc_app_members (user_id, role, vendor_id, active)
select id, 'admin', null, true
from auth.users
where lower(email) = 'quma12342@yahoo.com.tw'
on conflict (user_id) do update
set role = 'admin', vendor_id = null, active = true, updated_at = now();

do $$
begin
  if not exists (
    select 1
    from public.kc_app_members
    where role = 'admin' and active
  ) then
    raise exception 'KICKS CENTER admin account was not found; aborting security migration';
  end if;
end
$$;

create or replace function private.kc_current_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select m.role
  from public.kc_app_members as m
  where m.user_id = (select auth.uid())
    and m.active
$$;

create or replace function private.kc_is_staff()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(private.kc_current_role() in ('admin', 'staff'), false)
$$;

create or replace function private.kc_current_vendor_id()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select m.vendor_id
  from public.kc_app_members as m
  where m.user_id = (select auth.uid())
    and m.role = 'vendor'
    and m.active
$$;

revoke all on function private.kc_current_role() from public;
revoke all on function private.kc_is_staff() from public;
revoke all on function private.kc_current_vendor_id() from public;
grant usage on schema private to authenticated;
grant execute on function private.kc_current_role() to authenticated;
grant execute on function private.kc_is_staff() to authenticated;
grant execute on function private.kc_current_vendor_id() to authenticated;

drop policy if exists kc_app_members_self_read on public.kc_app_members;
drop policy if exists kc_app_members_staff_read on public.kc_app_members;
create policy kc_app_members_self_read
on public.kc_app_members for select to authenticated
using (user_id = (select auth.uid()));
create policy kc_app_members_staff_read
on public.kc_app_members for select to authenticated
using (private.kc_is_staff());

create table if not exists public.kc_pos_state_backups (
  id bigint generated always as identity primary key,
  backup_key text unique,
  source text not null,
  payload jsonb not null,
  original_updated_at timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid
);

create table if not exists public.kc_audit_log (
  id bigint generated always as identity primary key,
  state_id text not null,
  operation text not null check (operation in ('INSERT', 'UPDATE', 'DELETE', 'RESTORE')),
  action_summary text not null,
  actor_id uuid,
  actor_role text,
  old_payload jsonb,
  new_payload jsonb,
  occurred_at timestamptz not null default now()
);

alter table public.kc_pos_state_backups enable row level security;
alter table public.kc_pos_state_backups force row level security;
alter table public.kc_audit_log enable row level security;
alter table public.kc_audit_log force row level security;
revoke all on table public.kc_pos_state_backups from anon, authenticated;
revoke all on table public.kc_audit_log from anon, authenticated;
grant select on table public.kc_pos_state_backups to authenticated;
grant select on table public.kc_audit_log to authenticated;

drop policy if exists kc_pos_backups_staff_read on public.kc_pos_state_backups;
drop policy if exists kc_audit_staff_read on public.kc_audit_log;
create policy kc_pos_backups_staff_read
on public.kc_pos_state_backups for select to authenticated
using (private.kc_is_staff());
create policy kc_audit_staff_read
on public.kc_audit_log for select to authenticated
using (private.kc_is_staff());

insert into public.kc_pos_state_backups (
  backup_key,
  source,
  payload,
  original_updated_at,
  created_by
)
select
  'pre-security-20260828',
  'pre-security-migration',
  payload,
  updated_at,
  (select id from auth.users where lower(email) = 'quma12342@yahoo.com.tw' limit 1)
from public.kc_pos_state
where id = 'main'
on conflict (backup_key) do nothing;

create or replace function private.kc_capture_state_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_summary text;
  v_role text;
begin
  v_summary := coalesce(
    nullif(current_setting('kc.action_summary', true), ''),
    case when tg_op = 'UPDATE' then 'POS 主資料更新' else 'POS 主資料 ' || tg_op end
  );
  v_role := private.kc_current_role();

  if tg_op in ('UPDATE', 'DELETE') then
    insert into public.kc_pos_state_backups (
      source,
      payload,
      original_updated_at,
      created_by
    ) values (
      'automatic-before-' || lower(tg_op),
      old.payload,
      old.updated_at,
      (select auth.uid())
    );
  end if;

  insert into public.kc_audit_log (
    state_id,
    operation,
    action_summary,
    actor_id,
    actor_role,
    old_payload,
    new_payload
  ) values (
    coalesce(new.id, old.id),
    tg_op,
    left(v_summary, 500),
    (select auth.uid()),
    v_role,
    case when tg_op in ('UPDATE', 'DELETE') then old.payload end,
    case when tg_op in ('INSERT', 'UPDATE') then new.payload end
  );

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end
$$;

drop trigger if exists kc_pos_state_audit_trigger on public.kc_pos_state;
create trigger kc_pos_state_audit_trigger
before insert or update or delete on public.kc_pos_state
for each row execute function private.kc_capture_state_change();

do $$
declare
  p record;
begin
  for p in
    select policyname
    from pg_policies
    where schemaname = 'public' and tablename = 'kc_pos_state'
  loop
    execute format('drop policy if exists %I on public.kc_pos_state', p.policyname);
  end loop;
end
$$;

alter table public.kc_pos_state enable row level security;
alter table public.kc_pos_state force row level security;
revoke all on table public.kc_pos_state from anon, authenticated;
grant select on table public.kc_pos_state to authenticated;
create policy kc_pos_state_staff_read
on public.kc_pos_state for select to authenticated
using (private.kc_is_staff());

create or replace function public.kc_staff_save_pos_state(
  p_payload jsonb,
  p_expected_updated_at timestamptz,
  p_action_summary text default 'POS 主資料更新'
)
returns table (updated_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_updated_at timestamptz;
begin
  if not private.kc_is_staff() then
    raise exception using errcode = '42501', message = 'KICKS CENTER staff access required';
  end if;

  if p_expected_updated_at is null then
    raise exception using errcode = '22004', message = 'Expected version is required';
  end if;

  if p_payload is null
    or jsonb_typeof(p_payload) <> 'object'
    or jsonb_typeof(p_payload -> 'products') <> 'array'
    or jsonb_typeof(p_payload -> 'vendors') <> 'array'
    or jsonb_typeof(p_payload -> 'sales') <> 'array'
    or jsonb_typeof(p_payload -> 'settlements') <> 'array'
  then
    raise exception using errcode = '22023', message = 'Invalid KICKS CENTER POS payload';
  end if;

  perform set_config(
    'kc.action_summary',
    left(coalesce(nullif(trim(p_action_summary), ''), 'POS 主資料更新'), 500),
    true
  );

  update public.kc_pos_state as state
  set payload = p_payload,
      updated_at = clock_timestamp()
  where state.id = 'main'
    and state.updated_at = p_expected_updated_at
  returning state.updated_at into v_updated_at;

  if v_updated_at is null then
    raise exception using errcode = '40001', message = 'POS data changed in another session; reload required';
  end if;

  return query select v_updated_at;
end
$$;

create or replace function public.kc_admin_restore_pos_state(
  p_backup_id bigint,
  p_reason text
)
returns table (updated_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_payload jsonb;
  v_updated_at timestamptz;
begin
  if private.kc_current_role() <> 'admin' then
    raise exception using errcode = '42501', message = 'KICKS CENTER admin access required';
  end if;

  if length(trim(coalesce(p_reason, ''))) < 6 then
    raise exception using errcode = '22023', message = 'A restore reason is required';
  end if;

  select backup.payload into v_payload
  from public.kc_pos_state_backups as backup
  where backup.id = p_backup_id;

  if v_payload is null then
    raise exception using errcode = 'P0002', message = 'Backup not found';
  end if;

  perform set_config('kc.action_summary', left('RESTORE: ' || trim(p_reason), 500), true);
  update public.kc_pos_state
  set payload = v_payload,
      updated_at = clock_timestamp()
  where id = 'main'
  returning kc_pos_state.updated_at into v_updated_at;

  return query select v_updated_at;
end
$$;

create or replace function public.kc_vendor_portal_snapshot()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_vendor_id text;
  v_payload jsonb;
  v_vendor jsonb;
  v_products jsonb;
  v_sales jsonb;
  v_settlements jsonb;
begin
  v_vendor_id := private.kc_current_vendor_id();
  if v_vendor_id is null then
    raise exception using errcode = '42501', message = 'KICKS CENTER vendor access required';
  end if;

  select state.payload into v_payload
  from public.kc_pos_state as state
  where state.id = 'main';

  if v_payload is null then
    raise exception using errcode = 'P0002', message = 'POS state not found';
  end if;

  select item into v_vendor
  from jsonb_array_elements(v_payload -> 'vendors') as item
  where item ->> 'id' = v_vendor_id
  limit 1;

  select coalesce(jsonb_agg(item - 'note' - 'location'), '[]'::jsonb)
  into v_products
  from jsonb_array_elements(v_payload -> 'products') as item
  where item ->> 'vendorId' = v_vendor_id;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', sale -> 'id',
        'productId', sale -> 'productId',
        'cost', sale -> 'cost',
        'price', sale -> 'price',
        'soldAt', sale -> 'soldAt',
        'settled', sale -> 'settled',
        'settlementId', sale -> 'settlementId'
      )
    ),
    '[]'::jsonb
  ) into v_sales
  from jsonb_array_elements(v_payload -> 'sales') as sale
  where exists (
    select 1
    from jsonb_array_elements(v_payload -> 'products') as product
    where product ->> 'id' = sale ->> 'productId'
      and product ->> 'vendorId' = v_vendor_id
  );

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', settlement -> 'id',
        'saleIds', settlement -> 'saleIds',
        'payout', settlement -> 'payout',
        'totalSales', settlement -> 'totalSales',
        'completedAt', settlement -> 'completedAt'
      )
    ),
    '[]'::jsonb
  ) into v_settlements
  from jsonb_array_elements(v_payload -> 'settlements') as settlement
  where settlement ->> 'vendorId' = v_vendor_id;

  return jsonb_build_object(
    'vendor', coalesce(v_vendor, '{}'::jsonb),
    'products', v_products,
    'sales', v_sales,
    'settlements', v_settlements
  );
end
$$;

revoke all on function public.kc_staff_save_pos_state(jsonb, timestamptz, text) from public, anon;
revoke all on function public.kc_admin_restore_pos_state(bigint, text) from public, anon;
revoke all on function public.kc_vendor_portal_snapshot() from public, anon;
grant execute on function public.kc_staff_save_pos_state(jsonb, timestamptz, text) to authenticated;
grant execute on function public.kc_admin_restore_pos_state(bigint, text) to authenticated;
grant execute on function public.kc_vendor_portal_snapshot() to authenticated;

do $$
declare
  p record;
  t text;
begin
  foreach t in array array['orders', 'product_variants']
  loop
    if to_regclass('public.' || t) is not null then
      for p in
        select policyname
        from pg_policies
        where schemaname = 'public'
          and tablename = t
          and cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL')
      loop
        execute format('drop policy if exists %I on public.%I', p.policyname, t);
      end loop;

      execute format('revoke insert, update, delete on table public.%I from anon', t);
      execute format('grant insert, update, delete on table public.%I to authenticated', t);
      execute format(
        'create policy %I on public.%I for insert to authenticated with check (private.kc_is_staff())',
        t || '_staff_insert',
        t
      );
      execute format(
        'create policy %I on public.%I for update to authenticated using (private.kc_is_staff()) with check (private.kc_is_staff())',
        t || '_staff_update',
        t
      );
      execute format(
        'create policy %I on public.%I for delete to authenticated using (private.kc_is_staff())',
        t || '_staff_delete',
        t
      );
    end if;
  end loop;
end
$$;

commit;

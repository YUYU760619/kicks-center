begin;

-- Admin-only checks are separate from kc_is_staff(), which intentionally
-- continues to mean an authenticated, active admin or staff member.
create or replace function private.kc_is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(private.kc_current_role() = 'admin', false)
$$;

revoke all on function private.kc_is_admin() from public, anon;
grant execute on function private.kc_is_admin() to authenticated;

-- Full POS state and its historical copies contain vendor and financial data.
drop policy if exists kc_pos_state_staff_read on public.kc_pos_state;
drop policy if exists kc_pos_state_admin_read on public.kc_pos_state;
create policy kc_pos_state_admin_read
on public.kc_pos_state for select to authenticated
using (private.kc_is_admin());

drop policy if exists kc_pos_backups_staff_read on public.kc_pos_state_backups;
drop policy if exists kc_pos_backups_admin_read on public.kc_pos_state_backups;
create policy kc_pos_backups_admin_read
on public.kc_pos_state_backups for select to authenticated
using (private.kc_is_admin());

drop policy if exists kc_audit_staff_read on public.kc_audit_log;
drop policy if exists kc_audit_admin_read on public.kc_audit_log;
create policy kc_audit_admin_read
on public.kc_audit_log for select to authenticated
using (private.kc_is_admin());

-- A member can still read their own row for AuthGate. Only admins can list all
-- members; no client receives auth.users data through this policy.
drop policy if exists kc_app_members_staff_read on public.kc_app_members;
drop policy if exists kc_app_members_admin_read on public.kc_app_members;
create policy kc_app_members_admin_read
on public.kc_app_members for select to authenticated
using (private.kc_is_admin());

-- Legacy storefront tables are not required by the POS register. Preserve
-- admin CRUD access but remove every staff/anonymous path.
do $$
declare
  v_policy record;
begin
  if to_regclass('public.orders') is not null then
    alter table public.orders enable row level security;
    alter table public.orders force row level security;
    revoke all on table public.orders from anon, authenticated;
    grant select, insert, update, delete on table public.orders to authenticated;

    for v_policy in
      select policyname
      from pg_policies
      where schemaname = 'public' and tablename = 'orders'
    loop
      execute format('drop policy if exists %I on public.orders', v_policy.policyname);
    end loop;

    create policy orders_admin_all
      on public.orders for all to authenticated
      using (private.kc_is_admin())
      with check (private.kc_is_admin());
  end if;

  if to_regclass('public.product_variants') is not null then
    alter table public.product_variants enable row level security;
    alter table public.product_variants force row level security;
    revoke all on table public.product_variants from anon, authenticated;
    grant select, insert, update, delete on table public.product_variants to authenticated;

    for v_policy in
      select policyname
      from pg_policies
      where schemaname = 'public' and tablename = 'product_variants'
    loop
      execute format('drop policy if exists %I on public.product_variants', v_policy.policyname);
    end loop;

    create policy product_variants_admin_all
      on public.product_variants for all to authenticated
      using (private.kc_is_admin())
      with check (private.kc_is_admin());
  end if;
end
$$;

-- Keep the existing, tested full-state implementations for the admin backend,
-- but move them out of the exposed public schema and put admin-only wrappers in
-- their place. This avoids changing their business and integrity logic.
-- Migration 003 left its former save implementation in private after later
-- migrations replaced the public wrapper, so remove that unused predecessor
-- before moving the current stage-1 implementation into private.
drop function if exists private.kc_staff_save_pos_state(jsonb, timestamptz, text);

alter function public.kc_staff_save_pos_state(jsonb, timestamptz, text)
  set schema private;
alter function private.kc_staff_save_pos_state(jsonb, timestamptz, text)
  rename to kc_admin_save_pos_state_impl;
revoke all on function private.kc_admin_save_pos_state_impl(jsonb, timestamptz, text)
  from public, anon, authenticated;

create function public.kc_staff_save_pos_state(
  p_payload jsonb,
  p_expected_updated_at timestamptz,
  p_action_summary text default 'POS 主資料更新'
)
returns table (updated_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.kc_is_admin() then
    raise exception using errcode = '42501', message = 'KICKS CENTER admin access required';
  end if;

  return query
  select *
  from private.kc_admin_save_pos_state_impl(
    p_payload,
    p_expected_updated_at,
    p_action_summary
  );
end
$$;

alter function public.kc_staff_create_inventory_item(jsonb, timestamptz)
  set schema private;
alter function private.kc_staff_create_inventory_item(jsonb, timestamptz)
  rename to kc_admin_create_inventory_item_impl;
revoke all on function private.kc_admin_create_inventory_item_impl(jsonb, timestamptz)
  from public, anon, authenticated;

create function public.kc_staff_create_inventory_item(
  p_item jsonb,
  p_expected_updated_at timestamptz
)
returns table (payload jsonb, updated_at timestamptz, inventory_id text)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.kc_is_admin() then
    raise exception using errcode = '42501', message = 'KICKS CENTER admin access required';
  end if;

  return query
  select *
  from private.kc_admin_create_inventory_item_impl(p_item, p_expected_updated_at);
end
$$;

alter function public.kc_staff_sell_inventory_item(text, numeric, text, numeric, timestamptz)
  set schema private;
alter function private.kc_staff_sell_inventory_item(text, numeric, text, numeric, timestamptz)
  rename to kc_admin_sell_inventory_item_impl;
revoke all on function private.kc_admin_sell_inventory_item_impl(text, numeric, text, numeric, timestamptz)
  from public, anon, authenticated;

create function public.kc_staff_sell_inventory_item(
  p_inventory_id text,
  p_sold_price numeric,
  p_payment_method text,
  p_discount numeric,
  p_expected_updated_at timestamptz
)
returns table (payload jsonb, updated_at timestamptz, sale_id text)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.kc_is_admin() then
    raise exception using errcode = '42501', message = 'KICKS CENTER admin access required';
  end if;

  return query
  select *
  from private.kc_admin_sell_inventory_item_impl(
    p_inventory_id,
    p_sold_price,
    p_payment_method,
    p_discount,
    p_expected_updated_at
  );
end
$$;

revoke all on function public.kc_staff_save_pos_state(jsonb, timestamptz, text)
  from public, anon;
grant execute on function public.kc_staff_save_pos_state(jsonb, timestamptz, text)
  to authenticated;
revoke all on function public.kc_staff_create_inventory_item(jsonb, timestamptz)
  from public, anon;
grant execute on function public.kc_staff_create_inventory_item(jsonb, timestamptz)
  to authenticated;
revoke all on function public.kc_staff_sell_inventory_item(text, numeric, text, numeric, timestamptz)
  from public, anon;
grant execute on function public.kc_staff_sell_inventory_item(text, numeric, text, numeric, timestamptz)
  to authenticated;

-- Register lookup returns only the fields required to identify and price the
-- single scanned physical item. Hyphens and all other punctuation are kept;
-- only whitespace and letter case are normalized, matching the current rule.
create or replace function public.kc_pos_lookup_inventory(p_scan_code text)
returns table (
  inventory_id text,
  scan_code text,
  name text,
  model text,
  us_size text,
  cm_size text,
  price numeric,
  status text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_scan_code text;
  v_match_count integer;
begin
  if not private.kc_is_staff() then
    raise exception using errcode = '42501', message = 'KICKS CENTER POS access required';
  end if;

  v_scan_code := upper(
    regexp_replace(btrim(coalesce(p_scan_code, '')), '[[:space:]]+', '', 'g')
  );
  if v_scan_code = '' then
    raise exception using errcode = '22023', message = 'SCAN_CODE_REQUIRED';
  end if;

  select count(*)::integer
  into v_match_count
  from public.kc_pos_state as state
  cross join lateral jsonb_array_elements(state.payload -> 'products') as product
  where state.id = 'main'
    and upper(regexp_replace(product ->> 'scan_code', '[[:space:]]+', '', 'g')) = v_scan_code;

  if v_match_count > 1 then
    raise exception using errcode = '23505', message = 'SCAN_CODE_AMBIGUOUS';
  end if;

  return query
  select
    product ->> 'inventory_id',
    product ->> 'scan_code',
    product ->> 'name',
    product ->> 'model',
    product ->> 'usSize',
    product ->> 'cmSize',
    nullif(product ->> 'price', '')::numeric,
    product ->> 'status'
  from public.kc_pos_state as state
  cross join lateral jsonb_array_elements(state.payload -> 'products') as product
  where state.id = 'main'
    and upper(regexp_replace(product ->> 'scan_code', '[[:space:]]+', '', 'g')) = v_scan_code
  limit 1;
end
$$;

-- The secure register operation derives vendor, return price, profit and the
-- pending settlement state only inside the database transaction. None of those
-- fields are included in the return signature.
create or replace function public.kc_pos_complete_sale(
  p_inventory_id text,
  p_sold_price numeric,
  p_payment_method text,
  p_discount numeric
)
returns table (
  sale_id text,
  inventory_id text,
  sold_at timestamptz,
  sold_price numeric,
  payment_method text,
  status text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_payload jsonb;
  v_product jsonb;
  v_products jsonb;
  v_sale jsonb;
  v_sale_id text;
  v_sold_at timestamptz;
begin
  if not private.kc_is_staff() then
    raise exception using errcode = '42501', message = 'KICKS CENTER POS access required';
  end if;

  if nullif(btrim(coalesce(p_inventory_id, '')), '') is null
    or p_sold_price is null
    or p_sold_price <= 0
    or nullif(btrim(coalesce(p_payment_method, '')), '') is null
    or p_payment_method not in ('現金', '信用卡', '轉帳', '其他')
    or coalesce(p_discount, 0) < 0
  then
    raise exception using errcode = '22023', message = 'Invalid sale input';
  end if;

  select state.payload
  into v_payload
  from public.kc_pos_state as state
  where state.id = 'main'
  for update;

  if v_payload is null then
    raise exception using errcode = 'P0002', message = 'POS_STATE_NOT_FOUND';
  end if;

  select product
  into v_product
  from jsonb_array_elements(v_payload -> 'products') as product
  where product ->> 'inventory_id' = p_inventory_id
  limit 1;

  if v_product is null then
    raise exception using errcode = 'P0002', message = 'INVENTORY_NOT_FOUND';
  end if;

  if v_product ->> 'status' <> '在庫' then
    raise exception using errcode = '23514', message = 'INVENTORY_NOT_AVAILABLE';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(v_payload -> 'sales') as sale
    where sale ->> 'inventory_id' = p_inventory_id
  ) then
    raise exception using errcode = '23505', message = 'INVENTORY_ALREADY_SOLD';
  end if;

  v_sale_id := gen_random_uuid()::text;
  v_sold_at := clock_timestamp();
  v_sale := jsonb_build_object(
    'sale_id', v_sale_id,
    'inventory_id', p_inventory_id,
    'sold_at', v_sold_at,
    'sold_price', p_sold_price,
    'return_price', (v_product ->> 'cost')::numeric,
    'vendor_id', v_product ->> 'vendorId',
    'payment_method', p_payment_method,
    'settlement_status', 'pending',
    'id', v_sale_id,
    'productId', p_inventory_id,
    'soldAt', v_sold_at,
    'price', p_sold_price,
    'cost', (v_product ->> 'cost')::numeric,
    'profit', p_sold_price - (v_product ->> 'cost')::numeric,
    'payment', p_payment_method,
    'discount', coalesce(p_discount, 0),
    'settled', false
  );

  select jsonb_agg(
    case
      when product ->> 'inventory_id' = p_inventory_id then
        jsonb_set(
          jsonb_set(product, '{status}', to_jsonb('已售出'::text)),
          '{history}',
          coalesce(product -> 'history', '[]'::jsonb) || jsonb_build_array(
            jsonb_build_object(
              'at', v_sold_at,
              'action', '商品售出',
              'note', p_payment_method || ' · 成交價 NT$ ' || p_sold_price || ' · sale_id ' || v_sale_id
            )
          )
        )
      else product
    end
    order by ordinal
  )
  into v_products
  from jsonb_array_elements(v_payload -> 'products') with ordinality as item(product, ordinal);

  v_payload := jsonb_set(v_payload, '{products}', v_products);
  v_payload := jsonb_set(
    v_payload,
    '{sales}',
    (v_payload -> 'sales') || jsonb_build_array(v_sale)
  );

  perform private.kc_assert_pos_financial_integrity(v_payload);
  perform private.kc_assert_stage1_core(v_payload);
  perform set_config('kc.action_summary', 'POS 售出 ' || (v_product ->> 'scan_code'), true);

  update public.kc_pos_state
  set payload = v_payload,
      updated_at = clock_timestamp()
  where id = 'main';

  return query
  select
    v_sale_id,
    p_inventory_id,
    v_sold_at,
    p_sold_price,
    p_payment_method,
    '已售出'::text;
end
$$;

revoke all on function public.kc_pos_lookup_inventory(text) from public, anon;
grant execute on function public.kc_pos_lookup_inventory(text) to authenticated;
revoke all on function public.kc_pos_complete_sale(text, numeric, text, numeric)
  from public, anon;
grant execute on function public.kc_pos_complete_sale(text, numeric, text, numeric)
  to authenticated;

notify pgrst, 'reload schema';

commit;

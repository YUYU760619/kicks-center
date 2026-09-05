begin;

create or replace function private.kc_guard_sale_vendor_visibility()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old_sales_by_id jsonb := '{}'::jsonb;
  v_sales jsonb := '[]'::jsonb;
  v_sale jsonb;
  v_old_sale jsonb;
  v_sale_id text;
  v_old_visible boolean;
  v_new_visible boolean;
begin
  if old.payload -> 'sales' is not distinct from new.payload -> 'sales' then
    return new;
  end if;

  select coalesce(jsonb_object_agg(
    coalesce(nullif(item ->> 'sale_id', ''), item ->> 'id'),
    item
  ), '{}'::jsonb)
  into v_old_sales_by_id
  from jsonb_array_elements(coalesce(old.payload -> 'sales', '[]'::jsonb)) as item;

  for v_sale in
    select item
    from jsonb_array_elements(coalesce(new.payload -> 'sales', '[]'::jsonb))
      with ordinality as sale(item, ordinal)
    order by ordinal
  loop
    v_sale_id := coalesce(nullif(v_sale ->> 'sale_id', ''), v_sale ->> 'id');
    v_old_sale := v_old_sales_by_id -> v_sale_id;

    if v_sale ? 'vendorVisible'
       and jsonb_typeof(v_sale -> 'vendorVisible') <> 'boolean' then
      raise exception using errcode = '23514', message = 'SALE_VENDOR_VISIBILITY_MUST_BE_BOOLEAN';
    end if;

    if v_old_sale is null then
      if not (v_sale ? 'vendorVisible') then
        v_sale := v_sale || jsonb_build_object('vendorVisible', true);
      end if;
    else
      if v_old_sale ? 'vendorVisible'
         and jsonb_typeof(v_old_sale -> 'vendorVisible') <> 'boolean' then
        raise exception using errcode = '23514', message = 'SALE_VENDOR_VISIBILITY_MUST_BE_BOOLEAN';
      end if;

      v_old_visible := case
        when v_old_sale ? 'vendorVisible' then (v_old_sale ->> 'vendorVisible')::boolean
        else true
      end;
      v_new_visible := case
        when v_sale ? 'vendorVisible' then (v_sale ->> 'vendorVisible')::boolean
        else true
      end;

      if v_old_visible is distinct from v_new_visible
         and current_setting('kc.allow_sale_vendor_visibility_change', true) is distinct from 'on' then
        raise exception using errcode = '42501', message = 'SALE_VENDOR_VISIBILITY_REQUIRES_DEDICATED_ADMIN_OPERATION';
      end if;
    end if;

    v_sales := v_sales || jsonb_build_array(v_sale);
  end loop;

  new.payload := jsonb_set(new.payload, '{sales}', v_sales, false);
  return new;
end
$$;

revoke all on function private.kc_guard_sale_vendor_visibility()
from public, anon, authenticated;

drop trigger if exists kc_pos_state_01_sale_vendor_visibility_guard on public.kc_pos_state;
create trigger kc_pos_state_01_sale_vendor_visibility_guard
before update on public.kc_pos_state
for each row execute function private.kc_guard_sale_vendor_visibility();

create or replace function public.kc_admin_set_sale_vendor_visibility(
  p_sale_id text,
  p_vendor_visible boolean,
  p_expected_updated_at timestamptz
)
returns table (
  payload jsonb,
  updated_at timestamptz,
  sale_id text,
  vendor_visible boolean
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_sale_id text := btrim(coalesce(p_sale_id, ''));
  v_payload jsonb;
  v_current_updated_at timestamptz;
  v_sales jsonb;
  v_updated_at timestamptz;
begin
  if not private.kc_is_admin() then
    raise exception using errcode = '42501', message = 'KICKS CENTER active admin access required';
  end if;
  if v_sale_id = '' then
    raise exception using errcode = '22023', message = 'SALE_ID_REQUIRED';
  end if;
  if p_vendor_visible is null then
    raise exception using errcode = '22004', message = 'SALE_VENDOR_VISIBILITY_REQUIRED';
  end if;
  if p_expected_updated_at is null then
    raise exception using errcode = '22004', message = 'Expected version is required';
  end if;

  select state.payload, state.updated_at
  into v_payload, v_current_updated_at
  from public.kc_pos_state as state
  where state.id = 'main'
  for update;

  if v_payload is null then
    raise exception using errcode = 'P0002', message = 'POS_STATE_NOT_FOUND';
  end if;
  if v_current_updated_at is distinct from p_expected_updated_at then
    raise exception using errcode = '40001', message = 'POS data changed in another session; reload required';
  end if;
  if not exists (
    select 1
    from jsonb_array_elements(coalesce(v_payload -> 'sales', '[]'::jsonb)) as sale
    where coalesce(nullif(sale ->> 'sale_id', ''), sale ->> 'id') = v_sale_id
  ) then
    raise exception using errcode = 'P0002', message = 'SALE_NOT_FOUND';
  end if;

  select coalesce(jsonb_agg(
    case
      when coalesce(nullif(sale ->> 'sale_id', ''), sale ->> 'id') = v_sale_id
        then sale || jsonb_build_object('vendorVisible', p_vendor_visible)
      else sale
    end
    order by ordinal
  ), '[]'::jsonb)
  into v_sales
  from jsonb_array_elements(coalesce(v_payload -> 'sales', '[]'::jsonb))
    with ordinality as item(sale, ordinal);

  v_payload := jsonb_set(v_payload, '{sales}', v_sales, false);
  perform private.kc_assert_pos_financial_integrity(v_payload);
  perform private.kc_assert_stage1_core(v_payload);
  perform set_config('kc.allow_sale_vendor_visibility_change', 'on', true);
  perform set_config(
    'kc.action_summary',
    '修改供應商銷售可見性 | sale_id=' || v_sale_id
      || ' | vendor_visible=' || p_vendor_visible::text,
    true
  );

  update public.kc_pos_state as state
  set payload = v_payload,
      updated_at = clock_timestamp()
  where state.id = 'main'
  returning state.payload, state.updated_at
  into v_payload, v_updated_at;

  return query select v_payload, v_updated_at, v_sale_id, p_vendor_visible;
end
$$;

revoke all on function public.kc_admin_set_sale_vendor_visibility(text, boolean, timestamptz)
from public, anon, authenticated;
grant execute on function public.kc_admin_set_sale_vendor_visibility(text, boolean, timestamptz)
to authenticated;

create or replace function private.kc_build_vendor_portal_snapshot(p_vendor_id text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_vendor_id text := btrim(coalesce(p_vendor_id, ''));
  v_payload jsonb;
  v_vendor jsonb;
  v_products jsonb;
  v_sales jsonb;
  v_settlements jsonb;
begin
  if v_vendor_id = '' then
    raise exception using errcode = '22023', message = 'Vendor ID is required';
  end if;
  begin
    perform v_vendor_id::uuid;
  exception when invalid_text_representation then
    raise exception using errcode = '22023', message = 'Vendor ID must be a UUID';
  end;

  select state.payload into v_payload
  from public.kc_pos_state as state
  where state.id = 'main';
  if v_payload is null then
    raise exception using errcode = 'P0002', message = 'POS state not found';
  end if;

  select jsonb_strip_nulls(jsonb_build_object(
    'id', item -> 'id', 'code', item -> 'code', 'codes', item -> 'codes',
    'name', item -> 'name', 'phone', item -> 'phone', 'joined', item -> 'joined'
  )) into v_vendor
  from jsonb_array_elements(v_payload -> 'vendors') as item
  where item ->> 'id' = v_vendor_id
  limit 1;
  if v_vendor is null then
    raise exception using errcode = 'P0002', message = 'Vendor not found';
  end if;

  select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
    'id', item -> 'id', 'code', item -> 'code', 'category', item -> 'category',
    'name', item -> 'name', 'brand', item -> 'brand', 'model', item -> 'model',
    'usSize', item -> 'usSize', 'cmSize', item -> 'cmSize', 'color', item -> 'color',
    'cost', item -> 'cost',
    'status', case when exists (
      select 1 from jsonb_array_elements(v_payload -> 'sales') as hidden_sale
      where hidden_sale ->> 'productId' = item ->> 'id'
        and case
          when not (hidden_sale ? 'vendorVisible') then false
          when jsonb_typeof(hidden_sale -> 'vendorVisible') = 'boolean'
            then not (hidden_sale ->> 'vendorVisible')::boolean
          else true
        end
    ) then to_jsonb('在庫'::text) else item -> 'status' end,
    'packaging', item -> 'packaging', 'consignmentStart', item -> 'consignmentStart',
    'consignmentEnd', item -> 'consignmentEnd', 'createdAt', item -> 'createdAt'
  )) order by ordinal), '[]'::jsonb) into v_products
  from jsonb_array_elements(v_payload -> 'products') with ordinality as product(item, ordinal)
  where item ->> 'vendorId' = v_vendor_id;

  select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
    'id', sale -> 'id', 'productId', sale -> 'productId', 'cost', sale -> 'cost',
    'soldAt', sale -> 'soldAt', 'settled', sale -> 'settled',
    'settlementId', sale -> 'settlementId'
  )) order by ordinal), '[]'::jsonb) into v_sales
  from jsonb_array_elements(v_payload -> 'sales') with ordinality as sales(sale, ordinal)
  where case
      when not (sale ? 'vendorVisible') then true
      when jsonb_typeof(sale -> 'vendorVisible') = 'boolean'
        then (sale ->> 'vendorVisible')::boolean
      else false
    end
    and exists (
      select 1 from jsonb_array_elements(v_payload -> 'products') as product
      where product ->> 'id' = sale ->> 'productId'
        and product ->> 'vendorId' = v_vendor_id
    );

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', projected.settlement -> 'id',
    'saleIds', projected.visible_sale_ids,
    'payout', projected.visible_payout,
    'completedAt', projected.settlement -> 'completedAt'
  ) order by projected.ordinal), '[]'::jsonb) into v_settlements
  from (
    select settlement, ordinal,
      coalesce((
        select jsonb_agg(to_jsonb(sale_id.value) order by sale_id.ordinal)
        from jsonb_array_elements_text(coalesce(settlement -> 'saleIds', '[]'::jsonb))
          with ordinality as sale_id(value, ordinal)
        join jsonb_array_elements(v_payload -> 'sales') as sale
          on sale ->> 'id' = sale_id.value
        where case
          when not (sale ? 'vendorVisible') then true
          when jsonb_typeof(sale -> 'vendorVisible') = 'boolean'
            then (sale ->> 'vendorVisible')::boolean
          else false
        end
      ), '[]'::jsonb) as visible_sale_ids,
      coalesce((
        select sum(coalesce(nullif(sale ->> 'return_price', '')::numeric,
                            nullif(sale ->> 'cost', '')::numeric))
        from jsonb_array_elements_text(coalesce(settlement -> 'saleIds', '[]'::jsonb)) as sale_id
        join jsonb_array_elements(v_payload -> 'sales') as sale
          on sale ->> 'id' = sale_id.value
        where case
          when not (sale ? 'vendorVisible') then true
          when jsonb_typeof(sale -> 'vendorVisible') = 'boolean'
            then (sale ->> 'vendorVisible')::boolean
          else false
        end
      ), 0) as visible_payout
    from jsonb_array_elements(v_payload -> 'settlements') with ordinality as records(settlement, ordinal)
    where settlement ->> 'vendorId' = v_vendor_id
  ) as projected
  where jsonb_array_length(projected.visible_sale_ids) > 0;

  return jsonb_build_object(
    'vendor', v_vendor, 'products', v_products, 'sales', v_sales, 'settlements', v_settlements
  );
end
$$;

revoke all on function private.kc_build_vendor_portal_snapshot(text)
from public, anon, authenticated;

notify pgrst, 'reload schema';

commit;

begin;

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
    'id', item -> 'id',
    'code', item -> 'code',
    'codes', item -> 'codes',
    'name', item -> 'name',
    'phone', item -> 'phone',
    'joined', item -> 'joined'
  )) into v_vendor
  from jsonb_array_elements(v_payload -> 'vendors') as item
  where item ->> 'id' = v_vendor_id
  limit 1;

  if v_vendor is null then
    raise exception using errcode = 'P0002', message = 'Vendor not found';
  end if;

  select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
    'id', item -> 'id',
    'code', item -> 'code',
    'category', item -> 'category',
    'name', item -> 'name',
    'brand', item -> 'brand',
    'model', item -> 'model',
    'usSize', item -> 'usSize',
    'cmSize', item -> 'cmSize',
    'color', item -> 'color',
    'cost', item -> 'cost',
    'status', item -> 'status',
    'packaging', item -> 'packaging',
    'consignmentStart', item -> 'consignmentStart',
    'consignmentEnd', item -> 'consignmentEnd',
    'createdAt', item -> 'createdAt'
  ))), '[]'::jsonb) into v_products
  from jsonb_array_elements(v_payload -> 'products') as item
  where item ->> 'vendorId' = v_vendor_id;

  select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
    'id', sale -> 'id',
    'productId', sale -> 'productId',
    'cost', sale -> 'cost',
    'soldAt', sale -> 'soldAt',
    'settled', sale -> 'settled',
    'settlementId', sale -> 'settlementId'
  ))), '[]'::jsonb) into v_sales
  from jsonb_array_elements(v_payload -> 'sales') as sale
  where exists (
    select 1
    from jsonb_array_elements(v_payload -> 'products') as product
    where product ->> 'id' = sale ->> 'productId'
      and product ->> 'vendorId' = v_vendor_id
  );

  select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
    'id', settlement -> 'id',
    'saleIds', settlement -> 'saleIds',
    'payout', settlement -> 'payout',
    'completedAt', settlement -> 'completedAt'
  ))), '[]'::jsonb) into v_settlements
  from jsonb_array_elements(v_payload -> 'settlements') as settlement
  where settlement ->> 'vendorId' = v_vendor_id;

  return jsonb_build_object(
    'vendor', v_vendor,
    'products', v_products,
    'sales', v_sales,
    'settlements', v_settlements
  );
end
$$;

revoke all on function private.kc_build_vendor_portal_snapshot(text)
from public, anon, authenticated;

commit;

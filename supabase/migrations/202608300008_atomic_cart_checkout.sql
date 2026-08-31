begin;

-- scan_code contract: trim outer spaces and uppercase letters only. Internal
-- spaces, hyphens, zero padding and all other formatting remain significant.
create or replace function private.kc_assert_pos_financial_integrity(p_payload jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1
    from jsonb_array_elements(p_payload -> 'products') as product
    group by product ->> 'id'
    having product ->> 'id' is null or count(*) > 1
  ) then
    raise exception using errcode = '23505', message = 'Duplicate or missing product system ID';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_payload -> 'products') as product
    group by upper(btrim(product ->> 'code'))
    having upper(btrim(product ->> 'code')) = '' or count(*) > 1
  ) then
    raise exception using errcode = '23505', message = 'Duplicate or missing product code';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_payload -> 'sales') as sale
    group by sale ->> 'id'
    having sale ->> 'id' is null or count(*) > 1
  ) then
    raise exception using errcode = '23505', message = 'Duplicate or missing sale system ID';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_payload -> 'sales') as sale
    group by sale ->> 'productId'
    having sale ->> 'productId' is null or count(*) > 1
  ) then
    raise exception using errcode = '23505', message = 'A product cannot have more than one sale record';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_payload -> 'settlements') as settlement
    group by settlement ->> 'id'
    having settlement ->> 'id' is null or count(*) > 1
  ) then
    raise exception using errcode = '23505', message = 'Duplicate or missing settlement system ID';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_payload -> 'settlements') as settlement
    cross join lateral jsonb_array_elements_text(
      coalesce(settlement -> 'saleIds', '[]'::jsonb)
    ) as sale_id
    group by sale_id.value
    having count(*) > 1
  ) then
    raise exception using errcode = '23505', message = 'A sale cannot be included in more than one settlement';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_payload -> 'sales') as sale
    where not exists (
      select 1
      from jsonb_array_elements(p_payload -> 'products') as product
      where product ->> 'id' = sale ->> 'productId'
    )
  ) then
    raise exception using errcode = '23503', message = 'Sale references a missing product';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_payload -> 'settlements') as settlement
    cross join lateral jsonb_array_elements_text(
      coalesce(settlement -> 'saleIds', '[]'::jsonb)
    ) as sale_id
    where not exists (
      select 1
      from jsonb_array_elements(p_payload -> 'sales') as sale
      where sale ->> 'id' = sale_id.value
    )
  ) then
    raise exception using errcode = '23503', message = 'Settlement references a missing sale';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_payload -> 'settlements') as settlement
    cross join lateral jsonb_array_elements_text(
      coalesce(settlement -> 'saleIds', '[]'::jsonb)
    ) as sale_id
    join jsonb_array_elements(p_payload -> 'sales') as sale
      on sale ->> 'id' = sale_id.value
    join jsonb_array_elements(p_payload -> 'products') as product
      on product ->> 'id' = sale ->> 'productId'
    where settlement ->> 'vendorId' is distinct from product ->> 'vendorId'
  ) then
    raise exception using errcode = '23514', message = 'Settlement contains a sale from another vendor';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_payload -> 'sales') as sale
    left join lateral (
      select
        count(*) as reference_count,
        max(settlement ->> 'id') as settlement_id
      from jsonb_array_elements(p_payload -> 'settlements') as settlement
      cross join lateral jsonb_array_elements_text(
        coalesce(settlement -> 'saleIds', '[]'::jsonb)
      ) as sale_id
      where sale_id.value = sale ->> 'id'
    ) as settlement_refs on true
    where (
      coalesce((sale ->> 'settled')::boolean, false)
      and (
        settlement_refs.reference_count <> 1
        or sale ->> 'settlementId' is distinct from settlement_refs.settlement_id
      )
    ) or (
      not coalesce((sale ->> 'settled')::boolean, false)
      and settlement_refs.reference_count <> 0
    )
  ) then
    raise exception using errcode = '23514', message = 'Sale settlement status is inconsistent';
  end if;
end
$$;

create or replace function private.kc_assert_stage1_core(p_payload jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1
    from jsonb_array_elements(p_payload -> 'products') as product
    where nullif(product ->> 'inventory_id', '') is null
       or nullif(product ->> 'scan_code', '') is null
       or product ->> 'inventory_id' is distinct from product ->> 'id'
       or upper(btrim(product ->> 'scan_code'))
          is distinct from upper(btrim(product ->> 'code'))
  ) then
    raise exception using errcode = '23514', message = 'Invalid inventory_id or scan_code alias';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_payload -> 'products') as product
    group by product ->> 'inventory_id'
    having count(*) > 1
  ) then
    raise exception using errcode = '23505', message = 'Duplicate inventory_id';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_payload -> 'products') as product
    group by upper(btrim(product ->> 'scan_code'))
    having count(*) > 1
  ) then
    raise exception using errcode = '23505', message = 'SCAN_CODE_EXISTS';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_payload -> 'sales') as sale
    where nullif(sale ->> 'sale_id', '') is null
       or nullif(sale ->> 'inventory_id', '') is null
       or sale ->> 'sale_id' is distinct from sale ->> 'id'
       or sale ->> 'inventory_id' is distinct from sale ->> 'productId'
       or sale ->> 'settlement_status' not in ('pending', 'deferred', 'settled')
       or (sale ? 'checkout_id' and nullif(btrim(sale ->> 'checkout_id'), '') is null)
  ) then
    raise exception using errcode = '23514', message = 'Invalid stage-1 sale fields';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_payload -> 'sales') as sale
    group by sale ->> 'sale_id'
    having count(*) > 1
  ) then
    raise exception using errcode = '23505', message = 'Duplicate sale_id';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_payload -> 'sales') as sale
    group by sale ->> 'inventory_id'
    having count(*) > 1
  ) then
    raise exception using errcode = '23505', message = 'INVENTORY_ALREADY_SOLD';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_payload -> 'sales') as sale
    left join lateral (
      select product
      from jsonb_array_elements(p_payload -> 'products') as product
      where product ->> 'inventory_id' = sale ->> 'inventory_id'
      limit 1
    ) as inventory on true
    where inventory.product is null
       or sale ->> 'vendor_id' is distinct from inventory.product ->> 'vendorId'
       or (
         sale ->> 'settlement_status' in ('pending', 'deferred')
         and inventory.product ->> 'status' <> '已售出'
       )
       or (
         sale ->> 'settlement_status' = 'settled'
         and inventory.product ->> 'status' <> '已銷帳'
       )
  ) then
    raise exception using errcode = '23514', message = 'Sale and inventory state are inconsistent';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_payload -> 'products') as product
    where product ->> 'status' in ('已售出', '已銷帳')
      and not exists (
        select 1
        from jsonb_array_elements(p_payload -> 'sales') as sale
        where sale ->> 'inventory_id' = product ->> 'inventory_id'
      )
  ) then
    raise exception using errcode = '23514', message = 'Sold inventory is missing its sale record';
  end if;
end
$$;

-- Keep the admin inventory workflow unchanged except for the corrected
-- scan_code comparison contract.
create or replace function private.kc_admin_create_inventory_item_impl(
  p_item jsonb,
  p_expected_updated_at timestamptz
)
returns table (payload jsonb, updated_at timestamptz, inventory_id text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_payload jsonb;
  v_current_updated_at timestamptz;
  v_updated_at timestamptz;
  v_inventory_id text;
  v_scan_code text;
  v_created_at timestamptz;
  v_product jsonb;
begin
  if not private.kc_is_admin() then
    raise exception using errcode = '42501', message = 'KICKS CENTER admin access required';
  end if;

  if p_item is null or jsonb_typeof(p_item) <> 'object' then
    raise exception using errcode = '22023', message = 'Invalid inventory item';
  end if;

  select state.payload, state.updated_at
  into v_payload, v_current_updated_at
  from public.kc_pos_state as state
  where state.id = 'main'
  for update;

  if v_current_updated_at is distinct from p_expected_updated_at then
    raise exception using errcode = '40001', message = 'POS data changed in another session; reload required';
  end if;

  v_scan_code := upper(btrim(coalesce(p_item ->> 'scan_code', '')));
  if v_scan_code = '' then
    raise exception using errcode = '22023', message = 'SCAN_CODE_REQUIRED';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(v_payload -> 'products') as product
    where upper(btrim(product ->> 'scan_code')) = v_scan_code
  ) then
    raise exception using errcode = '23505', message = 'SCAN_CODE_EXISTS';
  end if;

  if not exists (
    select 1
    from jsonb_array_elements(v_payload -> 'vendors') as vendor
    where vendor ->> 'id' = p_item ->> 'vendorId'
  ) then
    raise exception using errcode = '23503', message = 'Vendor not found';
  end if;

  v_inventory_id := gen_random_uuid()::text;
  v_created_at := clock_timestamp();
  v_product := (
    p_item
    - 'inventory_id'
    - 'id'
    - 'code'
    - 'status'
    - 'createdAt'
    - 'history'
  ) || jsonb_build_object(
    'inventory_id', v_inventory_id,
    'scan_code', v_scan_code,
    'id', v_inventory_id,
    'code', v_scan_code,
    'status', '在庫',
    'createdAt', v_created_at,
    'history', jsonb_build_array(jsonb_build_object(
      'at', v_created_at,
      'action', '商品入庫',
      'note', '建立商品，位置 ' || coalesce(p_item ->> 'location', '-') || ' · inventory_id ' || v_inventory_id
    ))
  );

  v_payload := jsonb_set(
    v_payload,
    '{products}',
    jsonb_build_array(v_product) || (v_payload -> 'products')
  );

  perform private.kc_assert_pos_financial_integrity(v_payload);
  perform private.kc_assert_stage1_core(v_payload);
  perform set_config('kc.action_summary', '商品入庫 ' || v_scan_code, true);

  update public.kc_pos_state
  set payload = v_payload,
      updated_at = clock_timestamp()
  where id = 'main'
  returning kc_pos_state.updated_at into v_updated_at;

  return query select v_payload, v_updated_at, v_inventory_id;
end
$$;

revoke all on function private.kc_admin_create_inventory_item_impl(jsonb, timestamptz)
  from public, anon, authenticated;

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

  v_scan_code := upper(btrim(coalesce(p_scan_code, '')));
  if v_scan_code = '' then
    raise exception using errcode = '22023', message = 'SCAN_CODE_REQUIRED';
  end if;

  select count(*)::integer
  into v_match_count
  from public.kc_pos_state as state
  cross join lateral jsonb_array_elements(state.payload -> 'products') as product
  where state.id = 'main'
    and upper(btrim(product ->> 'scan_code')) = v_scan_code;

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
    and upper(btrim(product ->> 'scan_code')) = v_scan_code
  limit 1;
end
$$;

-- One RPC call is one PostgreSQL transaction. The main state row is locked,
-- every cart line is validated, and the state is updated exactly once.
create or replace function public.kc_pos_complete_cart_sale(
  p_items jsonb,
  p_discount numeric,
  p_payment_method text
)
returns table (
  checkout_id text,
  sale_id text,
  inventory_id text,
  sold_at timestamptz,
  sold_price numeric,
  payment_method text,
  status text,
  item_count integer,
  subtotal numeric,
  discount numeric,
  total numeric
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_payload jsonb;
  v_item_count integer;
  v_match_count integer;
  v_subtotal numeric;
  v_total numeric;
  v_checkout_id text;
  v_sold_at timestamptz;
  v_new_sales jsonb := '[]'::jsonb;
  v_sale_meta jsonb := '{}'::jsonb;
  v_products jsonb;
  v_sale jsonb;
  v_sale_id text;
  v_line record;
  v_line_discount numeric;
  v_allocated_discount numeric := 0;
  v_line_sold_price numeric;
begin
  if not private.kc_is_staff() then
    raise exception using errcode = '42501', message = 'KICKS CENTER POS access required';
  end if;

  if p_items is null
    or jsonb_typeof(p_items) <> 'array'
    or jsonb_array_length(p_items) = 0
  then
    raise exception using errcode = '22023', message = 'CART_REQUIRED';
  end if;

  if p_discount is null
    or p_discount < 0
    or nullif(btrim(coalesce(p_payment_method, '')), '') is null
    or p_payment_method not in ('現金', '信用卡', '轉帳', '其他')
  then
    raise exception using errcode = '22023', message = 'INVALID_CART_INPUT';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_items) as item
    where jsonb_typeof(item) <> 'object'
       or not (item ? 'inventory_id')
       or jsonb_typeof(item -> 'inventory_id') <> 'string'
       or nullif(btrim(item ->> 'inventory_id'), '') is null
       or not (item ? 'expected_price')
       or jsonb_typeof(item -> 'expected_price') <> 'number'
       or (item ->> 'expected_price')::numeric < 0
       or item - 'inventory_id' - 'expected_price' <> '{}'::jsonb
  ) then
    raise exception using errcode = '22023', message = 'INVALID_CART_ITEM';
  end if;

  v_item_count := jsonb_array_length(p_items);
  if (
    select count(distinct item ->> 'inventory_id')
    from jsonb_array_elements(p_items) as item
  ) <> v_item_count then
    raise exception using errcode = '23505', message = 'CART_DUPLICATE_INVENTORY';
  end if;

  select state.payload
  into v_payload
  from public.kc_pos_state as state
  where state.id = 'main'
  for update;

  if v_payload is null then
    raise exception using errcode = 'P0002', message = 'POS_STATE_NOT_FOUND';
  end if;

  select count(*)::integer
  into v_match_count
  from jsonb_array_elements(p_items) as item
  join jsonb_array_elements(v_payload -> 'products') as product
    on product ->> 'inventory_id' = item ->> 'inventory_id';

  if v_match_count <> v_item_count then
    raise exception using errcode = 'P0002', message = 'CART_INVENTORY_NOT_FOUND';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_items) as item
    join jsonb_array_elements(v_payload -> 'products') as product
      on product ->> 'inventory_id' = item ->> 'inventory_id'
    where nullif(product ->> 'price', '')::numeric
      is distinct from (item ->> 'expected_price')::numeric
  ) then
    raise exception using errcode = '40001', message = 'CART_PRICE_CHANGED';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_items) as item
    join jsonb_array_elements(v_payload -> 'products') as product
      on product ->> 'inventory_id' = item ->> 'inventory_id'
    where product ->> 'status' <> '在庫'
  ) then
    raise exception using errcode = '23514', message = 'CART_INVENTORY_NOT_AVAILABLE';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_items) as item
    join jsonb_array_elements(v_payload -> 'sales') as sale
      on sale ->> 'inventory_id' = item ->> 'inventory_id'
  ) then
    raise exception using errcode = '23505', message = 'CART_INVENTORY_ALREADY_SOLD';
  end if;

  select sum((product ->> 'price')::numeric)
  into v_subtotal
  from jsonb_array_elements(p_items) as item
  join jsonb_array_elements(v_payload -> 'products') as product
    on product ->> 'inventory_id' = item ->> 'inventory_id';

  if v_subtotal is null or v_subtotal < 0 or p_discount > v_subtotal then
    raise exception using errcode = '22023', message = 'CART_DISCOUNT_OUT_OF_RANGE';
  end if;

  v_total := v_subtotal - p_discount;
  v_checkout_id := gen_random_uuid()::text;
  v_sold_at := clock_timestamp();

  for v_line in
    select
      item ->> 'inventory_id' as inventory_id,
      product as product,
      (product ->> 'price')::numeric as original_price,
      ordinal::integer as ordinal
    from jsonb_array_elements(p_items) with ordinality as input(item, ordinal)
    join jsonb_array_elements(v_payload -> 'products') as product
      on product ->> 'inventory_id' = item ->> 'inventory_id'
    order by ordinal
  loop
    if v_line.ordinal = v_item_count then
      v_line_discount := p_discount - v_allocated_discount;
    elsif v_subtotal = 0 then
      v_line_discount := 0;
    else
      v_line_discount := least(
        round(p_discount * v_line.original_price / v_subtotal),
        p_discount - v_allocated_discount
      );
    end if;

    v_line_sold_price := v_line.original_price - v_line_discount;
    if v_line_discount < 0
      or v_line_discount > v_line.original_price
      or v_line_sold_price < 0
    then
      raise exception using errcode = '22023', message = 'CART_DISCOUNT_ALLOCATION_INVALID';
    end if;

    v_sale_id := gen_random_uuid()::text;
    v_sale := jsonb_build_object(
      'checkout_id', v_checkout_id,
      'sale_id', v_sale_id,
      'inventory_id', v_line.inventory_id,
      'sold_at', v_sold_at,
      'sold_price', v_line_sold_price,
      'return_price', (v_line.product ->> 'cost')::numeric,
      'vendor_id', v_line.product ->> 'vendorId',
      'payment_method', p_payment_method,
      'settlement_status', 'pending',
      'id', v_sale_id,
      'productId', v_line.inventory_id,
      'soldAt', v_sold_at,
      'price', v_line_sold_price,
      'cost', (v_line.product ->> 'cost')::numeric,
      'profit', v_line_sold_price - (v_line.product ->> 'cost')::numeric,
      'payment', p_payment_method,
      'discount', v_line_discount,
      'settled', false
    );

    v_new_sales := v_new_sales || jsonb_build_array(v_sale);
    v_sale_meta := v_sale_meta || jsonb_build_object(
      v_line.inventory_id,
      jsonb_build_object(
        'sale_id', v_sale_id,
        'sold_price', v_line_sold_price
      )
    );
    v_allocated_discount := v_allocated_discount + v_line_discount;
  end loop;

  if v_allocated_discount <> p_discount
    or (
      select coalesce(sum((sale ->> 'sold_price')::numeric), 0)
      from jsonb_array_elements(v_new_sales) as sale
    ) <> v_total
  then
    raise exception using errcode = '23514', message = 'CART_TOTAL_MISMATCH';
  end if;

  select jsonb_agg(
    case
      when v_sale_meta ? (product ->> 'inventory_id') then
        jsonb_set(
          jsonb_set(product, '{status}', to_jsonb('已售出'::text)),
          '{history}',
          coalesce(product -> 'history', '[]'::jsonb) || jsonb_build_array(
            jsonb_build_object(
              'at', v_sold_at,
              'action', '商品售出',
              'note', p_payment_method
                || ' · 成交價 NT$ '
                || (v_sale_meta -> (product ->> 'inventory_id') ->> 'sold_price')
                || ' · sale_id '
                || (v_sale_meta -> (product ->> 'inventory_id') ->> 'sale_id')
                || ' · checkout_id '
                || v_checkout_id
            )
          )
        )
      else product
    end
    order by ordinal
  )
  into v_products
  from jsonb_array_elements(v_payload -> 'products') with ordinality as inventory(product, ordinal);

  v_payload := jsonb_set(v_payload, '{products}', v_products);
  v_payload := jsonb_set(
    v_payload,
    '{sales}',
    coalesce(v_payload -> 'sales', '[]'::jsonb) || v_new_sales
  );

  perform private.kc_assert_pos_financial_integrity(v_payload);
  perform private.kc_assert_stage1_core(v_payload);
  perform set_config(
    'kc.action_summary',
    'POS 批次售出 ' || v_item_count || ' 件 · checkout_id ' || v_checkout_id,
    true
  );

  update public.kc_pos_state
  set payload = v_payload,
      updated_at = clock_timestamp()
  where id = 'main';

  return query
  select
    v_checkout_id,
    sale ->> 'sale_id',
    sale ->> 'inventory_id',
    (sale ->> 'sold_at')::timestamptz,
    (sale ->> 'sold_price')::numeric,
    sale ->> 'payment_method',
    '已售出'::text,
    v_item_count,
    v_subtotal,
    p_discount,
    v_total
  from jsonb_array_elements(v_new_sales) with ordinality as created(sale, ordinal)
  order by ordinal;
end
$$;

revoke all on function public.kc_pos_lookup_inventory(text) from public, anon;
grant execute on function public.kc_pos_lookup_inventory(text) to authenticated;
revoke all on function public.kc_pos_complete_cart_sale(jsonb, numeric, text)
  from public, anon;
grant execute on function public.kc_pos_complete_cart_sale(jsonb, numeric, text)
  to authenticated;

notify pgrst, 'reload schema';

commit;

do $$
declare
  v_payload jsonb;
  v_products jsonb;
  v_sales jsonb;
begin
  select state.payload into v_payload
  from public.kc_pos_state as state
  where state.id = 'main';

  if v_payload is null then
    return;
  end if;

  select coalesce(
    jsonb_agg(
      product || jsonb_build_object(
        'inventory_id', coalesce(nullif(product ->> 'inventory_id', ''), product ->> 'id'),
        'scan_code', upper(regexp_replace(coalesce(product ->> 'scan_code', product ->> 'code'), '[[:space:]]+', '', 'g')),
        'id', coalesce(nullif(product ->> 'inventory_id', ''), product ->> 'id'),
        'code', upper(regexp_replace(coalesce(product ->> 'scan_code', product ->> 'code'), '[[:space:]]+', '', 'g'))
      )
      order by ordinal
    ),
    '[]'::jsonb
  ) into v_products
  from jsonb_array_elements(v_payload -> 'products') with ordinality as item(product, ordinal);

  v_payload := jsonb_set(v_payload, '{products}', v_products);

  select coalesce(
    jsonb_agg(
      sale || jsonb_build_object(
        'sale_id', coalesce(nullif(sale ->> 'sale_id', ''), sale ->> 'id'),
        'inventory_id', coalesce(nullif(sale ->> 'inventory_id', ''), sale ->> 'productId'),
        'sold_at', coalesce(nullif(sale ->> 'sold_at', ''), sale ->> 'soldAt'),
        'sold_price', coalesce(sale -> 'sold_price', sale -> 'price'),
        'return_price', coalesce(sale -> 'return_price', sale -> 'cost'),
        'vendor_id', coalesce(
          nullif(sale ->> 'vendor_id', ''),
          (
            select product ->> 'vendorId'
            from jsonb_array_elements(v_products) as product
            where product ->> 'inventory_id' = coalesce(nullif(sale ->> 'inventory_id', ''), sale ->> 'productId')
            limit 1
          )
        ),
        'payment_method', coalesce(nullif(sale ->> 'payment_method', ''), sale ->> 'payment'),
        'settlement_status', coalesce(
          nullif(sale ->> 'settlement_status', ''),
          case when coalesce((sale ->> 'settled')::boolean, false) then 'settled' else 'pending' end
        ),
        'id', coalesce(nullif(sale ->> 'sale_id', ''), sale ->> 'id'),
        'productId', coalesce(nullif(sale ->> 'inventory_id', ''), sale ->> 'productId')
      )
      order by ordinal
    ),
    '[]'::jsonb
  ) into v_sales
  from jsonb_array_elements(v_payload -> 'sales') with ordinality as item(sale, ordinal);

  v_payload := jsonb_set(v_payload, '{sales}', v_sales);
  perform set_config('kc.action_summary', '第一階段核心欄位正規化', true);

  update public.kc_pos_state
  set payload = v_payload,
      updated_at = clock_timestamp()
  where id = 'main';
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
       or upper(regexp_replace(product ->> 'scan_code', '[[:space:]]+', '', 'g'))
          is distinct from upper(regexp_replace(product ->> 'code', '[[:space:]]+', '', 'g'))
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
    group by upper(regexp_replace(product ->> 'scan_code', '[[:space:]]+', '', 'g'))
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

revoke all on function private.kc_assert_stage1_core(jsonb) from public, anon, authenticated;

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
  v_old_payload jsonb;
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

  select state.payload into v_old_payload
  from public.kc_pos_state as state
  where state.id = 'main';

  if exists (
    select 1
    from jsonb_array_elements(v_old_payload -> 'products') as old_product
    where not exists (
      select 1
      from jsonb_array_elements(p_payload -> 'products') as new_product
      where new_product ->> 'inventory_id' = old_product ->> 'inventory_id'
    )
  ) then
    raise exception using errcode = '23514', message = 'inventory_id is immutable';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_payload -> 'products') as new_product
    where not exists (
      select 1
      from jsonb_array_elements(v_old_payload -> 'products') as old_product
      where old_product ->> 'inventory_id' = new_product ->> 'inventory_id'
    )
  ) then
    raise exception using errcode = '23514', message = 'Inventory creation must use the dedicated operation';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_payload -> 'sales') as new_sale
    where not exists (
      select 1
      from jsonb_array_elements(v_old_payload -> 'sales') as old_sale
      where old_sale ->> 'sale_id' = new_sale ->> 'sale_id'
    )
  ) then
    raise exception using errcode = '23514', message = 'Sale creation must use the atomic sale operation';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(v_old_payload -> 'sales') as old_sale
    left join lateral (
      select new_sale
      from jsonb_array_elements(p_payload -> 'sales') as new_sale
      where new_sale ->> 'sale_id' = old_sale ->> 'sale_id'
      limit 1
    ) as matched on true
    where matched.new_sale is null
       or old_sale -> 'inventory_id' is distinct from matched.new_sale -> 'inventory_id'
       or old_sale -> 'sold_at' is distinct from matched.new_sale -> 'sold_at'
       or old_sale -> 'sold_price' is distinct from matched.new_sale -> 'sold_price'
       or old_sale -> 'return_price' is distinct from matched.new_sale -> 'return_price'
       or old_sale -> 'vendor_id' is distinct from matched.new_sale -> 'vendor_id'
       or old_sale -> 'payment_method' is distinct from matched.new_sale -> 'payment_method'
  ) then
    raise exception using errcode = '23514', message = 'Completed sale facts are immutable';
  end if;

  perform private.kc_assert_pos_financial_integrity(p_payload);
  perform private.kc_assert_stage1_core(p_payload);

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

create or replace function public.kc_staff_create_inventory_item(
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
  if not private.kc_is_staff() then
    raise exception using errcode = '42501', message = 'KICKS CENTER staff access required';
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

  v_scan_code := upper(regexp_replace(btrim(coalesce(p_item ->> 'scan_code', '')), '[[:space:]]+', '', 'g'));
  if v_scan_code = '' then
    raise exception using errcode = '22023', message = 'SCAN_CODE_REQUIRED';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(v_payload -> 'products') as product
    where upper(regexp_replace(product ->> 'scan_code', '[[:space:]]+', '', 'g')) = v_scan_code
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

create or replace function public.kc_staff_sell_inventory_item(
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
declare
  v_payload jsonb;
  v_current_updated_at timestamptz;
  v_updated_at timestamptz;
  v_product jsonb;
  v_products jsonb;
  v_sale jsonb;
  v_sale_id text;
  v_sold_at timestamptz;
begin
  if not private.kc_is_staff() then
    raise exception using errcode = '42501', message = 'KICKS CENTER staff access required';
  end if;

  if nullif(btrim(coalesce(p_inventory_id, '')), '') is null
    or p_sold_price is null
    or p_sold_price <= 0
    or nullif(btrim(coalesce(p_payment_method, '')), '') is null
    or p_payment_method not in ('現金', '信用卡', '轉帳', '其他')
  then
    raise exception using errcode = '22023', message = 'Invalid sale input';
  end if;

  select state.payload, state.updated_at
  into v_payload, v_current_updated_at
  from public.kc_pos_state as state
  where state.id = 'main'
  for update;

  if v_current_updated_at is distinct from p_expected_updated_at then
    raise exception using errcode = '40001', message = 'POS data changed in another session; reload required';
  end if;

  select product into v_product
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
          coalesce(product -> 'history', '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
            'at', v_sold_at,
            'action', '商品售出',
            'note', p_payment_method || ' · 成交價 NT$ ' || p_sold_price || ' · sale_id ' || v_sale_id
          ))
        )
      else product
    end
    order by ordinal
  ) into v_products
  from jsonb_array_elements(v_payload -> 'products') with ordinality as item(product, ordinal);

  v_payload := jsonb_set(v_payload, '{products}', v_products);
  v_payload := jsonb_set(v_payload, '{sales}', (v_payload -> 'sales') || jsonb_build_array(v_sale));

  perform private.kc_assert_pos_financial_integrity(v_payload);
  perform private.kc_assert_stage1_core(v_payload);
  perform set_config('kc.action_summary', 'POS 售出 ' || (v_product ->> 'scan_code'), true);

  update public.kc_pos_state
  set payload = v_payload,
      updated_at = clock_timestamp()
  where id = 'main'
  returning kc_pos_state.updated_at into v_updated_at;

  return query select v_payload, v_updated_at, v_sale_id;
end
$$;

revoke all on function public.kc_staff_create_inventory_item(jsonb, timestamptz) from public, anon;
grant execute on function public.kc_staff_create_inventory_item(jsonb, timestamptz) to authenticated;
revoke all on function public.kc_staff_sell_inventory_item(text, numeric, text, numeric, timestamptz) from public, anon;
grant execute on function public.kc_staff_sell_inventory_item(text, numeric, text, numeric, timestamptz) to authenticated;

select private.kc_assert_pos_financial_integrity(payload),
       private.kc_assert_stage1_core(payload)
from public.kc_pos_state
where id = 'main';

begin;

create or replace function public.kc_admin_delete_inventory_item(
  p_inventory_id text,
  p_confirm_scan_code text,
  p_expected_updated_at timestamptz
)
returns table (
  payload jsonb,
  updated_at timestamptz,
  deleted_inventory_id text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_payload jsonb;
  v_current_updated_at timestamptz;
  v_updated_at timestamptz;
  v_product jsonb;
  v_next_products jsonb;
  v_next_payload jsonb;
  v_scan_code text;
  v_product_name text;
  v_deleted_at timestamptz;
  v_actor_id uuid;
begin
  if not private.kc_is_admin() then
    raise exception using
      errcode = '42501',
      message = 'KICKS CENTER active admin access required';
  end if;

  if nullif(btrim(coalesce(p_inventory_id, '')), '') is null then
    raise exception using errcode = '22023', message = 'INVENTORY_ID_REQUIRED';
  end if;

  if p_expected_updated_at is null then
    raise exception using errcode = '40001', message = 'POS data changed in another session; reload required';
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

  select product
    into v_product
  from jsonb_array_elements(coalesce(v_payload -> 'products', '[]'::jsonb)) as product
  where product ->> 'inventory_id' = p_inventory_id
  limit 1;

  if v_product is null then
    raise exception using errcode = 'P0002', message = 'INVENTORY_NOT_FOUND';
  end if;

  v_scan_code := v_product ->> 'scan_code';
  v_product_name := v_product ->> 'name';

  -- The second confirmation must match the complete stored scan code. No
  -- punctuation, internal whitespace or zero padding is removed or rewritten.
  if p_confirm_scan_code is distinct from v_scan_code then
    raise exception using errcode = '22023', message = 'DELETE_SCAN_CODE_CONFIRMATION_MISMATCH';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(coalesce(v_payload -> 'sales', '[]'::jsonb)) as sale
    where coalesce(nullif(sale ->> 'inventory_id', ''), sale ->> 'productId') = p_inventory_id
  ) then
    raise exception using errcode = '23503', message = 'INVENTORY_HAS_FINANCIAL_HISTORY';
  end if;

  -- Current settlements reference sale IDs. The direct inventory aliases are
  -- also checked defensively so legacy or future records cannot be orphaned.
  if exists (
    select 1
    from jsonb_array_elements(coalesce(v_payload -> 'settlements', '[]'::jsonb)) as settlement
    where settlement ->> 'inventory_id' = p_inventory_id
       or settlement ->> 'inventoryId' = p_inventory_id
       or exists (
         select 1
         from jsonb_array_elements_text(coalesce(settlement -> 'saleIds', '[]'::jsonb)) as settlement_sale_id
         join jsonb_array_elements(coalesce(v_payload -> 'sales', '[]'::jsonb)) as sale
           on coalesce(nullif(sale ->> 'sale_id', ''), sale ->> 'id') = settlement_sale_id.value
         where coalesce(nullif(sale ->> 'inventory_id', ''), sale ->> 'productId') = p_inventory_id
       )
  ) then
    raise exception using errcode = '23503', message = 'INVENTORY_HAS_FINANCIAL_HISTORY';
  end if;

  select coalesce(jsonb_agg(item.product order by item.ordinality), '[]'::jsonb)
    into v_next_products
  from jsonb_array_elements(coalesce(v_payload -> 'products', '[]'::jsonb))
       with ordinality as item(product, ordinality)
  where item.product ->> 'inventory_id' <> p_inventory_id;

  if jsonb_array_length(v_next_products)
     <> jsonb_array_length(coalesce(v_payload -> 'products', '[]'::jsonb)) - 1 then
    raise exception using errcode = '23514', message = 'DELETE_INVENTORY_COUNT_MISMATCH';
  end if;

  v_next_payload := jsonb_set(v_payload, '{products}', v_next_products, false);
  perform private.kc_assert_pos_financial_integrity(v_next_payload);
  perform private.kc_assert_stage1_core(v_next_payload);

  v_deleted_at := clock_timestamp();
  v_actor_id := auth.uid();
  perform set_config(
    'kc.action_summary',
    '永久刪除商品'
      || ' | inventory_id=' || p_inventory_id
      || ' | 貨號=' || v_scan_code
      || ' | 商品名稱=' || coalesce(v_product_name, '')
      || ' | 執行帳號=' || coalesce(v_actor_id::text, 'unknown')
      || ' | 刪除時間=' || v_deleted_at::text,
    true
  );

  update public.kc_pos_state
  set payload = v_next_payload,
      updated_at = v_deleted_at
  where id = 'main'
  returning kc_pos_state.updated_at into v_updated_at;

  if v_updated_at is null then
    raise exception using errcode = 'P0002', message = 'POS_STATE_NOT_FOUND';
  end if;

  return query select v_next_payload, v_updated_at, p_inventory_id;
end
$$;

revoke all on function public.kc_admin_delete_inventory_item(text, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.kc_admin_delete_inventory_item(text, text, timestamptz)
  to authenticated;

commit;

begin;

create or replace function public.kc_admin_update_inventory_item(
  p_inventory_id text,
  p_changes jsonb,
  p_confirm_new_scan_code text,
  p_expected_updated_at timestamptz
)
returns table (payload jsonb, updated_at timestamptz, updated_inventory_id text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inventory_id text := btrim(coalesce(p_inventory_id, ''));
  v_payload jsonb;
  v_current_updated_at timestamptz;
  v_product jsonb;
  v_edited_product jsonb;
  v_products jsonb;
  v_next_payload jsonb;
  v_updated_at timestamptz;
  v_changed_at timestamptz := clock_timestamp();
  v_old_scan_code text;
  v_new_scan_code text;
  v_vendor_id text;
  v_cost numeric;
  v_price numeric;
  v_has_financial_history boolean;
  v_action text;
  v_note text;
begin
  if not private.kc_is_admin() then
    raise exception using errcode = '42501', message = 'KICKS CENTER active admin access required';
  end if;
  if v_inventory_id = '' then
    raise exception using errcode = '22023', message = 'INVENTORY_ID_REQUIRED';
  end if;
  if p_expected_updated_at is null then
    raise exception using errcode = '40001', message = 'POS data changed in another session; reload required';
  end if;
  if p_changes is null or jsonb_typeof(p_changes) <> 'object' then
    raise exception using errcode = '22023', message = 'INVENTORY_CHANGES_REQUIRED';
  end if;
  if p_changes - array[
    'category','name','brand','model','usSize','cmSize','color','cost','price',
    'vendorId','packaging','location','consignmentStart','note','scan_code'
  ] <> '{}'::jsonb then
    raise exception using errcode = '22023', message = 'INVENTORY_EDIT_FIELD_NOT_ALLOWED';
  end if;
  if not (p_changes ?& array[
    'category','name','brand','model','usSize','cmSize','color','cost','price',
    'vendorId','packaging','location','consignmentStart','note'
  ]) then
    raise exception using errcode = '22023', message = 'INVENTORY_EDIT_FIELDS_INCOMPLETE';
  end if;
  if exists (
    select 1 from unnest(array[
      'category','name','brand','model','usSize','cmSize','color','vendorId',
      'packaging','location','consignmentStart'
    ]) as required_key
    where nullif(btrim(p_changes ->> required_key), '') is null
  ) then
    raise exception using errcode = '22023', message = 'INVENTORY_EDIT_REQUIRED_FIELD';
  end if;
  if jsonb_typeof(p_changes -> 'cost') <> 'number'
     or jsonb_typeof(p_changes -> 'price') <> 'number' then
    raise exception using errcode = '22023', message = 'INVENTORY_EDIT_INVALID_PRICE';
  end if;
  v_cost := (p_changes ->> 'cost')::numeric;
  v_price := (p_changes ->> 'price')::numeric;
  if v_cost < 0 or v_price < 0 then
    raise exception using errcode = '22023', message = 'INVENTORY_EDIT_INVALID_PRICE';
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

  select product into v_product
  from jsonb_array_elements(coalesce(v_payload -> 'products', '[]'::jsonb)) as product
  where product ->> 'inventory_id' = v_inventory_id
  limit 1;
  if v_product is null then
    raise exception using errcode = 'P0002', message = 'INVENTORY_NOT_FOUND';
  end if;

  v_vendor_id := btrim(p_changes ->> 'vendorId');
  if not exists (
    select 1 from jsonb_array_elements(coalesce(v_payload -> 'vendors', '[]'::jsonb)) as vendor
    where vendor ->> 'id' = v_vendor_id
  ) then
    raise exception using errcode = '23503', message = 'VENDOR_NOT_FOUND';
  end if;

  select exists (
    select 1
    from jsonb_array_elements(coalesce(v_payload -> 'sales', '[]'::jsonb)) as sale
    where sale ->> 'inventory_id' = v_inventory_id or sale ->> 'productId' = v_inventory_id
  ) or exists (
    select 1
    from jsonb_array_elements(coalesce(v_payload -> 'settlements', '[]'::jsonb)) as settlement
    where settlement ->> 'inventory_id' = v_inventory_id
       or settlement ->> 'inventoryId' = v_inventory_id
       or exists (
         select 1
         from jsonb_array_elements_text(coalesce(settlement -> 'saleIds', '[]'::jsonb)) as settlement_sale_id
         join jsonb_array_elements(coalesce(v_payload -> 'sales', '[]'::jsonb)) as sale
           on coalesce(nullif(sale ->> 'sale_id', ''), sale ->> 'id') = settlement_sale_id.value
         where coalesce(nullif(sale ->> 'inventory_id', ''), sale ->> 'productId') = v_inventory_id
       )
  ) into v_has_financial_history;

  if v_has_financial_history and (
    v_vendor_id is distinct from v_product ->> 'vendorId'
    or v_cost is distinct from (v_product ->> 'cost')::numeric
  ) then
    raise exception using errcode = '23503', message = 'INVENTORY_FINANCIAL_FIELDS_LOCKED';
  end if;

  v_old_scan_code := v_product ->> 'scan_code';
  v_new_scan_code := v_old_scan_code;
  if p_changes ? 'scan_code' then
    v_new_scan_code := upper(btrim(coalesce(p_changes ->> 'scan_code', '')));
    if v_new_scan_code = '' then
      raise exception using errcode = '22023', message = 'SCAN_CODE_REQUIRED';
    end if;
    if upper(btrim(coalesce(p_confirm_new_scan_code, ''))) is distinct from v_new_scan_code then
      raise exception using errcode = '22023', message = 'SCAN_CODE_CONFIRMATION_MISMATCH';
    end if;
    if exists (
      select 1
      from jsonb_array_elements(coalesce(v_payload -> 'products', '[]'::jsonb)) as product
      where product ->> 'inventory_id' <> v_inventory_id
        and upper(btrim(product ->> 'scan_code')) = v_new_scan_code
    ) then
      raise exception using errcode = '23505', message = 'SCAN_CODE_EXISTS';
    end if;
  elsif p_confirm_new_scan_code is not null then
    raise exception using errcode = '22023', message = 'SCAN_CODE_CHANGE_REQUIRED';
  end if;

  v_action := case when p_changes ? 'scan_code' then '修改貨號' else '商品資料修改' end;
  v_note := case
    when p_changes ? 'scan_code' then
      '貨號 ' || v_old_scan_code || ' → ' || v_new_scan_code || '；舊實體條碼失效'
    else '管理員更新商品詳細資料'
  end;

  v_edited_product := v_product || jsonb_build_object(
    'category', btrim(p_changes ->> 'category'),
    'name', btrim(p_changes ->> 'name'),
    'brand', btrim(p_changes ->> 'brand'),
    'model', btrim(p_changes ->> 'model'),
    'usSize', btrim(p_changes ->> 'usSize'),
    'cmSize', btrim(p_changes ->> 'cmSize'),
    'color', btrim(p_changes ->> 'color'),
    'cost', v_cost,
    'price', v_price,
    'vendorId', v_vendor_id,
    'packaging', btrim(p_changes ->> 'packaging'),
    'location', btrim(p_changes ->> 'location'),
    'consignmentStart', btrim(p_changes ->> 'consignmentStart'),
    'note', coalesce(p_changes ->> 'note', ''),
    'scan_code', v_new_scan_code,
    'code', v_new_scan_code,
    'inventory_id', v_product ->> 'inventory_id',
    'id', v_product ->> 'id',
    'status', v_product ->> 'status',
    'createdAt', v_product ->> 'createdAt',
    'history', coalesce(v_product -> 'history', '[]'::jsonb) || jsonb_build_array(
      jsonb_build_object('at', v_changed_at, 'action', v_action, 'note', v_note)
    )
  );

  select jsonb_agg(
    case when product ->> 'inventory_id' = v_inventory_id then v_edited_product else product end
    order by ordinal
  ) into v_products
  from jsonb_array_elements(v_payload -> 'products') with ordinality as item(product, ordinal);
  v_next_payload := jsonb_set(v_payload, '{products}', v_products, false);
  perform private.kc_assert_pos_financial_integrity(v_next_payload);
  perform private.kc_assert_stage1_core(v_next_payload);
  perform set_config(
    'kc.action_summary',
    v_action || ' | inventory_id=' || v_inventory_id
      || ' | 舊貨號=' || v_old_scan_code || ' | 新貨號=' || v_new_scan_code,
    true
  );
  update public.kc_pos_state
  set payload = v_next_payload, updated_at = v_changed_at
  where id = 'main'
  returning kc_pos_state.updated_at into v_updated_at;
  return query select v_next_payload, v_updated_at, v_inventory_id;
end
$$;

create or replace function public.kc_admin_restore_inventory_item(
  p_inventory_id text,
  p_expected_updated_at timestamptz
)
returns table (payload jsonb, updated_at timestamptz, restored_inventory_id text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inventory_id text := btrim(coalesce(p_inventory_id, ''));
  v_payload jsonb;
  v_current_updated_at timestamptz;
  v_product jsonb;
  v_products jsonb;
  v_next_payload jsonb;
  v_restored_at timestamptz := clock_timestamp();
  v_updated_at timestamptz;
begin
  if not private.kc_is_admin() then
    raise exception using errcode = '42501', message = 'KICKS CENTER active admin access required';
  end if;
  if v_inventory_id = '' then
    raise exception using errcode = '22023', message = 'INVENTORY_ID_REQUIRED';
  end if;
  if p_expected_updated_at is null then
    raise exception using errcode = '40001', message = 'POS data changed in another session; reload required';
  end if;
  select state.payload, state.updated_at into v_payload, v_current_updated_at
  from public.kc_pos_state as state where state.id = 'main' for update;
  if v_payload is null then
    raise exception using errcode = 'P0002', message = 'POS_STATE_NOT_FOUND';
  end if;
  if v_current_updated_at is distinct from p_expected_updated_at then
    raise exception using errcode = '40001', message = 'POS data changed in another session; reload required';
  end if;
  select product into v_product
  from jsonb_array_elements(coalesce(v_payload -> 'products', '[]'::jsonb)) as product
  where product ->> 'inventory_id' = v_inventory_id limit 1;
  if v_product is null then
    raise exception using errcode = 'P0002', message = 'INVENTORY_NOT_FOUND';
  end if;
  if v_product ->> 'status' <> '已取回' then
    raise exception using errcode = '23514', message = 'INVENTORY_NOT_RETURNED';
  end if;
  if exists (
    select 1 from jsonb_array_elements(coalesce(v_payload -> 'sales', '[]'::jsonb)) as sale
    where sale ->> 'inventory_id' = v_inventory_id or sale ->> 'productId' = v_inventory_id
  ) or exists (
    select 1 from jsonb_array_elements(coalesce(v_payload -> 'settlements', '[]'::jsonb)) as settlement
    where settlement ->> 'inventory_id' = v_inventory_id
       or settlement ->> 'inventoryId' = v_inventory_id
       or exists (
         select 1
         from jsonb_array_elements_text(coalesce(settlement -> 'saleIds', '[]'::jsonb)) as settlement_sale_id
         join jsonb_array_elements(coalesce(v_payload -> 'sales', '[]'::jsonb)) as sale
           on coalesce(nullif(sale ->> 'sale_id', ''), sale ->> 'id') = settlement_sale_id.value
         where coalesce(nullif(sale ->> 'inventory_id', ''), sale ->> 'productId') = v_inventory_id
       )
  ) then
    raise exception using errcode = '23503', message = 'INVENTORY_HAS_FINANCIAL_HISTORY';
  end if;
  select jsonb_agg(
    case when product ->> 'inventory_id' = v_inventory_id then
      jsonb_set(
        jsonb_set(product, '{status}', to_jsonb('在庫'::text)),
        '{history}', coalesce(product -> 'history', '[]'::jsonb) || jsonb_build_array(
          jsonb_build_object(
            'at', v_restored_at,
            'action', '取消取回／恢復在庫',
            'note', '管理員確認取消取回，商品恢復可售庫存'
          )
        )
      )
    else product end order by ordinal
  ) into v_products
  from jsonb_array_elements(v_payload -> 'products') with ordinality as item(product, ordinal);
  v_next_payload := jsonb_set(v_payload, '{products}', v_products, false);
  perform private.kc_assert_pos_financial_integrity(v_next_payload);
  perform private.kc_assert_stage1_core(v_next_payload);
  perform set_config(
    'kc.action_summary',
    '取消取回／恢復在庫 | inventory_id=' || v_inventory_id
      || ' | 貨號=' || coalesce(v_product ->> 'scan_code', v_product ->> 'code', ''),
    true
  );
  update public.kc_pos_state
  set payload = v_next_payload, updated_at = v_restored_at
  where id = 'main'
  returning kc_pos_state.updated_at into v_updated_at;
  return query select v_next_payload, v_updated_at, v_inventory_id;
end
$$;

revoke all on function public.kc_admin_update_inventory_item(text, jsonb, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.kc_admin_update_inventory_item(text, jsonb, text, timestamptz)
  to authenticated;
revoke all on function public.kc_admin_restore_inventory_item(text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.kc_admin_restore_inventory_item(text, timestamptz)
  to authenticated;

notify pgrst, 'reload schema';

commit;

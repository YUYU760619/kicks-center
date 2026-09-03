begin;

-- Resolve a vendor code without mutating legacy vendor records. A legacy
-- vendor's UUID is also used as its deterministic primary VendorCode UUID.
create or replace function private.kc_resolve_vendor_code(
  p_payload jsonb,
  p_vendor_id text,
  p_vendor_code_id text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_vendor jsonb;
  v_code jsonb;
  v_legacy_code text;
begin
  select item into v_vendor
  from jsonb_array_elements(coalesce(p_payload -> 'vendors', '[]'::jsonb)) as item
  where item ->> 'id' = btrim(coalesce(p_vendor_id, ''))
  limit 1;
  if v_vendor is null then
    raise exception using errcode = '23503', message = 'VENDOR_NOT_FOUND';
  end if;

  if jsonb_typeof(v_vendor -> 'codes') = 'array'
     and jsonb_array_length(v_vendor -> 'codes') > 0 then
    select item into v_code
    from jsonb_array_elements(v_vendor -> 'codes') as item
    where case
      when nullif(btrim(coalesce(p_vendor_code_id, '')), '') is null
        then coalesce((item ->> 'primary')::boolean, false)
      else item ->> 'id' = btrim(p_vendor_code_id)
    end
    limit 1;
    if v_code is null then
      raise exception using errcode = '23503', message = 'VENDOR_CODE_NOT_FOUND';
    end if;
    return v_code;
  end if;

  if nullif(btrim(coalesce(p_vendor_code_id, '')), '') is not null
     and btrim(p_vendor_code_id) <> v_vendor ->> 'id' then
    raise exception using errcode = '23503', message = 'VENDOR_CODE_NOT_FOUND';
  end if;
  v_legacy_code := upper(btrim(coalesce(v_vendor ->> 'code', '')));
  if v_legacy_code = '' then
    raise exception using errcode = '23514', message = 'VENDOR_CODE_REQUIRED';
  end if;
  return jsonb_build_object(
    'id', v_vendor ->> 'id',
    'code', v_legacy_code,
    -- Fixed legacy compatibility default. Never infer classification from code text.
    'kind', 'footwear_accessory',
    'primary', true,
    'active', true
  );
end
$$;

revoke all on function private.kc_resolve_vendor_code(jsonb, text, text)
  from public, anon, authenticated;

create or replace function private.kc_assert_vendor_codes(p_payload jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_vendor jsonb;
  v_code jsonb;
  v_codes jsonb;
  v_primary_count integer;
  v_primary_code text;
  v_normalized text;
  v_seen_codes text[] := array[]::text[];
  v_seen_ids text[] := array[]::text[];
begin
  if jsonb_typeof(p_payload -> 'vendors') <> 'array' then
    raise exception using errcode = '23514', message = 'VENDORS_STATE_INVALID';
  end if;

  for v_vendor in select value from jsonb_array_elements(p_payload -> 'vendors') loop
    if nullif(btrim(coalesce(v_vendor ->> 'id', '')), '') is null
       or nullif(btrim(coalesce(v_vendor ->> 'code', '')), '') is null then
      raise exception using errcode = '23514', message = 'VENDOR_ID_OR_CODE_INVALID';
    end if;

    if v_vendor ? 'codes' then
      if jsonb_typeof(v_vendor -> 'codes') <> 'array'
         or jsonb_array_length(v_vendor -> 'codes') = 0 then
        raise exception using errcode = '23514', message = 'VENDOR_CODES_INVALID';
      end if;
      v_codes := v_vendor -> 'codes';
    else
      v_codes := jsonb_build_array(private.kc_resolve_vendor_code(
        p_payload, v_vendor ->> 'id', null
      ));
    end if;

    select count(*)::integer,
           max(upper(btrim(item ->> 'code'))) filter (
             where coalesce((item ->> 'primary')::boolean, false)
           )
      into v_primary_count, v_primary_code
    from jsonb_array_elements(v_codes) as item
    where coalesce((item ->> 'primary')::boolean, false);
    if v_primary_count <> 1 then
      raise exception using errcode = '23514', message = 'VENDOR_PRIMARY_CODE_INVALID';
    end if;
    if upper(btrim(v_vendor ->> 'code')) is distinct from v_primary_code then
      raise exception using errcode = '23514', message = 'VENDOR_PRIMARY_CODE_MISMATCH';
    end if;

    for v_code in select value from jsonb_array_elements(v_codes) loop
      v_normalized := upper(btrim(coalesce(v_code ->> 'code', '')));
      if nullif(btrim(coalesce(v_code ->> 'id', '')), '') is null
         or v_normalized = ''
         or coalesce(nullif(btrim(v_code ->> 'kind'), ''), '')
              not in ('footwear_accessory', 'apparel', 'chrome_hearts')
         or not (v_code ? 'primary')
         or not (v_code ? 'active')
         or jsonb_typeof(v_code -> 'primary') <> 'boolean'
         or jsonb_typeof(v_code -> 'active') <> 'boolean'
         or (v_code ->> 'code') is distinct from v_normalized then
        raise exception using errcode = '23514', message = 'VENDOR_CODE_INVALID';
      end if;
      if coalesce((v_code ->> 'primary')::boolean, false)
         and not coalesce((v_code ->> 'active')::boolean, false) then
        raise exception using errcode = '23514', message = 'VENDOR_PRIMARY_CODE_INACTIVE';
      end if;
      if v_normalized = any(v_seen_codes) then
        raise exception using errcode = '23505', message = 'VENDOR_CODE_EXISTS';
      end if;
      if (v_code ->> 'id') = any(v_seen_ids) then
        raise exception using errcode = '23505', message = 'VENDOR_CODE_ID_EXISTS';
      end if;
      v_seen_codes := array_append(v_seen_codes, v_normalized);
      v_seen_ids := array_append(v_seen_ids, v_code ->> 'id');
    end loop;
  end loop;
end
$$;

revoke all on function private.kc_assert_vendor_codes(jsonb)
  from public, anon, authenticated;

-- Transform one Product without rebuilding arrays in PL/pgSQL. Existing
-- financial identity is immutable once the inventory has financial history.
create or replace function private.kc_guard_vendor_code_product(
  p_payload jsonb,
  p_product jsonb,
  p_old_product jsonb,
  p_financially_locked boolean
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_code jsonb;
  v_identity_changed boolean;
begin
  if p_old_product is null then
    v_code := private.kc_resolve_vendor_code(
      p_payload, p_product ->> 'vendorId', p_product ->> 'vendorCodeId'
    );
    if not coalesce((v_code ->> 'active')::boolean, false) then
      raise exception using errcode = '23514', message = 'VENDOR_CODE_INACTIVE';
    end if;
    return p_product || jsonb_build_object(
      'vendorCodeId', v_code ->> 'id',
      'vendorCode', v_code ->> 'code',
      'vendorCodeKind', v_code ->> 'kind'
    );
  end if;

  v_identity_changed :=
    p_old_product ->> 'vendorId' is distinct from p_product ->> 'vendorId'
    or p_old_product -> 'cost' is distinct from p_product -> 'cost'
    or p_old_product ->> 'vendorCodeId' is distinct from p_product ->> 'vendorCodeId'
    or p_old_product ->> 'vendorCode' is distinct from p_product ->> 'vendorCode'
    or p_old_product ->> 'vendorCodeKind' is distinct from p_product ->> 'vendorCodeKind';
  if p_financially_locked and v_identity_changed then
    raise exception using errcode = '23514', message = 'INVENTORY_FINANCIAL_FIELDS_LOCKED';
  end if;

  if p_old_product ->> 'vendorId' is distinct from p_product ->> 'vendorId'
     or p_old_product ->> 'vendorCodeId' is distinct from p_product ->> 'vendorCodeId' then
    v_code := private.kc_resolve_vendor_code(
      p_payload, p_product ->> 'vendorId', p_product ->> 'vendorCodeId'
    );
    if not coalesce((v_code ->> 'active')::boolean, false) then
      raise exception using errcode = '23514', message = 'VENDOR_CODE_INACTIVE';
    end if;
    return p_product || jsonb_build_object(
      'vendorCodeId', v_code ->> 'id',
      'vendorCode', v_code ->> 'code',
      'vendorCodeKind', v_code ->> 'kind'
    );
  end if;

  if p_old_product ? 'vendorCodeId' then
    return p_product || jsonb_build_object(
      'vendorCodeId', p_old_product ->> 'vendorCodeId',
      'vendorCode', p_old_product ->> 'vendorCode',
      'vendorCodeKind', p_old_product ->> 'vendorCodeKind'
    );
  end if;
  return p_product - 'vendorCodeId' - 'vendorCode' - 'vendorCodeKind';
end
$$;

revoke all on function private.kc_guard_vendor_code_product(jsonb, jsonb, jsonb, boolean)
  from public, anon, authenticated;

-- New Sales receive their snapshot only from the server-owned Product.
-- Existing Sale financial identity is restored byte-for-byte, including the
-- absence of fields on legacy Sales.
create or replace function private.kc_guard_vendor_code_sale(
  p_payload jsonb,
  p_sale jsonb,
  p_old_sale jsonb,
  p_product jsonb
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_code jsonb;
  v_result jsonb;
begin
  if p_old_sale is not null then
    v_result := p_sale - 'vendor_id' - 'vendor_code_id' - 'vendor_code' - 'vendor_code_kind';
    if p_old_sale ? 'vendor_id' then
      v_result := v_result || jsonb_build_object('vendor_id', p_old_sale -> 'vendor_id');
    end if;
    if p_old_sale ? 'vendor_code_id' then
      v_result := v_result || jsonb_build_object(
        'vendor_code_id', p_old_sale -> 'vendor_code_id',
        'vendor_code', p_old_sale -> 'vendor_code',
        'vendor_code_kind', p_old_sale -> 'vendor_code_kind'
      );
    end if;
    return v_result;
  end if;
  if p_product is null then
    raise exception using errcode = '23503', message = 'SALE_INVENTORY_NOT_FOUND';
  end if;
  if p_product ? 'vendorCodeId' then
    v_code := jsonb_build_object(
      'id', p_product ->> 'vendorCodeId',
      'code', p_product ->> 'vendorCode',
      'kind', p_product ->> 'vendorCodeKind'
    );
  else
    v_code := private.kc_resolve_vendor_code(p_payload, p_product ->> 'vendorId', null);
  end if;
  return p_sale || jsonb_build_object(
    'vendor_id', p_product ->> 'vendorId',
    'vendor_code_id', v_code ->> 'id',
    'vendor_code', v_code ->> 'code',
    'vendor_code_kind', v_code ->> 'kind'
  );
end
$$;

revoke all on function private.kc_guard_vendor_code_sale(jsonb, jsonb, jsonb, jsonb)
  from public, anon, authenticated;

-- This guard runs before the existing backup/audit trigger. Array rebuilding
-- uses one set-based jsonb_agg per changed array; unrelated updates take the
-- fast path. Do not backfill untouched legacy Product/Sale snapshots.
-- It owns snapshot fields for kc_staff_create_inventory_item, kc_pos_complete_sale, and
-- kc_pos_complete_cart_sale RPCs.
create or replace function private.kc_apply_vendor_code_snapshots()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old_products_by_id jsonb := '{}'::jsonb;
  v_new_products_by_id jsonb := '{}'::jsonb;
  v_old_sales_by_id jsonb := '{}'::jsonb;
  v_locked_inventory_by_id jsonb := '{}'::jsonb;
  v_products jsonb;
  v_sales jsonb;
begin
  perform private.kc_assert_vendor_codes(new.payload);

  -- Fast path: vendor/settings/settlement-only updates do not inspect or rebuild
  -- historical Product/Sale arrays. When an array did change, build O(1) ID
  -- lookup maps once and perform one linear pass. This avoids the old O(n²)
  -- nested OLD-array searches.
  if old.payload -> 'products' is distinct from new.payload -> 'products' then
    select coalesce(jsonb_object_agg(
      coalesce(nullif(item ->> 'inventory_id', ''), item ->> 'id'), item
    ), '{}'::jsonb)
    into v_old_products_by_id
    from jsonb_array_elements(coalesce(old.payload -> 'products', '[]'::jsonb)) as item;

    select coalesce(jsonb_object_agg(inventory_id, 'true'::jsonb), '{}'::jsonb)
    into v_locked_inventory_by_id
    from (
      select coalesce(nullif(sale ->> 'inventory_id', ''), sale ->> 'productId') as inventory_id
      from jsonb_array_elements(coalesce(old.payload -> 'sales', '[]'::jsonb)) as sale
      union
      select coalesce(nullif(settlement ->> 'inventory_id', ''), settlement ->> 'inventoryId')
      from jsonb_array_elements(coalesce(old.payload -> 'settlements', '[]'::jsonb)) as settlement
      where coalesce(nullif(settlement ->> 'inventory_id', ''), settlement ->> 'inventoryId') is not null
    ) locked where inventory_id is not null;

    select coalesce(jsonb_agg(private.kc_guard_vendor_code_product(
      new.payload,
      item,
      v_old_products_by_id -> coalesce(nullif(item ->> 'inventory_id', ''), item ->> 'id'),
      v_locked_inventory_by_id ? coalesce(nullif(item ->> 'inventory_id', ''), item ->> 'id')
    ) order by ordinal), '[]'::jsonb)
    into v_products
    from jsonb_array_elements(coalesce(new.payload -> 'products', '[]'::jsonb))
      with ordinality as product(item, ordinal);
    new.payload := jsonb_set(new.payload, '{products}', v_products, false);
  end if;

  if old.payload -> 'sales' is distinct from new.payload -> 'sales' then
    select coalesce(jsonb_object_agg(
      coalesce(nullif(item ->> 'inventory_id', ''), item ->> 'id'), item
    ), '{}'::jsonb)
    into v_new_products_by_id
    from jsonb_array_elements(coalesce(new.payload -> 'products', '[]'::jsonb)) as item;

    select coalesce(jsonb_object_agg(
      coalesce(nullif(item ->> 'sale_id', ''), item ->> 'id'), item
    ), '{}'::jsonb)
    into v_old_sales_by_id
    from jsonb_array_elements(coalesce(old.payload -> 'sales', '[]'::jsonb)) as item;

    select coalesce(jsonb_agg(private.kc_guard_vendor_code_sale(
      new.payload,
      item,
      v_old_sales_by_id -> coalesce(nullif(item ->> 'sale_id', ''), item ->> 'id'),
      v_new_products_by_id -> coalesce(nullif(item ->> 'inventory_id', ''), item ->> 'productId')
    ) order by ordinal), '[]'::jsonb)
    into v_sales
    from jsonb_array_elements(coalesce(new.payload -> 'sales', '[]'::jsonb))
      with ordinality as sale(item, ordinal);
    new.payload := jsonb_set(new.payload, '{sales}', v_sales, false);
  end if;
  return new;
end
$$;

revoke all on function private.kc_apply_vendor_code_snapshots()
  from public, anon, authenticated;

drop trigger if exists kc_pos_state_00_vendor_code_guard_trigger on public.kc_pos_state;
create trigger kc_pos_state_00_vendor_code_guard_trigger
before update on public.kc_pos_state
for each row execute function private.kc_apply_vendor_code_snapshots();

-- Same signature as migration 012. Vendor changes now require an explicit
-- active VendorCode belonging to the destination Vendor. Unrelated edits keep
-- existing snapshots exactly as stored and do not materialize legacy fields.
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
  v_vendor_code_id text;
  v_vendor_changed boolean;
  v_code_changed boolean;
  v_code jsonb;
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
    'vendorId','vendorCodeId','packaging','location','consignmentStart','note','scan_code'
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

  select state.payload, state.updated_at into v_payload, v_current_updated_at
  from public.kc_pos_state as state where state.id = 'main' for update;
  if v_payload is null then raise exception using errcode = 'P0002', message = 'POS_STATE_NOT_FOUND'; end if;
  if v_current_updated_at is distinct from p_expected_updated_at then
    raise exception using errcode = '40001', message = 'POS data changed in another session; reload required';
  end if;
  select product into v_product
  from jsonb_array_elements(coalesce(v_payload -> 'products', '[]'::jsonb)) as product
  where product ->> 'inventory_id' = v_inventory_id limit 1;
  if v_product is null then raise exception using errcode = 'P0002', message = 'INVENTORY_NOT_FOUND'; end if;

  v_vendor_id := btrim(p_changes ->> 'vendorId');
  if not exists (
    select 1 from jsonb_array_elements(coalesce(v_payload -> 'vendors', '[]'::jsonb)) as vendor
    where vendor ->> 'id' = v_vendor_id
  ) then raise exception using errcode = '23503', message = 'VENDOR_NOT_FOUND'; end if;
  v_vendor_changed := v_vendor_id is distinct from v_product ->> 'vendorId';
  v_vendor_code_id := nullif(btrim(coalesce(p_changes ->> 'vendorCodeId', '')), '');
  v_code_changed := v_vendor_code_id is not null
    and v_vendor_code_id is distinct from v_product ->> 'vendorCodeId';
  if v_vendor_changed and v_vendor_code_id is null then
    raise exception using errcode = '22023', message = 'VENDOR_CODE_REQUIRED_FOR_VENDOR_CHANGE';
  end if;

  select exists (
    select 1 from jsonb_array_elements(coalesce(v_payload -> 'sales', '[]'::jsonb)) as sale
    where coalesce(nullif(sale ->> 'inventory_id', ''), sale ->> 'productId') = v_inventory_id
  ) or exists (
    select 1 from jsonb_array_elements(coalesce(v_payload -> 'settlements', '[]'::jsonb)) as settlement
    where settlement ->> 'inventory_id' = v_inventory_id
       or settlement ->> 'inventoryId' = v_inventory_id
       or exists (
         select 1 from jsonb_array_elements_text(coalesce(settlement -> 'saleIds', '[]'::jsonb)) as sid
         join jsonb_array_elements(coalesce(v_payload -> 'sales', '[]'::jsonb)) as sale
           on coalesce(nullif(sale ->> 'sale_id', ''), sale ->> 'id') = sid.value
         where coalesce(nullif(sale ->> 'inventory_id', ''), sale ->> 'productId') = v_inventory_id
       )
  ) into v_has_financial_history;
  if v_has_financial_history and (
    v_vendor_changed or v_code_changed
    or v_cost is distinct from (v_product ->> 'cost')::numeric
  ) then
    raise exception using errcode = '23503', message = 'INVENTORY_FINANCIAL_FIELDS_LOCKED';
  end if;

  v_old_scan_code := v_product ->> 'scan_code';
  v_new_scan_code := v_old_scan_code;
  if p_changes ? 'scan_code' then
    v_new_scan_code := upper(btrim(coalesce(p_changes ->> 'scan_code', '')));
    if v_new_scan_code = '' then raise exception using errcode = '22023', message = 'SCAN_CODE_REQUIRED'; end if;
    if upper(btrim(coalesce(p_confirm_new_scan_code, ''))) is distinct from v_new_scan_code then
      raise exception using errcode = '22023', message = 'SCAN_CODE_CONFIRMATION_MISMATCH';
    end if;
    if exists (
      select 1 from jsonb_array_elements(coalesce(v_payload -> 'products', '[]'::jsonb)) as product
      where product ->> 'inventory_id' <> v_inventory_id
        and upper(btrim(product ->> 'scan_code')) = v_new_scan_code
    ) then raise exception using errcode = '23505', message = 'SCAN_CODE_EXISTS'; end if;
  elsif p_confirm_new_scan_code is not null then
    raise exception using errcode = '22023', message = 'SCAN_CODE_CHANGE_REQUIRED';
  end if;

  v_edited_product := v_product || jsonb_build_object(
    'category', btrim(p_changes ->> 'category'), 'name', btrim(p_changes ->> 'name'),
    'brand', btrim(p_changes ->> 'brand'), 'model', btrim(p_changes ->> 'model'),
    'usSize', btrim(p_changes ->> 'usSize'), 'cmSize', btrim(p_changes ->> 'cmSize'),
    'color', btrim(p_changes ->> 'color'), 'cost', v_cost, 'price', v_price,
    'vendorId', v_vendor_id, 'packaging', btrim(p_changes ->> 'packaging'),
    'location', btrim(p_changes ->> 'location'),
    'consignmentStart', btrim(p_changes ->> 'consignmentStart'),
    'note', coalesce(p_changes ->> 'note', ''), 'scan_code', v_new_scan_code,
    'code', v_new_scan_code, 'inventory_id', v_product ->> 'inventory_id',
    'id', v_product ->> 'id', 'status', v_product ->> 'status',
    'createdAt', v_product ->> 'createdAt'
  );
  if v_vendor_changed or v_code_changed then
    v_code := private.kc_resolve_vendor_code(v_payload, v_vendor_id, v_vendor_code_id);
    if not coalesce((v_code ->> 'active')::boolean, false) then
      raise exception using errcode = '23514', message = 'VENDOR_CODE_INACTIVE';
    end if;
    v_edited_product := v_edited_product || jsonb_build_object(
      'vendorCodeId', v_code ->> 'id', 'vendorCode', v_code ->> 'code',
      'vendorCodeKind', v_code ->> 'kind'
    );
  end if;
  v_action := case when p_changes ? 'scan_code' then '修改貨號' else '商品資料修改' end;
  v_note := case when p_changes ? 'scan_code' then
    '貨號 ' || v_old_scan_code || ' → ' || v_new_scan_code || '；舊實體條碼失效'
    else '管理員更新商品詳細資料' end;
  v_edited_product := v_edited_product || jsonb_build_object(
    'history', coalesce(v_product -> 'history', '[]'::jsonb) || jsonb_build_array(
      jsonb_build_object('at', v_changed_at, 'action', v_action, 'note', v_note)
    )
  );

  select jsonb_agg(case when product ->> 'inventory_id' = v_inventory_id
    then v_edited_product else product end order by ordinal)
  into v_products
  from jsonb_array_elements(v_payload -> 'products') with ordinality as item(product, ordinal);
  v_next_payload := jsonb_set(v_payload, '{products}', v_products, false);
  perform private.kc_assert_pos_financial_integrity(v_next_payload);
  perform private.kc_assert_stage1_core(v_next_payload);
  perform set_config('kc.action_summary', v_action || ' | inventory_id=' || v_inventory_id
    || ' | vendor_id=' || v_vendor_id || ' | vendor_code_id=' || coalesce(v_vendor_code_id, 'legacy'), true);
  update public.kc_pos_state set payload = v_next_payload, updated_at = v_changed_at
  where id = 'main' returning kc_pos_state.payload, kc_pos_state.updated_at
  into v_next_payload, v_updated_at;
  return query select v_next_payload, v_updated_at, v_inventory_id;
end
$$;

revoke all on function public.kc_admin_update_inventory_item(text, jsonb, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.kc_admin_update_inventory_item(text, jsonb, text, timestamptz)
  to authenticated;

create or replace function public.kc_admin_set_vendor_codes(
  p_vendor_id text,
  p_codes jsonb,
  p_expected_updated_at timestamptz
)
returns table (payload jsonb, updated_at timestamptz, vendor_id text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_payload jsonb;
  v_current_updated_at timestamptz;
  v_vendor jsonb;
  v_existing_codes jsonb;
  v_input jsonb;
  v_entry jsonb;
  v_codes jsonb := '[]'::jsonb;
  v_code_id text;
  v_code text;
  v_kind text;
  v_primary boolean;
  v_active boolean;
  v_primary_code text;
  v_primary_count integer := 0;
  v_vendors jsonb := '[]'::jsonb;
  v_updated_at timestamptz;
begin
  if not private.kc_is_admin() then
    raise exception using errcode = '42501', message = 'KICKS CENTER active admin access required';
  end if;
  if p_expected_updated_at is null then
    raise exception using errcode = '40001', message = 'POS data changed in another session; reload required';
  end if;
  if nullif(btrim(coalesce(p_vendor_id, '')), '') is null
     or jsonb_typeof(p_codes) <> 'array' or jsonb_array_length(p_codes) = 0 then
    raise exception using errcode = '22023', message = 'VENDOR_CODES_REQUIRED';
  end if;

  select state.payload, state.updated_at into v_payload, v_current_updated_at
  from public.kc_pos_state as state where state.id = 'main' for update;
  if v_payload is null then
    raise exception using errcode = 'P0002', message = 'POS_STATE_NOT_FOUND';
  end if;
  if v_current_updated_at is distinct from p_expected_updated_at then
    raise exception using errcode = '40001', message = 'POS data changed in another session; reload required';
  end if;
  select item into v_vendor
  from jsonb_array_elements(v_payload -> 'vendors') as item
  where item ->> 'id' = btrim(p_vendor_id) limit 1;
  if v_vendor is null then raise exception using errcode = 'P0002', message = 'VENDOR_NOT_FOUND'; end if;
  v_existing_codes := case
    when jsonb_typeof(v_vendor -> 'codes') = 'array' then v_vendor -> 'codes'
    else jsonb_build_array(private.kc_resolve_vendor_code(v_payload, v_vendor ->> 'id', null))
  end;

  for v_input in select value from jsonb_array_elements(p_codes) loop
    if jsonb_typeof(v_input) <> 'object' then
      raise exception using errcode = '22023', message = 'VENDOR_CODE_INVALID';
    end if;
    v_code := upper(btrim(coalesce(v_input ->> 'code', '')));
    v_kind := nullif(btrim(coalesce(v_input ->> 'kind', '')), '');
    v_primary := coalesce((v_input ->> 'primary')::boolean, false);
    v_active := coalesce((v_input ->> 'active')::boolean, true);
    if v_code = '' or coalesce(v_kind, '')
         not in ('footwear_accessory', 'apparel', 'chrome_hearts') then
      raise exception using errcode = '22023', message = 'VENDOR_CODE_INVALID';
    end if;
    v_code_id := nullif(btrim(coalesce(v_input ->> 'id', '')), '');
    if v_code_id is null then
      v_code_id := gen_random_uuid()::text;
    elsif not exists (
      select 1 from jsonb_array_elements(v_existing_codes) as existing
      where existing ->> 'id' = v_code_id
    ) then
      raise exception using errcode = '22023', message = 'VENDOR_CODE_ID_INVALID';
    end if;
    if v_primary then v_primary_count := v_primary_count + 1; v_primary_code := v_code; end if;
    v_entry := jsonb_build_object(
      'id', v_code_id, 'code', v_code, 'kind', v_kind,
      'primary', v_primary, 'active', v_active
    );
    v_codes := v_codes || jsonb_build_array(v_entry);
  end loop;
  if v_primary_count <> 1 then
    raise exception using errcode = '23514', message = 'VENDOR_PRIMARY_CODE_INVALID';
  end if;
  if exists (
    select 1 from jsonb_array_elements(v_existing_codes) as existing
    where not exists (
      select 1 from jsonb_array_elements(v_codes) as next_code
      where next_code ->> 'id' = existing ->> 'id'
    )
  ) then
    raise exception using errcode = '23514', message = 'VENDOR_CODE_REMOVAL_FORBIDDEN';
  end if;

  for v_entry in select value from jsonb_array_elements(v_payload -> 'vendors') loop
    if v_entry ->> 'id' = btrim(p_vendor_id) then
      v_entry := v_entry || jsonb_build_object('code', v_primary_code, 'codes', v_codes);
    end if;
    v_vendors := v_vendors || jsonb_build_array(v_entry);
  end loop;
  v_payload := jsonb_set(v_payload, '{vendors}', v_vendors, false);
  perform private.kc_assert_vendor_codes(v_payload);
  perform private.kc_assert_pos_financial_integrity(v_payload);
  perform private.kc_assert_stage1_core(v_payload);
  perform set_config('kc.action_summary',
    '更新廠商代號 | vendor_id=' || btrim(p_vendor_id) || ' | primary=' || v_primary_code, true);
  update public.kc_pos_state set payload = v_payload, updated_at = clock_timestamp()
  where id = 'main' returning kc_pos_state.updated_at into v_updated_at;
  return query select v_payload, v_updated_at, btrim(p_vendor_id);
end
$$;

revoke all on function public.kc_admin_set_vendor_codes(text, jsonb, timestamptz)
  from public, anon, authenticated;
grant execute on function public.kc_admin_set_vendor_codes(text, jsonb, timestamptz)
  to authenticated;

create or replace function public.kc_admin_set_inventory_vendor_code(
  p_inventory_id text,
  p_vendor_code_id text,
  p_expected_updated_at timestamptz
)
returns table (payload jsonb, updated_at timestamptz, updated_inventory_id text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_payload jsonb;
  v_current_updated_at timestamptz;
  v_product jsonb;
  v_code jsonb;
  v_products jsonb := '[]'::jsonb;
  v_item jsonb;
  v_updated_at timestamptz;
begin
  if not private.kc_is_admin() then
    raise exception using errcode = '42501', message = 'KICKS CENTER active admin access required';
  end if;
  if nullif(btrim(coalesce(p_inventory_id, '')), '') is null
     or nullif(btrim(coalesce(p_vendor_code_id, '')), '') is null then
    raise exception using errcode = '22023', message = 'INVENTORY_VENDOR_CODE_REQUIRED';
  end if;
  select state.payload, state.updated_at into v_payload, v_current_updated_at
  from public.kc_pos_state as state where state.id = 'main' for update;
  if v_payload is null then raise exception using errcode = 'P0002', message = 'POS_STATE_NOT_FOUND'; end if;
  if v_current_updated_at is distinct from p_expected_updated_at then
    raise exception using errcode = '40001', message = 'POS data changed in another session; reload required';
  end if;
  select item into v_product from jsonb_array_elements(v_payload -> 'products') as item
  where coalesce(nullif(item ->> 'inventory_id', ''), item ->> 'id') = btrim(p_inventory_id)
  limit 1;
  if v_product is null then raise exception using errcode = 'P0002', message = 'INVENTORY_NOT_FOUND'; end if;
  if exists (
    select 1 from jsonb_array_elements(coalesce(v_payload -> 'sales', '[]'::jsonb)) as sale
    where coalesce(nullif(sale ->> 'inventory_id', ''), sale ->> 'productId') = btrim(p_inventory_id)
  ) or exists (
    select 1 from jsonb_array_elements(coalesce(v_payload -> 'settlements', '[]'::jsonb)) as settlement
    cross join lateral jsonb_array_elements_text(coalesce(settlement -> 'saleIds', '[]'::jsonb)) as sid
    join jsonb_array_elements(coalesce(v_payload -> 'sales', '[]'::jsonb)) as sale
      on coalesce(nullif(sale ->> 'sale_id', ''), sale ->> 'id') = sid.value
    where coalesce(nullif(sale ->> 'inventory_id', ''), sale ->> 'productId') = btrim(p_inventory_id)
  ) then
    raise exception using errcode = '23514', message = 'INVENTORY_FINANCIAL_FIELDS_LOCKED';
  end if;
  v_code := private.kc_resolve_vendor_code(
    v_payload, v_product ->> 'vendorId', btrim(p_vendor_code_id)
  );
  if not coalesce((v_code ->> 'active')::boolean, false) then
    raise exception using errcode = '23514', message = 'VENDOR_CODE_INACTIVE';
  end if;
  for v_item in select value from jsonb_array_elements(v_payload -> 'products') loop
    if coalesce(nullif(v_item ->> 'inventory_id', ''), v_item ->> 'id') = btrim(p_inventory_id) then
      v_item := v_item || jsonb_build_object('vendorCodeId', v_code ->> 'id');
    end if;
    v_products := v_products || jsonb_build_array(v_item);
  end loop;
  v_payload := jsonb_set(v_payload, '{products}', v_products, false);
  perform set_config('kc.action_summary',
    '修改商品廠商代號 | inventory_id=' || btrim(p_inventory_id)
      || ' | vendor_code=' || (v_code ->> 'code'), true);
  update public.kc_pos_state set payload = v_payload, updated_at = clock_timestamp()
  where id = 'main' returning kc_pos_state.payload, kc_pos_state.updated_at
    into v_payload, v_updated_at;
  return query select v_payload, v_updated_at, btrim(p_inventory_id);
end
$$;

revoke all on function public.kc_admin_set_inventory_vendor_code(text, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.kc_admin_set_inventory_vendor_code(text, text, timestamptz)
  to authenticated;

-- Same public signature as migration 010. New vendors now materialize their
-- single explicit primary code; no secondary code is inferred or generated.
create or replace function public.kc_admin_create_vendor(
  p_vendor jsonb,
  p_expected_updated_at timestamptz
)
returns table (payload jsonb, updated_at timestamptz, vendor_id text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_payload jsonb;
  v_current_updated_at timestamptz;
  v_updated_at timestamptz;
  v_vendor_id text;
  v_vendor_code text;
  v_vendor_name text;
  v_vendor_phone text;
  v_vendor_joined date;
  v_vendor_joined_text text;
  v_kind text;
  v_vendor jsonb;
begin
  if not private.kc_is_admin() then
    raise exception using errcode = '42501', message = 'KICKS CENTER active admin access required';
  end if;
  if p_expected_updated_at is null then
    raise exception using errcode = '40001', message = 'POS data changed in another session; reload required';
  end if;
  if p_vendor is null or jsonb_typeof(p_vendor) <> 'object' then
    raise exception using errcode = '22023', message = 'VENDOR_PAYLOAD_INVALID';
  end if;
  select state.payload, state.updated_at into v_payload, v_current_updated_at
  from public.kc_pos_state as state where state.id = 'main' for update;
  if v_payload is null then raise exception using errcode = 'P0002', message = 'POS_STATE_NOT_FOUND'; end if;
  if v_current_updated_at is distinct from p_expected_updated_at then
    raise exception using errcode = '40001', message = 'POS data changed in another session; reload required';
  end if;
  v_vendor_code := upper(btrim(coalesce(p_vendor ->> 'code', '')));
  v_vendor_name := btrim(coalesce(p_vendor ->> 'name', ''));
  if v_vendor_code = '' then raise exception using errcode = '22023', message = 'VENDOR_CODE_REQUIRED'; end if;
  if v_vendor_name = '' then raise exception using errcode = '22023', message = 'VENDOR_NAME_REQUIRED'; end if;
  if exists (
    select 1 from jsonb_array_elements(v_payload -> 'vendors') as vendor
    cross join lateral jsonb_array_elements(
      case when jsonb_typeof(vendor -> 'codes') = 'array' then vendor -> 'codes'
      else jsonb_build_array(jsonb_build_object('code', upper(btrim(vendor ->> 'code')))) end
    ) as code
    where upper(btrim(code ->> 'code')) = v_vendor_code
  ) then raise exception using errcode = '23505', message = 'VENDOR_CODE_EXISTS'; end if;
  v_vendor_phone := btrim(coalesce(p_vendor ->> 'phone', ''));
  v_vendor_joined_text := btrim(coalesce(p_vendor ->> 'joined', ''));
  begin
    v_vendor_joined := case when v_vendor_joined_text = '' then current_date else v_vendor_joined_text::date end;
  exception when invalid_datetime_format or datetime_field_overflow then
    raise exception using errcode = '22007', message = 'VENDOR_JOINED_INVALID';
  end;
  v_vendor_id := gen_random_uuid()::text;
  -- New records persist an explicit classification. No code prefix or suffix
  -- (including KC00007S) is allowed to choose the classification implicitly.
  v_kind := nullif(btrim(coalesce(p_vendor ->> 'codeKind', '')), '');
  if v_kind is null or v_kind not in ('footwear_accessory', 'apparel', 'chrome_hearts') then
    raise exception using errcode = '22023', message = 'VENDOR_CODE_KIND_INVALID';
  end if;
  v_vendor := jsonb_build_object(
    'id', v_vendor_id, 'code', v_vendor_code,
    'codes', jsonb_build_array(jsonb_build_object(
      'id', v_vendor_id, 'code', v_vendor_code, 'kind', v_kind,
      'primary', true, 'active', true
    )),
    'name', v_vendor_name, 'phone', v_vendor_phone,
    'joined', to_char(v_vendor_joined, 'YYYY-MM-DD')
  );
  v_payload := jsonb_set(v_payload, '{vendors}',
    (v_payload -> 'vendors') || jsonb_build_array(v_vendor), false);
  perform private.kc_assert_vendor_codes(v_payload);
  perform private.kc_assert_pos_financial_integrity(v_payload);
  perform private.kc_assert_stage1_core(v_payload);
  perform set_config('kc.action_summary',
    '新增寄賣廠商 | 廠商編號=' || v_vendor_code || ' | 名稱=' || v_vendor_name, true);
  update public.kc_pos_state set payload = v_payload, updated_at = clock_timestamp()
  where id = 'main' returning kc_pos_state.updated_at into v_updated_at;
  return query select v_payload, v_updated_at, v_vendor_id;
end
$$;

revoke all on function public.kc_admin_create_vendor(jsonb, timestamptz)
  from public, anon, authenticated;
grant execute on function public.kc_admin_create_vendor(jsonb, timestamptz)
  to authenticated;

notify pgrst, 'reload schema';

commit;

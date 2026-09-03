-- Production post-migration validation for migration 013.
-- Read-only: catalog inspection and kc_pos_state/main integrity checks only.
with expected_functions(schema_name, function_name, identity_arguments, access_kind) as (
  values
    ('private', 'kc_resolve_vendor_code', 'jsonb, text, text', 'private'),
    ('private', 'kc_assert_vendor_codes', 'jsonb', 'private'),
    ('private', 'kc_guard_vendor_code_product', 'jsonb, jsonb, jsonb, boolean', 'private'),
    ('private', 'kc_guard_vendor_code_sale', 'jsonb, jsonb, jsonb, jsonb', 'private'),
    ('private', 'kc_apply_vendor_code_snapshots', '', 'private'),
    ('public', 'kc_admin_update_inventory_item', 'text, jsonb, text, timestamp with time zone', 'rpc'),
    ('public', 'kc_admin_set_vendor_codes', 'text, jsonb, timestamp with time zone', 'rpc'),
    ('public', 'kc_admin_set_inventory_vendor_code', 'text, text, timestamp with time zone', 'rpc'),
    ('public', 'kc_admin_create_vendor', 'jsonb, timestamp with time zone', 'rpc')
),
installed_functions as (
  select e.*, p.oid, p.prosecdef, p.proconfig, p.proacl, p.proowner
  from expected_functions e
  left join pg_catalog.pg_namespace n on n.nspname = e.schema_name
  left join pg_catalog.pg_proc p on p.pronamespace = n.oid
    and p.proname = e.function_name
    and pg_catalog.oidvectortypes(p.proargtypes) = e.identity_arguments
),
function_permissions as (
  select f.*,
    exists (
      select 1 from pg_catalog.aclexplode(coalesce(f.proacl, pg_catalog.acldefault('f', f.proowner))) acl
      where acl.grantee = 0 and acl.privilege_type = 'EXECUTE'
    ) as public_execute,
    exists (
      select 1 from pg_catalog.aclexplode(coalesce(f.proacl, pg_catalog.acldefault('f', f.proowner))) acl
      where acl.grantee = pg_catalog.to_regrole('anon') and acl.privilege_type = 'EXECUTE'
    ) as anon_execute,
    exists (
      select 1 from pg_catalog.aclexplode(coalesce(f.proacl, pg_catalog.acldefault('f', f.proowner))) acl
      where acl.grantee = pg_catalog.to_regrole('authenticated') and acl.privilege_type = 'EXECUTE'
    ) as authenticated_execute
  from installed_functions f
),
trigger_status as (
  select t.tgname, t.tgenabled, n.nspname table_schema, c.relname table_name,
    pn.nspname function_schema, p.proname function_name
  from pg_catalog.pg_trigger t
  join pg_catalog.pg_class c on c.oid = t.tgrelid
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  join pg_catalog.pg_proc p on p.oid = t.tgfoid
  join pg_catalog.pg_namespace pn on pn.oid = p.pronamespace
  where not t.tgisinternal
    and t.tgname = 'kc_pos_state_00_vendor_code_guard_trigger'
),
state as (
  select payload from public.kc_pos_state where id = 'main'
),
vendors as (
  select vendor from state cross join lateral pg_catalog.jsonb_array_elements(
    case when pg_catalog.jsonb_typeof(payload -> 'vendors') = 'array'
      then payload -> 'vendors' else '[]'::jsonb end
  ) vendor
),
effective_codes as (
  select vendor ->> 'id' vendor_id, code,
    pg_catalog.upper(pg_catalog.btrim(code ->> 'code')) normalized_code
  from vendors cross join lateral pg_catalog.jsonb_array_elements(
    case when pg_catalog.jsonb_typeof(vendor -> 'codes') = 'array' then vendor -> 'codes'
    else pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
      'id', vendor ->> 'id',
      'code', pg_catalog.upper(pg_catalog.btrim(coalesce(vendor ->> 'code', ''))),
      'kind', 'footwear_accessory', 'primary', true, 'active', true
    )) end
  ) code
),
products as (
  select product from state cross join lateral pg_catalog.jsonb_array_elements(
    case when pg_catalog.jsonb_typeof(payload -> 'products') = 'array'
      then payload -> 'products' else '[]'::jsonb end
  ) product
),
sales as (
  select sale from state cross join lateral pg_catalog.jsonb_array_elements(
    case when pg_catalog.jsonb_typeof(payload -> 'sales') = 'array'
      then payload -> 'sales' else '[]'::jsonb end
  ) sale
),
sales_with_product as (
  select sale, product,
    coalesce(sale ->> 'sale_id', sale ->> 'id') sale_id,
    coalesce(sale ->> 'inventory_id', sale ->> 'productId') inventory_id,
    coalesce(sale ->> 'vendor_id', product ->> 'vendorId') effective_vendor_id
  from sales left join products on
    coalesce(product ->> 'inventory_id', product ->> 'id') =
    coalesce(sale ->> 'inventory_id', sale ->> 'productId')
),
settlements as (
  select settlement from state cross join lateral pg_catalog.jsonb_array_elements(
    case when pg_catalog.jsonb_typeof(payload -> 'settlements') = 'array'
      then payload -> 'settlements' else '[]'::jsonb end
  ) settlement
),
settlement_sales as (
  select settlement, sid.value sale_id, swp.sale_id matched_sale_id,
    swp.effective_vendor_id
  from settlements
  left join lateral pg_catalog.jsonb_array_elements_text(
    case when pg_catalog.jsonb_typeof(settlement -> 'saleIds') = 'array'
      then settlement -> 'saleIds' else '[]'::jsonb end
  ) sid on true
  left join sales_with_product swp on swp.sale_id = sid.value
),
materialization_stats as (
  select
    (select count(*) from vendors where not (vendor ? 'codes')) legacy_vendors,
    (select count(*) from vendors where vendor ? 'codes') materialized_vendors,
    (select count(*) from products where not (product ? 'vendorCodeId')) legacy_products,
    (select count(*) from products where product ? 'vendorCodeId') snapshotted_products,
    (select count(*) from sales where not (sale ? 'vendor_code_id')) legacy_sales,
    (select count(*) from sales where sale ? 'vendor_code_id') snapshotted_sales
),
issues(issue_type, record_id, detail) as (
  select 'FUNCTION_MISSING', schema_name || '.' || function_name,
    identity_arguments from installed_functions where oid is null
  union all
  select 'FUNCTION_NOT_SECURITY_DEFINER', schema_name || '.' || function_name,
    identity_arguments from function_permissions where oid is not null and not prosecdef
  union all
  select 'FUNCTION_SEARCH_PATH_INVALID', schema_name || '.' || function_name,
    coalesce(pg_catalog.array_to_string(proconfig, ','), '(missing)')
  from function_permissions where oid is not null and not exists (
    select 1 from pg_catalog.unnest(coalesce(proconfig, array[]::text[])) cfg
    where cfg in ('search_path=', 'search_path=""')
  )
  union all
  select 'FUNCTION_PUBLIC_EXECUTE_EXPOSED', schema_name || '.' || function_name,
    identity_arguments from function_permissions where oid is not null and public_execute
  union all
  select 'FUNCTION_ANON_EXECUTE_EXPOSED', schema_name || '.' || function_name,
    identity_arguments from function_permissions where oid is not null and anon_execute
  union all
  select 'PRIVATE_FUNCTION_AUTHENTICATED_EXECUTE_EXPOSED', schema_name || '.' || function_name,
    identity_arguments from function_permissions
  where oid is not null and access_kind = 'private' and authenticated_execute
  union all
  select 'RPC_AUTHENTICATED_EXECUTE_MISSING', schema_name || '.' || function_name,
    identity_arguments from function_permissions
  where oid is not null and access_kind = 'rpc' and not authenticated_execute
  union all
  select 'TRIGGER_MISSING_OR_DUPLICATE', 'kc_pos_state_00_vendor_code_guard_trigger',
    'Expected exactly one trigger on public.kc_pos_state'
  where (select count(*) from trigger_status) <> 1
  union all
  select 'TRIGGER_TARGET_INVALID', tgname,
    table_schema || '.' || table_name || ' -> ' || function_schema || '.' || function_name
  from trigger_status where table_schema is distinct from 'public'
    or table_name is distinct from 'kc_pos_state'
    or function_schema is distinct from 'private'
    or function_name is distinct from 'kc_apply_vendor_code_snapshots'
  union all
  select 'TRIGGER_DISABLED', tgname, 'tgenabled=' || tgenabled::text
  from trigger_status where tgenabled not in ('O', 'A')
  union all
  select 'POS_STATE_MISSING_OR_SHAPE_INVALID', 'main',
    'State row, object payload, and vendors/products/sales arrays are required'
  where not exists (select 1 from state) or exists (
    select 1 from state where payload is null
      or pg_catalog.jsonb_typeof(payload) is distinct from 'object'
      or pg_catalog.jsonb_typeof(payload -> 'vendors') is distinct from 'array'
      or pg_catalog.jsonb_typeof(payload -> 'products') is distinct from 'array'
      or pg_catalog.jsonb_typeof(payload -> 'sales') is distinct from 'array'
      or (payload ? 'settlements' and pg_catalog.jsonb_typeof(payload -> 'settlements') is distinct from 'array')
  )
  union all
  select 'VENDOR_ID_INVALID', coalesce(vendor ->> 'id', '(missing)'), 'Vendor id must be a UUID'
  from vendors where coalesce(vendor ->> 'id', '') !~*
    '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  union all
  select 'VENDOR_CODE_EMPTY', coalesce(vendor ->> 'id', '(missing)'), 'vendor.code is blank'
  from vendors where nullif(pg_catalog.btrim(coalesce(vendor ->> 'code', '')), '') is null
  union all
  select 'VENDOR_CODES_SHAPE_INVALID', coalesce(vendor ->> 'id', '(missing)'),
    'codes must be a non-empty array when present'
  from vendors where vendor ? 'codes' and (
    pg_catalog.jsonb_typeof(vendor -> 'codes') is distinct from 'array'
    or case when pg_catalog.jsonb_typeof(vendor -> 'codes') = 'array'
      then pg_catalog.jsonb_array_length(vendor -> 'codes') = 0 else false end
  )
  union all
  select 'VENDOR_CODE_DUPLICATE', min(vendor_id),
    normalized_code || ' occurs ' || count(*) || ' times'
  from effective_codes group by normalized_code having count(*) > 1
  union all
  select 'VENDOR_CODE_ID_DUPLICATE', min(vendor_id),
    coalesce(code ->> 'id', '(missing)') || ' occurs ' || count(*) || ' times'
  from effective_codes group by code ->> 'id' having count(*) > 1
  union all
  select 'VENDOR_CODE_ID_INVALID', vendor_id,
    coalesce(code ->> 'id', '(missing)') || ' must be a UUID'
  from effective_codes where coalesce(code ->> 'id', '') !~*
    '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  union all
  select 'VENDOR_CODE_INVALID', vendor_id, coalesce(code::text, '(missing)')
  from effective_codes where nullif(pg_catalog.btrim(coalesce(code ->> 'id', '')), '') is null
    or normalized_code = '' or code ->> 'code' is distinct from normalized_code
    or coalesce(nullif(pg_catalog.btrim(code ->> 'kind'), ''), '')
      not in ('footwear_accessory', 'apparel', 'chrome_hearts')
    or pg_catalog.jsonb_typeof(code -> 'primary') is distinct from 'boolean'
    or pg_catalog.jsonb_typeof(code -> 'active') is distinct from 'boolean'
  union all
  select 'VENDOR_PRIMARY_INVALID', coalesce(vendor ->> 'id', '(missing)'),
    'Exactly one active primary is required and vendor.code must match it'
  from vendors where (
    select count(*) from effective_codes ec where ec.vendor_id = vendor ->> 'id'
      and case when pg_catalog.jsonb_typeof(ec.code -> 'primary') = 'boolean'
        then (ec.code ->> 'primary')::boolean else false end
  ) <> 1 or not exists (
    select 1 from effective_codes ec where ec.vendor_id = vendor ->> 'id'
      and case when pg_catalog.jsonb_typeof(ec.code -> 'primary') = 'boolean'
        then (ec.code ->> 'primary')::boolean else false end
      and case when pg_catalog.jsonb_typeof(ec.code -> 'active') = 'boolean'
        then (ec.code ->> 'active')::boolean else false end
      and ec.normalized_code = pg_catalog.upper(pg_catalog.btrim(vendor ->> 'code'))
  )
  union all
  select 'PRODUCT_VENDOR_NOT_FOUND',
    coalesce(product ->> 'inventory_id', product ->> 'id', '(missing)'),
    coalesce(product ->> 'vendorId', '(missing)')
  from products where not exists (
    select 1 from vendors where vendor ->> 'id' = product ->> 'vendorId'
  )
  union all
  select 'PRODUCT_ID_INVALID_OR_DUPLICATE',
    coalesce(product ->> 'inventory_id', product ->> 'id', '(missing)'),
    'Stable inventory ID must be present and unique'
  from products where nullif(coalesce(product ->> 'inventory_id', product ->> 'id'), '') is null
    or coalesce(product ->> 'inventory_id', product ->> 'id') in (
      select coalesce(p2.product ->> 'inventory_id', p2.product ->> 'id')
      from products p2 group by 1 having count(*) > 1
    )
  union all
  select 'PRODUCT_SNAPSHOT_PARTIAL',
    coalesce(product ->> 'inventory_id', product ->> 'id', '(missing)'),
    'Product snapshot must contain all three fields or none'
  from products where pg_catalog.num_nonnulls(
    product ->> 'vendorCodeId', product ->> 'vendorCode', product ->> 'vendorCodeKind'
  ) not in (0, 3)
  union all
  select 'PRODUCT_VENDOR_CODE_NOT_FOUND',
    coalesce(product ->> 'inventory_id', product ->> 'id', '(missing)'),
    coalesce(product ->> 'vendorCodeId', '(missing)')
  from products where product ? 'vendorCodeId' and not exists (
    select 1 from effective_codes ec where ec.vendor_id = product ->> 'vendorId'
      and ec.code ->> 'id' = product ->> 'vendorCodeId'
  )
  union all
  select 'PRODUCT_SNAPSHOT_KIND_INVALID',
    coalesce(product ->> 'inventory_id', product ->> 'id', '(missing)'),
    coalesce(product ->> 'vendorCodeKind', '(missing)')
  from products where product ? 'vendorCodeKind'
    and coalesce(nullif(pg_catalog.btrim(product ->> 'vendorCodeKind'), ''), '')
      not in ('footwear_accessory', 'apparel', 'chrome_hearts')
  union all
  select 'SALE_INVENTORY_NOT_FOUND', coalesce(sale_id, '(missing)'),
    coalesce(inventory_id, '(missing)') from sales_with_product where product is null
  union all
  select 'SALE_ID_INVALID_OR_DUPLICATE',
    coalesce(sale ->> 'sale_id', sale ->> 'id', '(missing)'),
    'Stable sale ID must be present and unique'
  from sales where nullif(coalesce(sale ->> 'sale_id', sale ->> 'id'), '') is null
    or coalesce(sale ->> 'sale_id', sale ->> 'id') in (
      select coalesce(s2.sale ->> 'sale_id', s2.sale ->> 'id')
      from sales s2 group by 1 having count(*) > 1
    )
  union all
  select 'SALE_PRODUCT_VENDOR_MISMATCH', coalesce(sale_id, '(missing)'),
    coalesce(sale ->> 'vendor_id', '(missing)') || ' <> ' ||
      coalesce(product ->> 'vendorId', '(missing)')
  from sales_with_product where sale ? 'vendor_id' and product is not null
    and sale ->> 'vendor_id' is distinct from product ->> 'vendorId'
  union all
  select 'SALE_VENDOR_NOT_FOUND', coalesce(sale_id, '(missing)'),
    coalesce(effective_vendor_id, '(missing)')
  from sales_with_product where not exists (
    select 1 from vendors where vendor ->> 'id' = effective_vendor_id
  )
  union all
  select 'SALE_SNAPSHOT_PARTIAL', coalesce(sale ->> 'sale_id', sale ->> 'id', '(missing)'),
    'Sale code snapshot must contain all three code fields or none'
  from sales where pg_catalog.num_nonnulls(
    sale ->> 'vendor_code_id', sale ->> 'vendor_code', sale ->> 'vendor_code_kind'
  ) not in (0, 3)
  union all
  select 'SALE_VENDOR_CODE_NOT_FOUND', coalesce(sale_id, '(missing)'),
    coalesce(sale ->> 'vendor_code_id', '(missing)')
  from sales_with_product where sale ? 'vendor_code_id' and not exists (
    select 1 from effective_codes ec where ec.vendor_id = effective_vendor_id
      and ec.code ->> 'id' = sale ->> 'vendor_code_id'
  )
  union all
  select 'SALE_SNAPSHOT_KIND_INVALID',
    coalesce(sale ->> 'sale_id', sale ->> 'id', '(missing)'),
    coalesce(sale ->> 'vendor_code_kind', '(missing)')
  from sales where sale ? 'vendor_code_kind'
    and coalesce(nullif(pg_catalog.btrim(sale ->> 'vendor_code_kind'), ''), '')
      not in ('footwear_accessory', 'apparel', 'chrome_hearts')
  union all
  select 'SETTLEMENT_VENDOR_NOT_FOUND', coalesce(settlement ->> 'id', '(missing)'),
    coalesce(settlement ->> 'vendorId', '(missing)')
  from settlements where not exists (
    select 1 from vendors where vendor ->> 'id' = settlement ->> 'vendorId'
  )
  union all
  select 'SETTLEMENT_SALE_IDS_INVALID', coalesce(settlement ->> 'id', '(missing)'),
    'saleIds must be a non-empty array'
  from settlements where pg_catalog.jsonb_typeof(settlement -> 'saleIds') is distinct from 'array'
    or case when pg_catalog.jsonb_typeof(settlement -> 'saleIds') = 'array'
      then pg_catalog.jsonb_array_length(settlement -> 'saleIds') = 0 else false end
  union all
  select 'SETTLEMENT_SALE_NOT_FOUND', coalesce(settlement ->> 'id', '(missing)'),
    coalesce(sale_id, '(missing)')
  from settlement_sales where sale_id is not null and matched_sale_id is null
  union all
  select 'SETTLEMENT_SALE_VENDOR_MISMATCH', coalesce(settlement ->> 'id', '(missing)'), sale_id
  from settlement_sales where sale_id is not null and matched_sale_id is not null
    and effective_vendor_id is distinct from settlement ->> 'vendorId'
),
result_rows as (
  select issue_type status, record_id, detail from issues
  union all
  select 'PASS', 'kc_pos_state/main',
    '0 issues; migration 013 installed; current read-only snapshot counts: ' ||
    'legacy_vendors=' || legacy_vendors || ', materialized_vendors=' || materialized_vendors ||
    ', legacy_products=' || legacy_products || ', snapshotted_products=' || snapshotted_products ||
    ', legacy_sales=' || legacy_sales || ', snapshotted_sales=' || snapshotted_sales
  from materialization_stats where not exists (select 1 from issues)
)
select status, record_id, detail from result_rows order by status, record_id;

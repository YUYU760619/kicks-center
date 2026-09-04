-- Read-only postflight for migration 015. Expected healthy result: one PASS row.
with expected_functions(
  schema_name,
  function_name,
  argument_types,
  security_definer,
  volatility,
  authenticated_execute
) as (
  values
    ('private', 'kc_build_vendor_portal_snapshot', 'text', true, 's', false),
    ('private', 'kc_vendor_portal_snapshot', '', true, 's', true),
    ('public', 'kc_admin_get_vendor_preview', 'text', true, 's', true)
),
function_catalog as (
  select
    e.*,
    p.oid function_oid,
    p.prosecdef installed_security_definer,
    p.provolatile installed_volatility,
    pg_catalog.pg_get_functiondef(p.oid) function_definition,
    pg_catalog.regexp_replace(
      pg_catalog.lower(pg_catalog.pg_get_functiondef(p.oid)),
      '[[:space:]]+',
      ' ',
      'g'
    ) normalized_definition,
    exists (
      select 1
      from unnest(coalesce(p.proconfig, array[]::text[])) cfg
      where cfg in ('search_path=', 'search_path=""')
    ) fixed_search_path,
    coalesce(bool_or(acl.privilege_type = 'EXECUTE')
      filter (where acl.grantee = pg_catalog.to_regrole('authenticated')), false)
      authenticated_has_execute,
    coalesce(bool_or(acl.privilege_type = 'EXECUTE')
      filter (where acl.grantee = pg_catalog.to_regrole('anon')), false)
      anon_has_execute,
    coalesce(bool_or(acl.privilege_type = 'EXECUTE')
      filter (where acl.grantee = 0), false)
      public_has_execute
  from expected_functions e
  left join pg_catalog.pg_namespace n on n.nspname = e.schema_name
  left join pg_catalog.pg_proc p on p.pronamespace = n.oid
    and p.proname = e.function_name
    and pg_catalog.oidvectortypes(p.proargtypes) = e.argument_types
  left join lateral pg_catalog.aclexplode(
    coalesce(p.proacl, pg_catalog.acldefault('f', p.proowner))
  ) acl on p.oid is not null
  group by
    e.schema_name,
    e.function_name,
    e.argument_types,
    e.security_definer,
    e.volatility,
    e.authenticated_execute,
    p.oid,
    p.prosecdef,
    p.provolatile,
    p.proconfig
),
required_helpers(schema_name, function_name, argument_types) as (
  values
    ('private', 'kc_is_admin', ''),
    ('private', 'kc_current_vendor_id', '')
),
helper_catalog as (
  select
    e.*,
    p.oid function_oid
  from required_helpers e
  left join pg_catalog.pg_namespace n on n.nspname = e.schema_name
  left join pg_catalog.pg_proc p on p.pronamespace = n.oid
    and p.proname = e.function_name
    and pg_catalog.oidvectortypes(p.proargtypes) = e.argument_types
),
trigger_status as (
  select
    t.tgname,
    t.tgenabled,
    n.nspname table_schema,
    c.relname table_name,
    pn.nspname function_schema,
    p.proname function_name
  from pg_catalog.pg_trigger t
  join pg_catalog.pg_class c on c.oid = t.tgrelid
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  join pg_catalog.pg_proc p on p.oid = t.tgfoid
  join pg_catalog.pg_namespace pn on pn.oid = p.pronamespace
  where not t.tgisinternal
    and t.tgname = 'kc_pos_state_00_vendor_code_guard_trigger'
),
expected_builder_fields(source_alias, json_key, source_key) as (
  values
    ('item', 'id', 'id'),
    ('item', 'code', 'code'),
    ('item', 'codes', 'codes'),
    ('item', 'name', 'name'),
    ('item', 'phone', 'phone'),
    ('item', 'joined', 'joined'),
    ('item', 'id', 'id'),
    ('item', 'code', 'code'),
    ('item', 'category', 'category'),
    ('item', 'name', 'name'),
    ('item', 'brand', 'brand'),
    ('item', 'model', 'model'),
    ('item', 'ussize', 'ussize'),
    ('item', 'cmsize', 'cmsize'),
    ('item', 'color', 'color'),
    ('item', 'cost', 'cost'),
    ('item', 'status', 'status'),
    ('item', 'packaging', 'packaging'),
    ('item', 'consignmentstart', 'consignmentstart'),
    ('item', 'consignmentend', 'consignmentend'),
    ('item', 'createdat', 'createdat'),
    ('sale', 'id', 'id'),
    ('sale', 'productid', 'productid'),
    ('sale', 'cost', 'cost'),
    ('sale', 'soldat', 'soldat'),
    ('sale', 'settled', 'settled'),
    ('sale', 'settlementid', 'settlementid'),
    ('settlement', 'id', 'id'),
    ('settlement', 'saleids', 'saleids'),
    ('settlement', 'payout', 'payout'),
    ('settlement', 'completedat', 'completedat')
),
expected_builder_field_counts as (
  select source_alias, json_key, source_key, count(*) field_count
  from expected_builder_fields
  group by source_alias, json_key, source_key
),
actual_builder_fields as (
  select
    matches[2] source_alias,
    matches[1] json_key,
    matches[3] source_key
  from function_catalog fc
  cross join lateral pg_catalog.regexp_matches(
    fc.normalized_definition,
    pg_catalog.chr(39) || '([a-z][a-z0-9]*)' || pg_catalog.chr(39) ||
      '[[:space:]]*,[[:space:]]*(item|sale|settlement)[[:space:]]*->[[:space:]]*' ||
      pg_catalog.chr(39) || '([a-z][a-z0-9]*)' || pg_catalog.chr(39),
    'g'
  ) matches
  where fc.schema_name = 'private'
    and fc.function_name = 'kc_build_vendor_portal_snapshot'
    and fc.function_oid is not null
),
actual_builder_field_counts as (
  select source_alias, json_key, source_key, count(*) field_count
  from actual_builder_fields
  group by source_alias, json_key, source_key
),
builder_relation_sources as (
  select matches[2] source_name
  from function_catalog fc
  cross join lateral pg_catalog.regexp_matches(
    fc.normalized_definition,
    '\m(from|join)\M[[:space:]]+([a-z_][a-z0-9_.]*)',
    'g'
  ) matches
  where fc.schema_name = 'private'
    and fc.function_name = 'kc_build_vendor_portal_snapshot'
    and fc.function_oid is not null
),
state as (
  select payload
  from public.kc_pos_state
  where id = 'main'
),
vendors as (
  select vendor
  from state
  cross join lateral jsonb_array_elements(
    case when jsonb_typeof(payload -> 'vendors') = 'array'
      then payload -> 'vendors' else '[]'::jsonb end
  ) vendor
),
effective_codes as (
  select
    vendor ->> 'id' vendor_id,
    code,
    upper(btrim(code ->> 'code')) normalized_code
  from vendors
  cross join lateral jsonb_array_elements(
    case when jsonb_typeof(vendor -> 'codes') = 'array'
      then vendor -> 'codes'
      else jsonb_build_array(jsonb_build_object(
        'id', vendor ->> 'id',
        'code', upper(btrim(coalesce(vendor ->> 'code', ''))),
        'kind', 'footwear_accessory',
        'primary', true,
        'active', true
      ))
    end
  ) code
),
products as (
  select product
  from state
  cross join lateral jsonb_array_elements(
    case when jsonb_typeof(payload -> 'products') = 'array'
      then payload -> 'products' else '[]'::jsonb end
  ) product
),
sales as (
  select sale
  from state
  cross join lateral jsonb_array_elements(
    case when jsonb_typeof(payload -> 'sales') = 'array'
      then payload -> 'sales' else '[]'::jsonb end
  ) sale
),
sales_with_product as (
  select
    sale,
    product,
    coalesce(sale ->> 'sale_id', sale ->> 'id') sale_id,
    coalesce(sale ->> 'inventory_id', sale ->> 'productId') inventory_id,
    coalesce(sale ->> 'vendor_id', product ->> 'vendorId') effective_vendor_id
  from sales
  left join products on coalesce(product ->> 'inventory_id', product ->> 'id') =
    coalesce(sale ->> 'inventory_id', sale ->> 'productId')
),
settlements as (
  select settlement
  from state
  cross join lateral jsonb_array_elements(
    case when jsonb_typeof(payload -> 'settlements') = 'array'
      then payload -> 'settlements' else '[]'::jsonb end
  ) settlement
),
settlement_sales as (
  select
    settlement,
    sid.value sale_id,
    swp.sale_id matched_sale_id,
    swp.effective_vendor_id
  from settlements
  left join lateral jsonb_array_elements_text(
    case when jsonb_typeof(settlement -> 'saleIds') = 'array'
      then settlement -> 'saleIds' else '[]'::jsonb end
  ) sid on true
  left join sales_with_product swp on swp.sale_id = sid.value
),
issues(issue_type, record_id, detail) as (
  select
    'FUNCTION_MISSING',
    schema_name || '.' || function_name || '(' || argument_types || ')',
    'Migration 014 function signature was not found'
  from function_catalog
  where function_oid is null

  union all
  select
    'FUNCTION_SECURITY_INVALID',
    schema_name || '.' || function_name || '(' || argument_types || ')',
    'security_definer=' || coalesce(installed_security_definer::text, 'NULL') ||
      '; volatility=' || coalesce(installed_volatility::text, 'NULL') ||
      '; fixed_search_path=' || fixed_search_path::text
  from function_catalog
  where function_oid is not null
    and (
      installed_security_definer is distinct from security_definer
      or installed_volatility is distinct from volatility
      or not fixed_search_path
    )

  union all
  select
    'FUNCTION_PRIVILEGE_INVALID',
    schema_name || '.' || function_name || '(' || argument_types || ')',
    'authenticated=' || authenticated_has_execute::text ||
      '; anon=' || anon_has_execute::text ||
      '; public=' || public_has_execute::text
  from function_catalog
  where function_oid is not null
    and (
      authenticated_has_execute is distinct from authenticated_execute
      or anon_has_execute
      or public_has_execute
    )

  union all
  select
    'HELPER_FUNCTION_MISSING',
    schema_name || '.' || function_name || '(' || argument_types || ')',
    'Required authorization helper signature was not found'
  from helper_catalog
  where function_oid is null

  union all
  select
    'TRIGGER_MISSING_OR_DUPLICATE',
    'kc_pos_state_00_vendor_code_guard_trigger',
    'Expected exactly one Migration 013 VendorCode guard trigger'
  where (select count(*) from trigger_status) <> 1

  union all
  select
    'TRIGGER_TARGET_INVALID',
    tgname,
    table_schema || '.' || table_name || ' -> ' || function_schema || '.' || function_name
  from trigger_status
  where table_schema is distinct from 'public'
    or table_name is distinct from 'kc_pos_state'
    or function_schema is distinct from 'private'
    or function_name is distinct from 'kc_apply_vendor_code_snapshots'

  union all
  select
    'TRIGGER_DISABLED',
    tgname,
    'tgenabled=' || tgenabled::text
  from trigger_status
  where tgenabled not in ('O', 'A')

  union all
  select
    'VENDOR_WRAPPER_CONTRACT_INVALID',
    'private.kc_vendor_portal_snapshot()',
    'Wrapper must pass the kc_current_vendor_id result to the shared builder'
  from function_catalog
  where schema_name = 'private'
    and function_name = 'kc_vendor_portal_snapshot'
    and function_oid is not null
    and (
      position('v_vendor_id := private.kc_current_vendor_id();' in normalized_definition) = 0
      or position('return private.kc_build_vendor_portal_snapshot(v_vendor_id);' in normalized_definition) = 0
    )

  union all
  select
    'ADMIN_WRAPPER_CONTRACT_INVALID',
    'public.kc_admin_get_vendor_preview(text)',
    'Admin preview must validate Admin before passing its normalized text Vendor ID to the shared builder'
  from function_catalog
  where schema_name = 'public'
    and function_name = 'kc_admin_get_vendor_preview'
    and function_oid is not null
    and (
      position('v_vendor_id text := btrim(coalesce(p_vendor_id, ''''));' in normalized_definition) = 0
      or position('if not private.kc_is_admin() then' in normalized_definition) = 0
      or position('return private.kc_build_vendor_portal_snapshot(v_vendor_id);' in normalized_definition) = 0
      or position('if not private.kc_is_admin() then' in normalized_definition) >
        position('return private.kc_build_vendor_portal_snapshot(v_vendor_id);' in normalized_definition)
    )

  union all
  select
    'SHARED_BUILDER_SOURCE_INVALID',
    'private.kc_build_vendor_portal_snapshot(text)',
    'Builder must read only kc_pos_state/main and require a matching vendor'
  from function_catalog
  where schema_name = 'private'
    and function_name = 'kc_build_vendor_portal_snapshot'
    and function_oid is not null
    and (
      position('from public.kc_pos_state' in lower(function_definition)) = 0
      or position('where state.id = ''main''' in lower(function_definition)) = 0
      or position('vendor not found' in lower(function_definition)) = 0
      or position('return v_payload' in lower(function_definition)) > 0
    )

  union all
  select
    'SHARED_BUILDER_RELATION_SOURCE_INVALID',
    'private.kc_build_vendor_portal_snapshot(text)',
    'Unexpected source: ' || source_name
  from builder_relation_sources
  where source_name not in ('public.kc_pos_state', 'jsonb_array_elements')

  union all
  select
    'SHARED_BUILDER_STATE_SOURCE_INVALID',
    'private.kc_build_vendor_portal_snapshot(text)',
    'Expected exactly one public.kc_pos_state source'
  where (select count(*) from builder_relation_sources where source_name = 'public.kc_pos_state') <> 1

  union all
  select
    'SHARED_BUILDER_VENDOR_FILTER_INVALID',
    'private.kc_build_vendor_portal_snapshot(text)',
    'Product, Sale, or Settlement vendor isolation predicate is missing'
  from function_catalog
  where schema_name = 'private'
    and function_name = 'kc_build_vendor_portal_snapshot'
    and function_oid is not null
    and (
      position('item ->> ''vendorid'' = v_vendor_id' in lower(function_definition)) = 0
      or position('product ->> ''id'' = sale ->> ''productid''' in lower(function_definition)) = 0
      or position('product ->> ''vendorid'' = v_vendor_id' in lower(function_definition)) = 0
      or position('settlement ->> ''vendorid'' = v_vendor_id' in lower(function_definition)) = 0
    )

  union all
  select
    'SHARED_BUILDER_WHITELIST_FIELD_MISSING',
    'private.kc_build_vendor_portal_snapshot(text)',
    expected.source_alias || '.' || expected.json_key || ' expected=' || expected.field_count::text ||
      '; actual=' || coalesce(actual.field_count, 0)::text
  from expected_builder_field_counts expected
  left join actual_builder_field_counts actual
    on actual.source_alias = expected.source_alias
    and actual.json_key = expected.json_key
    and actual.source_key = expected.source_key
  where actual.field_count is distinct from expected.field_count

  union all
  select
    'SHARED_BUILDER_WHITELIST_FIELD_UNEXPECTED',
    'private.kc_build_vendor_portal_snapshot(text)',
    actual.source_alias || '.' || actual.json_key || ' count=' || actual.field_count::text
  from actual_builder_field_counts actual
  left join expected_builder_field_counts expected
    on expected.source_alias = actual.source_alias
    and expected.json_key = actual.json_key
    and expected.source_key = actual.source_key
  where expected.source_alias is null

  union all
  select
    'SHARED_BUILDER_FORBIDDEN_PRIVACY_FIELD',
    'private.kc_build_vendor_portal_snapshot(text)',
    'Vendor snapshot must not emit Product note/price/history, Sale price, or Settlement totalSales'
  from function_catalog
  where schema_name = 'private'
    and function_name = 'kc_build_vendor_portal_snapshot'
    and function_oid is not null
    and (
      position('''note'', item -> ''note''' in normalized_definition) > 0
      or position('''location'', item -> ''location''' in normalized_definition) > 0
      or position('''price'', item -> ''price''' in normalized_definition) > 0
      or position('''history'', item -> ''history''' in normalized_definition) > 0
      or position('''price'', sale -> ''price''' in normalized_definition) > 0
      or position('''totalsales'', settlement -> ''totalsales''' in normalized_definition) > 0
    )

  union all
  select
    'SALE_VISIBILITY_BASELINE_CHANGED',
    'private.kc_build_vendor_portal_snapshot(text)',
    'Migration 014 must retain relation-based Sale inclusion without visibility or settlement filtering'
  from function_catalog
  where schema_name = 'private'
    and function_name = 'kc_build_vendor_portal_snapshot'
    and function_oid is not null
    and (
      position('vendor_visible' in lower(function_definition)) > 0
      or position('vendorvisible' in lower(function_definition)) > 0
      or position('settlement_status' in lower(function_definition)) > 0
      or position('sale ->> ''settled''' in lower(function_definition)) > 0
    )

  union all
  select
    'POS_STATE_MISSING_OR_SHAPE_INVALID',
    'kc_pos_state/main',
    'State row, object payload, and vendors/products/sales/settlements arrays are required'
  where not exists (select 1 from state)
    or exists (
      select 1
      from state
      where payload is null
        or jsonb_typeof(payload) is distinct from 'object'
        or jsonb_typeof(payload -> 'vendors') is distinct from 'array'
        or jsonb_typeof(payload -> 'products') is distinct from 'array'
        or jsonb_typeof(payload -> 'sales') is distinct from 'array'
        or jsonb_typeof(payload -> 'settlements') is distinct from 'array'
    )

  union all
  select
    'VENDOR_RECORD_INVALID',
    coalesce(vendor ->> 'id', '(missing)'),
    'Vendor must be an object with UUID id, non-empty code/name, and compatible legacy or multi-code fields'
  from vendors
  where jsonb_typeof(vendor) is distinct from 'object'
    or coalesce(vendor ->> 'id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    or nullif(btrim(coalesce(vendor ->> 'code', '')), '') is null
    or nullif(btrim(coalesce(vendor ->> 'name', '')), '') is null
    or (vendor ? 'codes' and jsonb_typeof(vendor -> 'codes') is distinct from 'array')

  union all
  select
    'VENDOR_CODES_SHAPE_INVALID',
    coalesce(vendor ->> 'id', '(missing)'),
    'codes must be a non-empty array when present'
  from vendors
  where vendor ? 'codes'
    and (
      jsonb_typeof(vendor -> 'codes') is distinct from 'array'
      or case when jsonb_typeof(vendor -> 'codes') = 'array'
        then jsonb_array_length(vendor -> 'codes') = 0 else false end
    )

  union all
  select
    'VENDOR_ID_DUPLICATE',
    vendor ->> 'id',
    'Vendor id occurs ' || count(*)::text || ' times'
  from vendors
  group by vendor ->> 'id'
  having count(*) > 1

  union all
  select
    'VENDOR_CODE_ID_INVALID',
    coalesce(vendor_id, '(missing)'),
    coalesce(code ->> 'id', '(missing)') || ' must be a UUID'
  from effective_codes
  where coalesce(code ->> 'id', '') !~*
    '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'

  union all
  select
    'VENDOR_CODE_ID_DUPLICATE',
    min(vendor_id),
    coalesce(code ->> 'id', '(missing)') || ' occurs ' || count(*)::text || ' times'
  from effective_codes
  group by code ->> 'id'
  having count(*) > 1

  union all
  select
    'VENDOR_CODE_INVALID',
    vendor_id,
    coalesce(code::text, '(missing)')
  from effective_codes
  where nullif(btrim(coalesce(code ->> 'id', '')), '') is null
    or normalized_code = ''
    or code ->> 'code' is distinct from normalized_code
    or coalesce(nullif(btrim(code ->> 'kind'), ''), '')
      not in ('footwear_accessory', 'apparel', 'chrome_hearts')
    or jsonb_typeof(code -> 'primary') is distinct from 'boolean'
    or jsonb_typeof(code -> 'active') is distinct from 'boolean'

  union all
  select
    'VENDOR_PRIMARY_INVALID',
    coalesce(vendor ->> 'id', '(missing)'),
    'Exactly one active primary is required and vendor.code must match it'
  from vendors
  where (
    select count(*)
    from effective_codes ec
    where ec.vendor_id = vendor ->> 'id'
      and case when jsonb_typeof(ec.code -> 'primary') = 'boolean'
        then (ec.code ->> 'primary')::boolean else false end
  ) <> 1
    or not exists (
      select 1
      from effective_codes ec
      where ec.vendor_id = vendor ->> 'id'
        and case when jsonb_typeof(ec.code -> 'primary') = 'boolean'
          then (ec.code ->> 'primary')::boolean else false end
        and case when jsonb_typeof(ec.code -> 'active') = 'boolean'
          then (ec.code ->> 'active')::boolean else false end
        and ec.normalized_code = upper(btrim(vendor ->> 'code'))
    )

  union all
  select
    'VENDOR_CODE_DUPLICATE',
    min(vendor_id),
    normalized_code || ' occurs ' || count(*)::text || ' times'
  from effective_codes
  group by normalized_code
  having count(*) > 1

  union all
  select
    'PRODUCT_VENDOR_NOT_FOUND',
    coalesce(product ->> 'inventory_id', product ->> 'id', '(missing)'),
    coalesce(product ->> 'vendorId', '(missing)')
  from products
  where not exists (
    select 1 from vendors where vendor ->> 'id' = product ->> 'vendorId'
  )

  union all
  select
    'PRODUCT_SNAPSHOT_PARTIAL_OR_INVALID',
    coalesce(product ->> 'inventory_id', product ->> 'id', '(missing)'),
    'Product VendorCode snapshot must be absent or complete with a valid kind'
  from products
  where num_nonnulls(
      product ->> 'vendorCodeId',
      product ->> 'vendorCode',
      product ->> 'vendorCodeKind'
    ) not in (0, 3)
    or (
      product ? 'vendorCodeKind'
      and coalesce(nullif(btrim(product ->> 'vendorCodeKind'), ''), '')
        not in ('footwear_accessory', 'apparel', 'chrome_hearts')
    )

  union all
  select
    'PRODUCT_VENDOR_CODE_NOT_FOUND',
    coalesce(product ->> 'inventory_id', product ->> 'id', '(missing)'),
    coalesce(product ->> 'vendorCodeId', '(missing)')
  from products
  where product ? 'vendorCodeId'
    and not exists (
      select 1
      from effective_codes ec
      where ec.vendor_id = product ->> 'vendorId'
        and ec.code ->> 'id' = product ->> 'vendorCodeId'
    )

  union all
  select
    'PRODUCT_VENDOR_CODE_SNAPSHOT_MISMATCH',
    coalesce(product ->> 'inventory_id', product ->> 'id', '(missing)'),
    coalesce(product ->> 'vendorCodeId', '(missing)')
  from products
  where product ? 'vendorCodeId'
    and not exists (
      select 1
      from effective_codes ec
      where ec.vendor_id = product ->> 'vendorId'
        and ec.code ->> 'id' = product ->> 'vendorCodeId'
        and ec.normalized_code = upper(btrim(product ->> 'vendorCode'))
        and ec.code ->> 'kind' = product ->> 'vendorCodeKind'
    )

  union all
  select
    'SALE_PRODUCT_NOT_FOUND',
    coalesce(sale_id, '(missing)'),
    coalesce(inventory_id, '(missing)')
  from sales_with_product
  where product is null

  union all
  select
    'SALE_VENDOR_NOT_FOUND',
    coalesce(sale_id, '(missing)'),
    coalesce(effective_vendor_id, '(missing)')
  from sales_with_product
  where not exists (
    select 1 from vendors where vendor ->> 'id' = effective_vendor_id
  )

  union all
  select
    'SALE_PRODUCT_VENDOR_MISMATCH',
    coalesce(sale_id, '(missing)'),
    coalesce(sale ->> 'vendor_id', '(missing)') || ' <> ' ||
      coalesce(product ->> 'vendorId', '(missing)')
  from sales_with_product
  where product is not null
    and sale ? 'vendor_id'
    and sale ->> 'vendor_id' is distinct from product ->> 'vendorId'

  union all
  select
    'SALE_SNAPSHOT_PARTIAL_OR_INVALID',
    coalesce(sale ->> 'sale_id', sale ->> 'id', '(missing)'),
    'Sale VendorCode snapshot must be absent or complete with a valid kind'
  from sales
  where num_nonnulls(
      sale ->> 'vendor_code_id',
      sale ->> 'vendor_code',
      sale ->> 'vendor_code_kind'
    ) not in (0, 3)
    or (
      sale ? 'vendor_code_kind'
      and coalesce(nullif(btrim(sale ->> 'vendor_code_kind'), ''), '')
        not in ('footwear_accessory', 'apparel', 'chrome_hearts')
    )

  union all
  select
    'SALE_VENDOR_CODE_NOT_FOUND',
    coalesce(sale_id, '(missing)'),
    coalesce(sale ->> 'vendor_code_id', '(missing)')
  from sales_with_product
  where sale ? 'vendor_code_id'
    and not exists (
      select 1
      from effective_codes ec
      where ec.vendor_id = effective_vendor_id
        and ec.code ->> 'id' = sale ->> 'vendor_code_id'
    )

  union all
  select
    'SALE_VENDOR_CODE_SNAPSHOT_MISMATCH',
    coalesce(sale_id, '(missing)'),
    coalesce(sale ->> 'vendor_code_id', '(missing)')
  from sales_with_product
  where sale ? 'vendor_code_id'
    and not exists (
      select 1
      from effective_codes ec
      where ec.vendor_id = effective_vendor_id
        and ec.code ->> 'id' = sale ->> 'vendor_code_id'
        and ec.normalized_code = upper(btrim(sale ->> 'vendor_code'))
        and ec.code ->> 'kind' = sale ->> 'vendor_code_kind'
    )

  union all
  select
    'SETTLEMENT_VENDOR_NOT_FOUND',
    coalesce(settlement ->> 'id', '(missing)'),
    coalesce(settlement ->> 'vendorId', '(missing)')
  from settlements
  where not exists (
    select 1 from vendors where vendor ->> 'id' = settlement ->> 'vendorId'
  )

  union all
  select
    'SETTLEMENT_SALE_IDS_INVALID',
    coalesce(settlement ->> 'id', '(missing)'),
    'saleIds must be an array'
  from settlements
  where jsonb_typeof(settlement -> 'saleIds') is distinct from 'array'

  union all
  select
    'SETTLEMENT_SALE_NOT_FOUND',
    coalesce(settlement ->> 'id', '(missing)'),
    coalesce(sale_id, '(missing)')
  from settlement_sales
  where sale_id is not null
    and matched_sale_id is null

  union all
  select
    'SETTLEMENT_SALE_VENDOR_MISMATCH',
    coalesce(settlement ->> 'id', '(missing)'),
    sale_id
  from settlement_sales
  where sale_id is not null
    and matched_sale_id is not null
    and effective_vendor_id is distinct from settlement ->> 'vendorId'
)
select issue_type status, record_id, detail
from issues
union all
select
  'PASS',
  'kc_pos_state/main',
  '0 issues; migration 015 installed and vendor price privacy verified'
where not exists (select 1 from issues)
order by status, record_id;

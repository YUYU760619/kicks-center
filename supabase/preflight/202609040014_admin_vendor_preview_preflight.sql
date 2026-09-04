-- Read-only preflight for migration 014. Expected healthy result: one PASS row.
with expected_dependencies(schema_name, function_name, argument_types, security_definer, volatility, authenticated_execute) as (
  values
    ('private', 'kc_is_admin', '', true, 's', true),
    ('private', 'kc_current_vendor_id', '', true, 's', true),
    ('private', 'kc_vendor_portal_snapshot', '', true, 's', true),
    ('public', 'kc_vendor_portal_snapshot', '', false, 's', true)
),
dependency_catalog as (
  select
    e.*,
    p.oid function_oid,
    p.prosecdef installed_security_definer,
    p.provolatile installed_volatility,
    exists (
      select 1
      from unnest(coalesce(p.proconfig, array[]::text[])) cfg
      where cfg in ('search_path=', 'search_path=""')
    ) fixed_search_path,
    coalesce(bool_or(
      case when acl.grantee = pg_catalog.to_regrole('authenticated') then acl.privilege_type = 'EXECUTE' else false end
    ) filter (where acl.grantee = pg_catalog.to_regrole('authenticated')), false) authenticated_has_execute,
    coalesce(bool_or(
      case when acl.grantee = 0 then acl.privilege_type = 'EXECUTE' else false end
    ) filter (where acl.grantee = 0), false) public_has_execute,
    coalesce(bool_or(
      case when acl.grantee = pg_catalog.to_regrole('anon') then acl.privilege_type = 'EXECUTE' else false end
    ) filter (where acl.grantee = pg_catalog.to_regrole('anon')), false) anon_has_execute
  from expected_dependencies e
  left join pg_catalog.pg_namespace n on n.nspname = e.schema_name
  left join pg_catalog.pg_proc p on p.pronamespace = n.oid
    and p.proname = e.function_name
    and pg_catalog.oidvectortypes(p.proargtypes) = e.argument_types
  left join lateral pg_catalog.aclexplode(
    coalesce(p.proacl, pg_catalog.acldefault('f', p.proowner))
  ) acl on p.oid is not null
  group by e.schema_name, e.function_name, e.argument_types, e.security_definer,
    e.volatility, e.authenticated_execute, p.oid, p.prosecdef, p.provolatile, p.proconfig
),
planned_functions(schema_name, function_name, argument_types) as (
  values
    ('private', 'kc_build_vendor_portal_snapshot', 'text'),
    ('public', 'kc_admin_get_vendor_preview', 'text')
),
planned_catalog as (
  select
    n.nspname schema_name,
    p.proname function_name,
    pg_catalog.oidvectortypes(p.proargtypes) argument_types
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  join planned_functions e on e.schema_name = n.nspname and e.function_name = p.proname
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
    case when jsonb_typeof(payload -> 'vendors') = 'array' then payload -> 'vendors' else '[]'::jsonb end
  ) vendor
),
products as (
  select product
  from state
  cross join lateral jsonb_array_elements(
    case when jsonb_typeof(payload -> 'products') = 'array' then payload -> 'products' else '[]'::jsonb end
  ) product
),
sales as (
  select sale
  from state
  cross join lateral jsonb_array_elements(
    case when jsonb_typeof(payload -> 'sales') = 'array' then payload -> 'sales' else '[]'::jsonb end
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
    case when jsonb_typeof(payload -> 'settlements') = 'array' then payload -> 'settlements' else '[]'::jsonb end
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
    case when jsonb_typeof(settlement -> 'saleIds') = 'array' then settlement -> 'saleIds' else '[]'::jsonb end
  ) sid on true
  left join sales_with_product swp on swp.sale_id = sid.value
),
issues(issue_type, record_id, detail) as (
  select
    'DEPENDENCY_FUNCTION_MISSING',
    schema_name || '.' || function_name || '(' || argument_types || ')',
    'Required function signature was not found'
  from dependency_catalog
  where function_oid is null

  union all
  select
    'DEPENDENCY_SECURITY_CONTRACT_INVALID',
    schema_name || '.' || function_name || '(' || argument_types || ')',
    'security_definer=' || coalesce(installed_security_definer::text, 'NULL') ||
      '; volatility=' || coalesce(installed_volatility::text, 'NULL') ||
      '; fixed_search_path=' || fixed_search_path::text
  from dependency_catalog
  where function_oid is not null
    and (installed_security_definer is distinct from security_definer
      or installed_volatility is distinct from volatility
      or not fixed_search_path)

  union all
  select
    'DEPENDENCY_EXECUTE_CONTRACT_INVALID',
    schema_name || '.' || function_name || '(' || argument_types || ')',
    'authenticated=' || authenticated_has_execute::text ||
      '; anon=' || anon_has_execute::text ||
      '; public=' || public_has_execute::text
  from dependency_catalog
  where function_oid is not null
    and (authenticated_has_execute is distinct from authenticated_execute
      or anon_has_execute
      or public_has_execute)

  union all
  select
    'MIGRATION_014_FUNCTION_ALREADY_EXISTS',
    schema_name || '.' || function_name || '(' || argument_types || ')',
    'Migration 014 target signature already exists'
  from planned_catalog pc
  where exists (
    select 1 from planned_functions pf
    where pf.schema_name = pc.schema_name
      and pf.function_name = pc.function_name
      and pf.argument_types = pc.argument_types
  )

  union all
  select
    'MIGRATION_014_SUSPICIOUS_OVERLOAD',
    schema_name || '.' || function_name || '(' || argument_types || ')',
    'A same-name function with an unexpected signature exists'
  from planned_catalog pc
  where not exists (
    select 1 from planned_functions pf
    where pf.schema_name = pc.schema_name
      and pf.function_name = pc.function_name
      and pf.argument_types = pc.argument_types
  )

  union all
  select
    'POS_STATE_MISSING_OR_SHAPE_INVALID',
    'kc_pos_state/main',
    'State row, object payload, and vendors/products/sales/settlements arrays are required'
  where not exists (select 1 from state)
    or exists (
      select 1 from state where
        payload is null
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
    'Vendor must be an object with UUID id, non-empty code/name, and compatible optional fields'
  from vendors
  where jsonb_typeof(vendor) is distinct from 'object'
    or coalesce(vendor ->> 'id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    or nullif(btrim(coalesce(vendor ->> 'code', '')), '') is null
    or nullif(btrim(coalesce(vendor ->> 'name', '')), '') is null
    or (vendor ? 'phone' and jsonb_typeof(vendor -> 'phone') not in ('string', 'null'))
    or (vendor ? 'joined' and jsonb_typeof(vendor -> 'joined') not in ('string', 'null'))
    or (vendor ? 'codes' and jsonb_typeof(vendor -> 'codes') is distinct from 'array')

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
    'PRODUCT_RECORD_INVALID',
    coalesce(product ->> 'inventory_id', product ->> 'id', '(missing)'),
    'Product must be an object with stable id/vendorId and compatible portal fields'
  from products
  where jsonb_typeof(product) is distinct from 'object'
    or nullif(btrim(coalesce(product ->> 'id', '')), '') is null
    or nullif(btrim(coalesce(product ->> 'vendorId', '')), '') is null
    or jsonb_typeof(product -> 'code') is distinct from 'string'
    or jsonb_typeof(product -> 'name') is distinct from 'string'
    or jsonb_typeof(product -> 'model') is distinct from 'string'
    or jsonb_typeof(product -> 'usSize') is distinct from 'string'
    or jsonb_typeof(product -> 'cmSize') is distinct from 'string'
    or jsonb_typeof(product -> 'cost') is distinct from 'number'
    or jsonb_typeof(product -> 'price') is distinct from 'number'
    or jsonb_typeof(product -> 'status') is distinct from 'string'
    or jsonb_typeof(product -> 'consignmentStart') is distinct from 'string'
    or jsonb_typeof(product -> 'history') is distinct from 'array'

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
    'SALE_RECORD_INVALID',
    coalesce(sale ->> 'sale_id', sale ->> 'id', '(missing)'),
    'Sale must be an object with stable id/inventory relation and compatible portal fields'
  from sales
  where jsonb_typeof(sale) is distinct from 'object'
    or nullif(btrim(coalesce(sale ->> 'id', '')), '') is null
    or nullif(btrim(coalesce(sale ->> 'productId', '')), '') is null
    or jsonb_typeof(sale -> 'cost') is distinct from 'number'
    or jsonb_typeof(sale -> 'price') is distinct from 'number'
    or jsonb_typeof(sale -> 'soldAt') is distinct from 'string'
    or jsonb_typeof(sale -> 'settled') is distinct from 'boolean'

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
    coalesce(sale ->> 'vendor_id', '(missing)') || ' <> ' || coalesce(product ->> 'vendorId', '(missing)')
  from sales_with_product
  where product is not null
    and sale ? 'vendor_id'
    and sale ->> 'vendor_id' is distinct from product ->> 'vendorId'

  union all
  select
    'SETTLEMENT_RECORD_INVALID',
    coalesce(settlement ->> 'id', '(missing)'),
    'Settlement must be an object with id/vendorId, saleIds array, and compatible portal fields'
  from settlements
  where jsonb_typeof(settlement) is distinct from 'object'
    or nullif(btrim(coalesce(settlement ->> 'id', '')), '') is null
    or nullif(btrim(coalesce(settlement ->> 'vendorId', '')), '') is null
    or jsonb_typeof(settlement -> 'saleIds') is distinct from 'array'
    or jsonb_typeof(settlement -> 'payout') is distinct from 'number'
    or jsonb_typeof(settlement -> 'totalSales') is distinct from 'number'
    or jsonb_typeof(settlement -> 'completedAt') is distinct from 'string'

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
    'SETTLEMENT_SALE_NOT_FOUND',
    coalesce(settlement ->> 'id', '(missing)'),
    coalesce(sale_id, '(missing)')
  from settlement_sales
  where sale_id is not null and matched_sale_id is null

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
select 'PASS', 'kc_pos_state/main', '0 issues; migration 014 preflight ready'
where not exists (select 1 from issues)
order by status, record_id;

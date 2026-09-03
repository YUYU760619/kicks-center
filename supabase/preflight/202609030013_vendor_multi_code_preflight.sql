-- Read-only preflight for migration 013. Expected healthy result: one PASS row.
with state as (
  select payload from public.kc_pos_state where id = 'main'
),
vendors as (
  select vendor from state cross join lateral jsonb_array_elements(
    case when jsonb_typeof(payload -> 'vendors') = 'array' then payload -> 'vendors' else '[]'::jsonb end
  ) vendor
),
effective_codes as (
  select vendor ->> 'id' vendor_id, code, upper(btrim(code ->> 'code')) normalized_code
  from vendors cross join lateral jsonb_array_elements(
    case when jsonb_typeof(vendor -> 'codes') = 'array' then vendor -> 'codes'
    else jsonb_build_array(jsonb_build_object(
      'id', vendor ->> 'id', 'code', upper(btrim(coalesce(vendor ->> 'code', ''))),
      'kind', 'footwear_accessory', 'primary', true, 'active', true
    )) end
  ) code
),
products as (
  select product from state cross join lateral jsonb_array_elements(
    case when jsonb_typeof(payload -> 'products') = 'array' then payload -> 'products' else '[]'::jsonb end
  ) product
),
sales as (
  select sale from state cross join lateral jsonb_array_elements(
    case when jsonb_typeof(payload -> 'sales') = 'array' then payload -> 'sales' else '[]'::jsonb end
  ) sale
),
sales_with_product as (
  select sale, product,
    coalesce(sale ->> 'sale_id', sale ->> 'id') sale_id,
    coalesce(sale ->> 'inventory_id', sale ->> 'productId') inventory_id,
    coalesce(sale ->> 'vendor_id', product ->> 'vendorId') effective_vendor_id
  from sales left join products on coalesce(product ->> 'inventory_id', product ->> 'id') =
    coalesce(sale ->> 'inventory_id', sale ->> 'productId')
),
settlements as (
  select settlement from state cross join lateral jsonb_array_elements(
    case when jsonb_typeof(payload -> 'settlements') = 'array' then payload -> 'settlements' else '[]'::jsonb end
  ) settlement
),
settlement_sales as (
  select settlement, sid.value sale_id, swp.sale_id matched_sale_id, swp.effective_vendor_id
  from settlements left join lateral jsonb_array_elements_text(
    case when jsonb_typeof(settlement -> 'saleIds') = 'array' then settlement -> 'saleIds' else '[]'::jsonb end
  ) sid on true left join sales_with_product swp on swp.sale_id = sid.value
),
issues(issue_type, record_id, detail) as (
  select 'POS_STATE_MISSING_OR_SHAPE_INVALID', 'main', 'State row, object payload, and vendors/products/sales arrays are required'
  where not exists (select 1 from state) or exists (select 1 from state where
    payload is null or jsonb_typeof(payload) is distinct from 'object'
    or jsonb_typeof(payload -> 'vendors') is distinct from 'array'
    or jsonb_typeof(payload -> 'products') is distinct from 'array'
    or jsonb_typeof(payload -> 'sales') is distinct from 'array')
  union all
  select 'VENDOR_ID_INVALID', coalesce(vendor ->> 'id', '(missing)'), 'Vendor id must be a UUID'
  from vendors where coalesce(vendor ->> 'id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  union all
  select 'VENDOR_CODE_EMPTY', coalesce(vendor ->> 'id', '(missing)'), 'vendor.code is blank'
  from vendors where nullif(btrim(coalesce(vendor ->> 'code', '')), '') is null
  union all
  select 'VENDOR_CODES_SHAPE_INVALID', vendor ->> 'id', 'codes must be a non-empty array when present'
  from vendors where vendor ? 'codes' and (jsonb_typeof(vendor -> 'codes') is distinct from 'array'
    or case when jsonb_typeof(vendor -> 'codes') = 'array' then jsonb_array_length(vendor -> 'codes') = 0 else false end)
  union all
  select 'VENDOR_CODE_DUPLICATE', min(vendor_id), normalized_code || ' occurs ' || count(*) || ' times'
  from effective_codes group by normalized_code having count(*) > 1
  union all
  select 'VENDOR_CODE_ID_DUPLICATE', min(vendor_id), coalesce(code ->> 'id', '(missing)') || ' occurs ' || count(*) || ' times'
  from effective_codes group by code ->> 'id' having count(*) > 1
  union all
  select 'VENDOR_CODE_ID_INVALID', vendor_id, coalesce(code ->> 'id', '(missing)') || ' must be a UUID'
  from effective_codes where coalesce(code ->> 'id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  union all
  select 'VENDOR_CODE_INVALID', vendor_id, coalesce(code::text, '(missing)') from effective_codes
  where nullif(btrim(coalesce(code ->> 'id', '')), '') is null or normalized_code = ''
    or code ->> 'code' is distinct from normalized_code
    or coalesce(nullif(btrim(code ->> 'kind'), ''), '')
         not in ('footwear_accessory', 'apparel', 'chrome_hearts')
    or jsonb_typeof(code -> 'primary') is distinct from 'boolean'
    or jsonb_typeof(code -> 'active') is distinct from 'boolean'
  union all
  select 'VENDOR_PRIMARY_INVALID', vendor ->> 'id', 'Exactly one active primary is required and vendor.code must match it'
  from vendors where (select count(*) from effective_codes ec where ec.vendor_id = vendor ->> 'id'
    and case when jsonb_typeof(ec.code -> 'primary') = 'boolean' then (ec.code ->> 'primary')::boolean else false end) <> 1
    or not exists (select 1 from effective_codes ec where ec.vendor_id = vendor ->> 'id'
      and case when jsonb_typeof(ec.code -> 'primary') = 'boolean' then (ec.code ->> 'primary')::boolean else false end
      and case when jsonb_typeof(ec.code -> 'active') = 'boolean' then (ec.code ->> 'active')::boolean else false end
      and ec.normalized_code = upper(btrim(vendor ->> 'code')))
  union all
  select 'PRODUCT_VENDOR_NOT_FOUND', coalesce(product ->> 'inventory_id', product ->> 'id', '(missing)'), coalesce(product ->> 'vendorId', '(missing)')
  from products where not exists (select 1 from vendors where vendor ->> 'id' = product ->> 'vendorId')
  union all
  select 'PRODUCT_ID_INVALID_OR_DUPLICATE', coalesce(product ->> 'inventory_id', product ->> 'id', '(missing)'), 'Stable inventory ID must be present and unique'
  from products where nullif(coalesce(product ->> 'inventory_id', product ->> 'id'), '') is null
    or coalesce(product ->> 'inventory_id', product ->> 'id') in (
      select coalesce(p2.product ->> 'inventory_id', p2.product ->> 'id') from products p2 group by 1 having count(*) > 1)
  union all
  select 'PRODUCT_SNAPSHOT_PARTIAL', coalesce(product ->> 'inventory_id', product ->> 'id', '(missing)'), 'Product snapshot must contain all three fields or none'
  from products where num_nonnulls(product ->> 'vendorCodeId', product ->> 'vendorCode', product ->> 'vendorCodeKind') not in (0, 3)
  union all
  select 'PRODUCT_VENDOR_CODE_NOT_FOUND', coalesce(product ->> 'inventory_id', product ->> 'id', '(missing)'), product ->> 'vendorCodeId'
  from products where product ? 'vendorCodeId' and not exists (select 1 from effective_codes ec
    where ec.vendor_id = product ->> 'vendorId' and ec.code ->> 'id' = product ->> 'vendorCodeId')
  union all
  select 'PRODUCT_SNAPSHOT_KIND_INVALID', coalesce(product ->> 'inventory_id', product ->> 'id', '(missing)'), coalesce(product ->> 'vendorCodeKind', '(missing)')
  from products where product ? 'vendorCodeKind'
    and coalesce(nullif(btrim(product ->> 'vendorCodeKind'), ''), '')
      not in ('footwear_accessory', 'apparel', 'chrome_hearts')
  union all
  select 'SALE_INVENTORY_NOT_FOUND', coalesce(sale_id, '(missing)'), coalesce(inventory_id, '(missing)')
  from sales_with_product where product is null
  union all
  select 'SALE_ID_INVALID_OR_DUPLICATE', coalesce(sale ->> 'sale_id', sale ->> 'id', '(missing)'), 'Stable sale ID must be present and unique'
  from sales where nullif(coalesce(sale ->> 'sale_id', sale ->> 'id'), '') is null
    or coalesce(sale ->> 'sale_id', sale ->> 'id') in (
      select coalesce(s2.sale ->> 'sale_id', s2.sale ->> 'id') from sales s2 group by 1 having count(*) > 1)
  union all
  select 'SALE_PRODUCT_VENDOR_MISMATCH', coalesce(sale_id, '(missing)'),
    coalesce(sale ->> 'vendor_id', '(missing)') || ' <> ' || coalesce(product ->> 'vendorId', '(missing)')
  from sales_with_product where sale ? 'vendor_id' and product is not null
    and sale ->> 'vendor_id' is distinct from product ->> 'vendorId'
  union all
  select 'SALE_VENDOR_NOT_FOUND', coalesce(sale_id, '(missing)'), coalesce(effective_vendor_id, '(missing)')
  from sales_with_product where not exists (select 1 from vendors where vendor ->> 'id' = effective_vendor_id)
  union all
  select 'SALE_SNAPSHOT_PARTIAL', coalesce(sale ->> 'sale_id', sale ->> 'id', '(missing)'), 'Sale code snapshot must contain all three code fields or none'
  from sales where num_nonnulls(sale ->> 'vendor_code_id', sale ->> 'vendor_code', sale ->> 'vendor_code_kind') not in (0, 3)
  union all
  select 'SALE_VENDOR_CODE_NOT_FOUND', coalesce(sale_id, '(missing)'), sale ->> 'vendor_code_id'
  from sales_with_product where sale ? 'vendor_code_id' and not exists (select 1 from effective_codes ec
    where ec.vendor_id = effective_vendor_id and ec.code ->> 'id' = sale ->> 'vendor_code_id')
  union all
  select 'SALE_SNAPSHOT_KIND_INVALID', coalesce(sale ->> 'sale_id', sale ->> 'id', '(missing)'), coalesce(sale ->> 'vendor_code_kind', '(missing)')
  from sales where sale ? 'vendor_code_kind'
    and coalesce(nullif(btrim(sale ->> 'vendor_code_kind'), ''), '')
      not in ('footwear_accessory', 'apparel', 'chrome_hearts')
  union all
  select 'SETTLEMENT_VENDOR_NOT_FOUND', coalesce(settlement ->> 'id', '(missing)'), coalesce(settlement ->> 'vendorId', '(missing)')
  from settlements where not exists (select 1 from vendors where vendor ->> 'id' = settlement ->> 'vendorId')
  union all
  select 'SETTLEMENT_SALE_IDS_INVALID', coalesce(settlement ->> 'id', '(missing)'), 'saleIds must be an array'
  from settlements where jsonb_typeof(settlement -> 'saleIds') is distinct from 'array'
    or case when jsonb_typeof(settlement -> 'saleIds') = 'array'
      then jsonb_array_length(settlement -> 'saleIds') = 0 else false end
  union all
  select 'SETTLEMENT_SALE_NOT_FOUND', coalesce(settlement ->> 'id', '(missing)'), coalesce(sale_id, '(missing)')
  from settlement_sales where sale_id is not null and matched_sale_id is null
  union all
  select 'SETTLEMENT_SALE_VENDOR_MISMATCH', coalesce(settlement ->> 'id', '(missing)'), sale_id
  from settlement_sales where sale_id is not null and matched_sale_id is not null
    and effective_vendor_id is distinct from settlement ->> 'vendorId'
)
select issue_type status, record_id, detail from issues
union all
select 'PASS', 'kc_pos_state/main', '0 issues; migration 013 prerequisites satisfied'
where not exists (select 1 from issues)
order by status, record_id;

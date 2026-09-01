begin;

-- One consignor relationship can have at most one Supabase Auth login. The
-- migration stops rather than silently changing existing member bindings.
do $$
begin
  if exists (
    select member.vendor_id
    from public.kc_app_members as member
    where member.role = 'vendor'
      and member.vendor_id is not null
    group by member.vendor_id
    having count(*) > 1
  ) then
    raise exception using
      errcode = '23505',
      message = 'Duplicate vendor account bindings must be resolved before migration';
  end if;
end
$$;

create unique index if not exists kc_app_members_one_account_per_vendor
  on public.kc_app_members (vendor_id)
  where role = 'vendor' and vendor_id is not null;

create or replace function public.kc_admin_return_inventory_item(
  p_inventory_id text,
  p_expected_updated_at timestamptz
)
returns table (
  payload jsonb,
  updated_at timestamptz,
  returned_inventory_id text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inventory_id text;
  v_payload jsonb;
  v_current_updated_at timestamptz;
  v_product jsonb;
  v_products jsonb;
  v_next_payload jsonb;
  v_returned_at timestamptz;
  v_updated_at timestamptz;
begin
  if not private.kc_is_admin() then
    raise exception using errcode = '42501', message = 'KICKS CENTER active admin access required';
  end if;

  v_inventory_id := btrim(coalesce(p_inventory_id, ''));
  if v_inventory_id = '' then
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
  from jsonb_array_elements(v_payload -> 'products') as product
  where product ->> 'inventory_id' = v_inventory_id
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
    where sale ->> 'inventory_id' = v_inventory_id
       or sale ->> 'productId' = v_inventory_id
  ) then
    raise exception using errcode = '23503', message = 'INVENTORY_HAS_FINANCIAL_HISTORY';
  end if;

  v_returned_at := clock_timestamp();
  select jsonb_agg(
    case
      when product ->> 'inventory_id' = v_inventory_id then
        jsonb_set(
          jsonb_set(product, '{status}', to_jsonb('已取回'::text)),
          '{history}',
          coalesce(product -> 'history', '[]'::jsonb) || jsonb_build_array(
            jsonb_build_object(
              'at', v_returned_at,
              'action', '商品取回',
              'note', '寄賣人取回商品'
            )
          )
        )
      else product
    end
    order by ordinal
  )
  into v_products
  from jsonb_array_elements(v_payload -> 'products') with ordinality as item(product, ordinal);

  v_next_payload := jsonb_set(v_payload, '{products}', v_products, false);
  perform private.kc_assert_pos_financial_integrity(v_next_payload);
  perform private.kc_assert_stage1_core(v_next_payload);
  perform set_config(
    'kc.action_summary',
    '確認商品取回'
      || ' | inventory_id=' || v_inventory_id
      || ' | 貨號=' || coalesce(v_product ->> 'scan_code', v_product ->> 'code', ''),
    true
  );

  update public.kc_pos_state
  set payload = v_next_payload,
      updated_at = clock_timestamp()
  where id = 'main'
  returning kc_pos_state.updated_at into v_updated_at;

  if v_updated_at is null then
    raise exception using errcode = 'P0002', message = 'POS_STATE_NOT_FOUND';
  end if;

  return query select v_next_payload, v_updated_at, v_inventory_id;
end
$$;

revoke all on function public.kc_admin_return_inventory_item(text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.kc_admin_return_inventory_item(text, timestamptz)
  to authenticated;

notify pgrst, 'reload schema';

commit;

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
    group by regexp_replace(upper(btrim(product ->> 'code')), '[[:space:]]+', '', 'g')
    having regexp_replace(upper(btrim(product ->> 'code')), '[[:space:]]+', '', 'g') = ''
       or count(*) > 1
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

revoke all on function private.kc_assert_pos_financial_integrity(jsonb) from public, anon, authenticated;

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

  perform private.kc_assert_pos_financial_integrity(p_payload);

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

revoke all on function public.kc_staff_save_pos_state(jsonb, timestamptz, text) from public, anon;
grant execute on function public.kc_staff_save_pos_state(jsonb, timestamptz, text) to authenticated;

select private.kc_assert_pos_financial_integrity(payload)
from public.kc_pos_state
where id = 'main';

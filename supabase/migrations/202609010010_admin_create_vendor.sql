begin;

create or replace function public.kc_admin_create_vendor(
  p_vendor jsonb,
  p_expected_updated_at timestamptz
)
returns table (
  payload jsonb,
  updated_at timestamptz,
  vendor_id text
)
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
  v_vendor_joined_text text;
  v_vendor_joined date;
  v_vendor jsonb;
  v_next_vendors jsonb;
  v_next_payload jsonb;
begin
  if not private.kc_is_admin() then
    raise exception using
      errcode = '42501',
      message = 'KICKS CENTER active admin access required';
  end if;

  if p_expected_updated_at is null then
    raise exception using errcode = '40001', message = 'POS data changed in another session; reload required';
  end if;

  if p_vendor is null or jsonb_typeof(p_vendor) <> 'object' then
    raise exception using errcode = '22023', message = 'VENDOR_PAYLOAD_INVALID';
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

  if jsonb_typeof(v_payload -> 'vendors') <> 'array' then
    raise exception using errcode = '23514', message = 'VENDORS_STATE_INVALID';
  end if;

  -- Vendor codes preserve internal whitespace, hyphens, zero padding, and all
  -- other formatting. Only outer whitespace and letter case are normalized.
  v_vendor_code := upper(btrim(coalesce(p_vendor ->> 'code', '')));
  if v_vendor_code = '' then
    raise exception using errcode = '22023', message = 'VENDOR_CODE_REQUIRED';
  end if;

  v_vendor_name := btrim(coalesce(p_vendor ->> 'name', ''));
  if v_vendor_name = '' then
    raise exception using errcode = '22023', message = 'VENDOR_NAME_REQUIRED';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(v_payload -> 'vendors') as existing_vendor
    where upper(btrim(coalesce(existing_vendor ->> 'code', ''))) = v_vendor_code
  ) then
    raise exception using errcode = '23505', message = 'VENDOR_CODE_EXISTS';
  end if;

  v_vendor_phone := btrim(coalesce(p_vendor ->> 'phone', ''));
  v_vendor_joined_text := btrim(coalesce(p_vendor ->> 'joined', ''));
  if v_vendor_joined_text = '' then
    v_vendor_joined := current_date;
  else
    begin
      v_vendor_joined := v_vendor_joined_text::date;
    exception when invalid_datetime_format or datetime_field_overflow then
      raise exception using errcode = '22007', message = 'VENDOR_JOINED_INVALID';
    end;
  end if;

  -- The database owns the internal relationship ID. Looping makes the
  -- uniqueness guarantee explicit even though UUID collisions are negligible.
  loop
    v_vendor_id := gen_random_uuid()::text;
    exit when not exists (
      select 1
      from jsonb_array_elements(v_payload -> 'vendors') as existing_vendor
      where existing_vendor ->> 'id' = v_vendor_id
    );
  end loop;

  v_vendor := jsonb_build_object(
    'id', v_vendor_id,
    'code', v_vendor_code,
    'name', v_vendor_name,
    'phone', v_vendor_phone,
    'joined', to_char(v_vendor_joined, 'YYYY-MM-DD')
  );
  v_next_vendors := (v_payload -> 'vendors') || jsonb_build_array(v_vendor);

  if jsonb_array_length(v_next_vendors)
     <> jsonb_array_length(v_payload -> 'vendors') + 1 then
    raise exception using errcode = '23514', message = 'CREATE_VENDOR_COUNT_MISMATCH';
  end if;

  -- Preserve products, sales, settlements, and every unrelated payload key.
  v_next_payload := jsonb_set(v_payload, '{vendors}', v_next_vendors, false);
  perform private.kc_assert_pos_financial_integrity(v_next_payload);
  perform private.kc_assert_stage1_core(v_next_payload);

  perform set_config(
    'kc.action_summary',
    '新增寄賣廠商'
      || ' | 廠商編號=' || v_vendor_code
      || ' | 名稱=' || v_vendor_name,
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

  return query select v_next_payload, v_updated_at, v_vendor_id;
end
$$;

revoke all on function public.kc_admin_create_vendor(jsonb, timestamptz)
  from public, anon, authenticated;
grant execute on function public.kc_admin_create_vendor(jsonb, timestamptz)
  to authenticated;

commit;

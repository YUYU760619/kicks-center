begin;

alter function public.kc_staff_save_pos_state(jsonb, timestamptz, text) set schema private;
alter function public.kc_admin_restore_pos_state(bigint, text) set schema private;
alter function public.kc_vendor_portal_snapshot() set schema private;

create or replace function public.kc_staff_save_pos_state(
  p_payload jsonb,
  p_expected_updated_at timestamptz,
  p_action_summary text default 'POS 主資料更新'
)
returns table (updated_at timestamptz)
language sql
security invoker
set search_path = ''
as $$
  select *
  from private.kc_staff_save_pos_state(
    p_payload,
    p_expected_updated_at,
    p_action_summary
  )
$$;

create or replace function public.kc_admin_restore_pos_state(
  p_backup_id bigint,
  p_reason text
)
returns table (updated_at timestamptz)
language sql
security invoker
set search_path = ''
as $$
  select *
  from private.kc_admin_restore_pos_state(p_backup_id, p_reason)
$$;

create or replace function public.kc_vendor_portal_snapshot()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select private.kc_vendor_portal_snapshot()
$$;

revoke all on function public.kc_staff_save_pos_state(jsonb, timestamptz, text) from public, anon;
revoke all on function public.kc_admin_restore_pos_state(bigint, text) from public, anon;
revoke all on function public.kc_vendor_portal_snapshot() from public, anon;
grant execute on function public.kc_staff_save_pos_state(jsonb, timestamptz, text) to authenticated;
grant execute on function public.kc_admin_restore_pos_state(bigint, text) to authenticated;
grant execute on function public.kc_vendor_portal_snapshot() to authenticated;

commit;

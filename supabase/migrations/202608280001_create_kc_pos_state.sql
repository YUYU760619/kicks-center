create table if not exists public.kc_pos_state (
  id text primary key,
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.kc_pos_state enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'kc_pos_state'
      and policyname = 'kc_pos_state_authenticated_read'
  ) then
    create policy "kc_pos_state_authenticated_read"
    on public.kc_pos_state for select to authenticated using (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'kc_pos_state'
      and policyname = 'kc_pos_state_authenticated_insert'
  ) then
    create policy "kc_pos_state_authenticated_insert"
    on public.kc_pos_state for insert to authenticated
    with check (id = 'main');
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'kc_pos_state'
      and policyname = 'kc_pos_state_authenticated_update'
  ) then
    create policy "kc_pos_state_authenticated_update"
    on public.kc_pos_state for update to authenticated
    using (id = 'main') with check (id = 'main');
  end if;
end
$$;

grant select, insert, update on table public.kc_pos_state to authenticated;

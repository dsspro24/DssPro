create table if not exists public.storage_migration_state (
  migration_key text primary key,
  completed_at timestamptz not null default now()
);

alter table public.storage_migration_state enable row level security;
revoke all on public.storage_migration_state from public, anon, authenticated;
grant all on public.storage_migration_state to service_role;
create table if not exists public.organization_data (
  organization_id uuid primary key references public.organizations (id) on delete cascade,
  data jsonb not null,
  updated_by uuid not null references auth.users (id) on delete restrict default auth.uid(),
  updated_at timestamptz not null default now()
);

alter table public.organization_data enable row level security;

create policy "Managers can read organization workspace data"
  on public.organization_data for select to authenticated
  using (public.is_organization_member(organization_id, array['manager']));

create policy "Managers can create organization workspace data"
  on public.organization_data for insert to authenticated
  with check (
    updated_by = (select auth.uid())
    and public.is_organization_member(organization_id, array['manager'])
  );

create policy "Managers can update organization workspace data"
  on public.organization_data for update to authenticated
  using (public.is_organization_member(organization_id, array['manager']))
  with check (
    updated_by = (select auth.uid())
    and public.is_organization_member(organization_id, array['manager'])
  );
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) > 0),
  company_code text,
  created_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default now()
);

create unique index if not exists organizations_company_code_unique
  on public.organizations (company_code)
  where company_code is not null and company_code <> '';

create table if not exists public.organization_memberships (
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('manager', 'dss_specialist', 'employee')),
  created_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);

create index if not exists organization_memberships_user_id_idx
  on public.organization_memberships (user_id);

create or replace function public.is_organization_member(
  target_organization_id uuid,
  allowed_roles text[] default array['manager', 'dss_specialist', 'employee']
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.organization_memberships as membership
    where membership.organization_id = target_organization_id
      and membership.user_id = (select auth.uid())
      and membership.role = any (allowed_roles)
  );
$$;

revoke all on function public.is_organization_member(uuid, text[]) from public, anon;
grant execute on function public.is_organization_member(uuid, text[]) to authenticated;

create or replace function public.create_organization(
  organization_name text,
  organization_code text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_organization_id uuid;
  normalized_name text := btrim(coalesce(organization_name, ''));
  normalized_code text := nullif(btrim(coalesce(organization_code, '')), '');
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if normalized_name = '' then
    raise exception 'Organization name is required';
  end if;

  insert into public.organizations (name, company_code, created_by)
  values (normalized_name, normalized_code, auth.uid())
  returning id into new_organization_id;

  insert into public.organization_memberships (organization_id, user_id, role)
  values (new_organization_id, auth.uid(), 'manager');

  return new_organization_id;
end;
$$;

revoke all on function public.create_organization(text, text) from public, anon;
grant execute on function public.create_organization(text, text) to authenticated;

alter table public.profiles enable row level security;
alter table public.organizations enable row level security;
alter table public.organization_memberships enable row level security;

create policy "Users can read their own profile"
  on public.profiles for select to authenticated
  using (id = (select auth.uid()));

create policy "Users can update their own profile"
  on public.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

create policy "Organization members can read their organizations"
  on public.organizations for select to authenticated
  using (public.is_organization_member(id));

create policy "Users can read their memberships"
  on public.organization_memberships for select to authenticated
  using (
    user_id = (select auth.uid())
    or public.is_organization_member(organization_id, array['manager'])
  );

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name)
  values (
    new.id,
    coalesce(nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''), '')
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
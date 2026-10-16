create table if not exists public.subscription_plans (
  code text primary key,
  name text not null,
  amount_cents integer not null check (amount_cents >= 0),
  currency text not null default 'EUR',
  billing_interval text not null default 'month' check (billing_interval in ('month', 'year')),
  employee_limit integer,
  features jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.subscription_plans (code, name, amount_cents, currency, features)
values
  ('standard', 'Standartinis', 2900, 'EUR', '{"documents": true, "reports": true}'::jsonb),
  ('pro', 'Pro', 7900, 'EUR', '{"documents": true, "reports": true, "protocols": true}'::jsonb)
on conflict (code) do update
  set name = excluded.name, amount_cents = excluded.amount_cents,
      currency = excluded.currency, features = excluded.features, updated_at = now();

create table if not exists public.organization_employees (
  employee_id text primary key,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  auth_user_id uuid unique references auth.users (id) on delete set null,
  full_name text not null,
  email text not null,
  contract_number text not null default '',
  position text not null default 'Darbuotojas',
  status text not null default 'Pakviestas',
  invited_at timestamptz,
  archived_at timestamptz,
  medical_certificate_valid_until date,
  sizes jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists organization_employees_org_status_idx on public.organization_employees (organization_id, status);
create index if not exists organization_employees_email_idx on public.organization_employees (organization_id, lower(email));

create table if not exists public.organization_documents (
  document_id text primary key,
  organization_id uuid references public.organizations (id) on delete cascade,
  document_type text not null default 'Dokumentas',
  title text not null,
  category text not null default '',
  version integer not null default 1 check (version > 0),
  active boolean not null default true,
  storage_path text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists organization_documents_type_idx on public.organization_documents (organization_id, document_type, active);

create table if not exists public.organization_resource_access (
  organization_id uuid not null references public.organizations (id) on delete cascade,
  document_id text not null references public.organization_documents (document_id) on delete cascade,
  settings jsonb not null default '{}'::jsonb,
  added_by uuid references auth.users (id) on delete set null,
  added_at timestamptz not null default now(),
  primary key (organization_id, document_id)
);

create table if not exists public.employee_document_assignments (
  organization_id uuid not null references public.organizations (id) on delete cascade,
  employee_id text not null references public.organization_employees (employee_id) on delete cascade,
  document_id text not null references public.organization_documents (document_id) on delete restrict,
  required_signers jsonb not null default '[]'::jsonb,
  assigned_by uuid references auth.users (id) on delete set null,
  assigned_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  primary key (organization_id, employee_id, document_id)
);

create index if not exists employee_document_assignments_document_idx on public.employee_document_assignments (organization_id, document_id);

create table if not exists public.employee_test_attempts (
  attempt_id text primary key,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  employee_id text not null references public.organization_employees (employee_id) on delete cascade,
  document_id text not null references public.organization_documents (document_id) on delete restrict,
  score integer not null check (score between 0 and 100),
  passed boolean not null,
  completed_at timestamptz not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists employee_test_attempts_employee_idx on public.employee_test_attempts (organization_id, employee_id, completed_at desc);

create table if not exists public.protocol_batches (
  batch_id text primary key,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  document_id text not null references public.organization_documents (document_id) on delete restrict,
  cadence text not null default '',
  period_start date,
  period_end date,
  protocol_date date,
  batch_number integer not null default 1,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists protocol_batches_period_idx on public.protocol_batches (organization_id, period_start desc, batch_number);

create table if not exists public.protocol_batch_employees (
  organization_id uuid not null references public.organizations (id) on delete cascade,
  batch_id text not null references public.protocol_batches (batch_id) on delete cascade,
  employee_id text not null references public.organization_employees (employee_id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (batch_id, employee_id)
);

create table if not exists public.document_signatures (
  signature_id text primary key,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  employee_id text not null references public.organization_employees (employee_id) on delete restrict,
  document_id text not null references public.organization_documents (document_id) on delete restrict,
  signer_user_id uuid references auth.users (id) on delete set null,
  signer_name text not null,
  signer_role text not null check (signer_role in ('Darbuotojas', 'Vadovas', 'DSS specialistas', 'Komisijos narys')),
  signature_method text not null default 'PIN' check (signature_method = 'PIN'),
  signed_at timestamptz not null,
  valid_until timestamptz,
  ip_address text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists document_signatures_employee_time_idx on public.document_signatures (organization_id, employee_id, signed_at desc);
create index if not exists document_signatures_document_time_idx on public.document_signatures (organization_id, document_id, signed_at desc);

create table if not exists public.organization_commission_signers (
  organization_id uuid not null references public.organizations (id) on delete cascade,
  signer_name text not null,
  pin_hash text not null,
  failed_attempts integer not null default 0 check (failed_attempts >= 0),
  locked_until timestamptz,
  active boolean not null default true,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (organization_id, signer_name)
);

create table if not exists public.organization_subscriptions (
  subscription_id text primary key,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  plan_code text references public.subscription_plans (code) on delete set null,
  plan_name text not null,
  status text not null default 'pending' check (status in ('pending', 'trialing', 'active', 'past_due', 'canceled', 'expired', 'incomplete')),
  amount_cents integer not null default 0 check (amount_cents >= 0),
  currency text not null default 'EUR',
  starts_at timestamptz,
  ends_at timestamptz,
  provider text,
  provider_customer_id text,
  provider_subscription_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists organization_subscriptions_org_status_idx on public.organization_subscriptions (organization_id, status, ends_at);
create unique index if not exists organization_subscriptions_provider_id_unique on public.organization_subscriptions (provider, provider_subscription_id) where provider_subscription_id is not null;

create table if not exists public.billing_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  subscription_id text references public.organization_subscriptions (subscription_id) on delete set null,
  provider text not null,
  provider_event_id text not null,
  event_type text not null,
  amount_cents integer check (amount_cents is null or amount_cents >= 0),
  currency text not null default 'EUR',
  occurred_at timestamptz,
  payload jsonb not null default '{}'::jsonb,
  received_at timestamptz not null default now(),
  unique (provider, provider_event_id)
);

create table if not exists public.organization_assets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  document_id text references public.organization_documents (document_id) on delete set null,
  uploaded_by uuid references auth.users (id) on delete set null,
  bucket_id text not null default 'organization-assets',
  storage_path text not null unique,
  file_name text not null,
  mime_type text not null,
  size_bytes bigint not null check (size_bytes >= 0),
  checksum_sha256 text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.audit_events (
  id uuid primary key default gen_random_uuid(),
  event_key text not null unique,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  actor_user_id uuid references auth.users (id) on delete set null,
  action text not null,
  target_type text not null,
  target_id text not null,
  details jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now()
);

create index if not exists audit_events_org_time_idx on public.audit_events (organization_id, occurred_at desc);

create table if not exists public.export_jobs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  requested_by uuid not null references auth.users (id) on delete restrict,
  export_format text not null check (export_format in ('pdf', 'zip')),
  status text not null default 'queued' check (status in ('queued', 'processing', 'completed', 'failed', 'expired')),
  filters jsonb not null default '{}'::jsonb,
  bucket_id text not null default 'organization-exports',
  storage_path text,
  error_message text,
  requested_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  expires_at timestamptz
);

create index if not exists export_jobs_org_time_idx on public.export_jobs (organization_id, requested_at desc);

alter table public.subscription_plans enable row level security;
alter table public.organization_employees enable row level security;
alter table public.organization_documents enable row level security;
alter table public.organization_resource_access enable row level security;
alter table public.employee_document_assignments enable row level security;
alter table public.employee_test_attempts enable row level security;
alter table public.protocol_batches enable row level security;
alter table public.protocol_batch_employees enable row level security;
alter table public.document_signatures enable row level security;
alter table public.organization_commission_signers enable row level security;
alter table public.organization_subscriptions enable row level security;
alter table public.billing_events enable row level security;
alter table public.organization_assets enable row level security;
alter table public.audit_events enable row level security;
alter table public.export_jobs enable row level security;

revoke all on public.subscription_plans, public.organization_employees, public.organization_documents,
  public.organization_resource_access, public.employee_document_assignments, public.employee_test_attempts,
  public.protocol_batches, public.protocol_batch_employees, public.document_signatures,
  public.organization_commission_signers, public.organization_subscriptions, public.billing_events,
  public.organization_assets, public.audit_events, public.export_jobs from anon, authenticated;

grant select on public.subscription_plans, public.organization_employees, public.organization_documents,
  public.organization_resource_access, public.employee_document_assignments, public.employee_test_attempts,
  public.protocol_batches, public.protocol_batch_employees, public.document_signatures,
  public.organization_subscriptions, public.billing_events, public.organization_assets,
  public.audit_events, public.export_jobs to authenticated;

create policy "Authenticated users can read active subscription plans"
  on public.subscription_plans for select to authenticated using (active);

create policy "Tenant members can read employees"
  on public.organization_employees for select to authenticated
  using (
    public.is_creator()
    or public.is_organization_member(organization_id, array['manager', 'dss_specialist'])
    or exists (
      select 1 from public.organization_memberships as membership
      where membership.organization_id = organization_employees.organization_id
        and membership.employee_id = organization_employees.employee_id
        and membership.user_id = (select auth.uid()) and membership.role = 'employee'
    )
  );

create policy "Tenant members can read documents"
  on public.organization_documents for select to authenticated
  using (
    organization_id is null
    or public.is_creator()
    or public.is_organization_member(organization_id, array['manager', 'dss_specialist'])
    or exists (
      select 1 from public.employee_document_assignments as assignment
      join public.organization_memberships as membership
        on membership.organization_id = assignment.organization_id
       and membership.employee_id = assignment.employee_id
      where assignment.organization_id = organization_documents.organization_id
        and assignment.document_id = organization_documents.document_id
        and membership.user_id = (select auth.uid()) and membership.role = 'employee'
    )
  );

create policy "Tenant members can read resource access"
  on public.organization_resource_access for select to authenticated
  using (public.is_creator() or public.is_organization_member(organization_id, array['manager', 'dss_specialist']));

create policy "Tenant members can read assignments"
  on public.employee_document_assignments for select to authenticated
  using (
    public.is_creator()
    or public.is_organization_member(organization_id, array['manager', 'dss_specialist'])
    or exists (
      select 1 from public.organization_memberships as membership
      where membership.organization_id = employee_document_assignments.organization_id
        and membership.employee_id = employee_document_assignments.employee_id
        and membership.user_id = (select auth.uid()) and membership.role = 'employee'
    )
  );

create policy "Tenant members can read test attempts"
  on public.employee_test_attempts for select to authenticated
  using (
    public.is_creator()
    or public.is_organization_member(organization_id, array['manager', 'dss_specialist'])
    or exists (
      select 1 from public.organization_memberships as membership
      where membership.organization_id = employee_test_attempts.organization_id
        and membership.employee_id = employee_test_attempts.employee_id
        and membership.user_id = (select auth.uid()) and membership.role = 'employee'
    )
  );

create policy "Tenant members can read protocol batches"
  on public.protocol_batches for select to authenticated
  using (
    public.is_creator()
    or public.is_organization_member(organization_id, array['manager', 'dss_specialist'])
    or exists (
      select 1 from public.protocol_batch_employees as participant
      join public.organization_memberships as membership
        on membership.organization_id = participant.organization_id
       and membership.employee_id = participant.employee_id
      where participant.organization_id = protocol_batches.organization_id
        and participant.batch_id = protocol_batches.batch_id
        and membership.user_id = (select auth.uid()) and membership.role = 'employee'
    )
  );

create policy "Tenant members can read protocol participants"
  on public.protocol_batch_employees for select to authenticated
  using (
    public.is_creator()
    or public.is_organization_member(organization_id, array['manager', 'dss_specialist'])
    or exists (
      select 1 from public.organization_memberships as membership
      where membership.organization_id = protocol_batch_employees.organization_id
        and membership.employee_id = protocol_batch_employees.employee_id
        and membership.user_id = (select auth.uid()) and membership.role = 'employee'
    )
  );

create policy "Tenant members can read signatures"
  on public.document_signatures for select to authenticated
  using (
    public.is_creator()
    or public.is_organization_member(organization_id, array['manager', 'dss_specialist'])
    or exists (
      select 1 from public.organization_memberships as membership
      where membership.organization_id = document_signatures.organization_id
        and membership.employee_id = document_signatures.employee_id
        and membership.user_id = (select auth.uid()) and membership.role = 'employee'
    )
  );

create policy "Managers can read subscriptions"
  on public.organization_subscriptions for select to authenticated
  using (public.is_creator() or public.is_organization_member(organization_id, array['manager']));

create policy "Managers can read billing events"
  on public.billing_events for select to authenticated
  using (public.is_creator() or public.is_organization_member(organization_id, array['manager']));

create policy "Tenant members can read asset metadata"
  on public.organization_assets for select to authenticated
  using (public.is_creator() or public.is_organization_member(organization_id, array['manager', 'dss_specialist']));

create policy "Managers can read audit events"
  on public.audit_events for select to authenticated
  using (public.is_creator() or public.is_organization_member(organization_id, array['manager']));

create policy "Requesters and managers can read export jobs"
  on public.export_jobs for select to authenticated
  using (requested_by = (select auth.uid()) or public.is_creator() or public.is_organization_member(organization_id, array['manager']));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('organization-assets', 'organization-assets', false, 25000000, array['application/pdf', 'image/jpeg', 'image/png', 'text/html', 'text/plain']),
  ('organization-exports', 'organization-exports', false, 100000000, array['application/pdf', 'application/zip', 'application/json'])
on conflict (id) do update
  set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create policy "Tenant members can read organization assets"
  on storage.objects for select to authenticated
  using (bucket_id = 'organization-assets' and public.is_organization_member((storage.foldername(name))[1]::uuid, array['manager', 'dss_specialist']));

create policy "Managers can upload organization assets"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'organization-assets' and public.is_organization_member((storage.foldername(name))[1]::uuid, array['manager']));

create policy "Managers can update organization assets"
  on storage.objects for update to authenticated
  using (bucket_id = 'organization-assets' and public.is_organization_member((storage.foldername(name))[1]::uuid, array['manager']))
  with check (bucket_id = 'organization-assets' and public.is_organization_member((storage.foldername(name))[1]::uuid, array['manager']));

create policy "Managers can delete organization assets"
  on storage.objects for delete to authenticated
  using (bucket_id = 'organization-assets' and public.is_organization_member((storage.foldername(name))[1]::uuid, array['manager']));

create policy "Export owners can download exports"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'organization-exports'
    and exists (
      select 1 from public.export_jobs as job
      where job.storage_path = name and job.bucket_id = storage.objects.bucket_id and job.status = 'completed'
        and (job.requested_by = (select auth.uid()) or public.is_creator()
          or public.is_organization_member(job.organization_id, array['manager']))
    )
  );
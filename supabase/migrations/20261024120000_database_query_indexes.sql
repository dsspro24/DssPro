create index if not exists dss_specialist_invitations_org_status_created_idx
  on public.dss_specialist_invitations (organization_id, status, created_at);

create index if not exists dss_organization_requests_org_status_created_idx
  on public.dss_organization_requests (organization_id, status, created_at);

create index if not exists organization_commission_assignments_org_status_invited_idx
  on public.organization_commission_assignments (organization_id, status, invited_at desc);

create index if not exists protocol_commission_signatures_org_batch_time_idx
  on public.protocol_commission_signatures (organization_id, batch_id, signed_at);

create index if not exists organization_assets_org_created_idx
  on public.organization_assets (organization_id, created_at desc);

create index if not exists billing_events_org_received_idx
  on public.billing_events (organization_id, received_at desc);

create index if not exists export_jobs_requester_time_idx
  on public.export_jobs (requested_by, requested_at desc);

create index if not exists export_jobs_completed_storage_path_idx
  on public.export_jobs (storage_path, bucket_id)
  where status = 'completed' and storage_path is not null;

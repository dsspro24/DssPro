create extension if not exists pg_cron;

create or replace function public.purge_expired_privacy_consent_records()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.privacy_consent_records
  where recorded_at < pg_catalog.now() - interval '2 years';
end;
$$;

revoke all on function public.purge_expired_privacy_consent_records() from public, anon, authenticated;

do $$
declare
  existing_job_id bigint;
begin
  select jobid into existing_job_id
  from cron.job
  where jobname = 'privacy-consent-retention';

  if existing_job_id is not null then
    perform cron.unschedule(existing_job_id);
  end if;

  perform cron.schedule(
    'privacy-consent-retention',
    '17 * * * *',
    'select public.purge_expired_privacy_consent_records()'
  );
end;
$$;

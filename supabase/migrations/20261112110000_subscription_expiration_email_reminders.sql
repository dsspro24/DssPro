alter table public.workspace_subscriptions
  add column if not exists expiration_reminder_claimed_at timestamptz,
  add column if not exists expiration_reminder_sent_at timestamptz;

create or replace function public.reset_subscription_expiration_reminder_on_period_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.ends_at is distinct from old.ends_at then
    new.expiration_reminder_claimed_at := null;
    new.expiration_reminder_sent_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists reset_subscription_expiration_reminder_on_period_change
  on public.workspace_subscriptions;
create trigger reset_subscription_expiration_reminder_on_period_change
before update of ends_at on public.workspace_subscriptions
for each row
execute function public.reset_subscription_expiration_reminder_on_period_change();

create or replace function public.claim_subscription_expiration_reminders()
returns table (
  subscription_id uuid,
  organization_id uuid,
  organization_name text,
  ends_at timestamptz,
  manager_name text,
  manager_email text
)
language sql
security definer
set search_path = ''
as $$
  with due_subscriptions as (
    select subscription.id
    from public.workspace_subscriptions as subscription
    where subscription.status = 'active'
      and (
        subscription.payment_status = 'paid'
        or subscription.preinvoice_data ->> 'initialTrialAccess' = 'true'
      )
      and subscription.ends_at >= now() + interval '72 hours'
      and subscription.ends_at < now() + interval '73 hours'
      and subscription.expiration_reminder_sent_at is null
      and (
        subscription.expiration_reminder_claimed_at is null
        or subscription.expiration_reminder_claimed_at < now() - interval '30 minutes'
      )
    order by subscription.ends_at
    for update skip locked
  ),
  claimed_subscriptions as (
    update public.workspace_subscriptions as subscription
    set expiration_reminder_claimed_at = now()
    from due_subscriptions as due
    where subscription.id = due.id
    returning subscription.id, subscription.organization_id, subscription.ends_at
  )
  select
    subscription.id,
    organization.id,
    organization.name,
    subscription.ends_at,
    coalesce(nullif(profile.full_name, ''), split_part(manager.email, '@', 1)),
    manager.email
  from claimed_subscriptions as subscription
  join public.organizations as organization
    on organization.id = subscription.organization_id
  join public.organization_memberships as membership
    on membership.organization_id = organization.id
    and membership.role = 'manager'
  join auth.users as manager
    on manager.id = membership.user_id
  left join public.profiles as profile
    on profile.id = manager.id
  where nullif(manager.email, '') is not null;
$$;

create or replace function public.finish_subscription_expiration_reminder(
  input_subscription_id uuid,
  input_sent boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Service role required';
  end if;

  update public.workspace_subscriptions
  set expiration_reminder_sent_at = case when input_sent then now() else null end,
      expiration_reminder_claimed_at = null
  where id = input_subscription_id;
end;
$$;

revoke all on function public.claim_subscription_expiration_reminders() from public, anon, authenticated;
revoke all on function public.finish_subscription_expiration_reminder(uuid, boolean) from public, anon, authenticated;
grant execute on function public.claim_subscription_expiration_reminders() to service_role;
grant execute on function public.finish_subscription_expiration_reminder(uuid, boolean) to service_role;

create extension if not exists pg_net;

do $$
declare
  cron_secret text;
  existing_job_id bigint;
begin
  select decrypted_secret into cron_secret
  from vault.decrypted_secrets
  where name = 'subscription_expiration_reminder_cron_secret';

  if nullif(cron_secret, '') is null then
    raise exception 'Create the subscription_expiration_reminder_cron_secret in Supabase Vault before applying this migration';
  end if;

  select jobid into existing_job_id
  from cron.job
  where jobname = 'subscription-expiration-email-reminder';

  if existing_job_id is not null then
    perform cron.unschedule(existing_job_id);
  end if;

  perform cron.schedule(
    'subscription-expiration-email-reminder',
    '0 * * * *',
    $job$
      select net.http_post(
        url := 'https://wickbchyltkpmudopnwc.supabase.co/functions/v1/subscription-expiration-reminder',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || (
            select decrypted_secret
            from vault.decrypted_secrets
            where name = 'subscription_expiration_reminder_cron_secret'
          )
        ),
        body := '{}'::jsonb
      );
    $job$
  );
end;
$$;

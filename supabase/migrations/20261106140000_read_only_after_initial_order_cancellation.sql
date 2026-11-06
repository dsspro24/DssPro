create or replace function public.has_workspace_read_access(target_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select target_organization_id is null
    or public.is_creator()
    or exists (
      select 1
      from (
        select subscription.status, subscription.ends_at, subscription.payment_status,
          subscription.preinvoice_data
        from public.workspace_subscriptions as subscription
        where subscription.organization_id = target_organization_id
          and not (
            subscription.order_code is not null
            and coalesce(subscription.payment_status, '') <> 'paid'
            and subscription.preinvoice_data ->> 'initialTrialAccess' is distinct from 'true'
            and subscription.preinvoice_data ->> 'planChange' is distinct from 'true'
          )
          and not (
            subscription.preinvoice_data ->> 'initialTrialAccess' = 'true'
            and subscription.payment_status <> 'paid'
            and not (
              (
                subscription.status = 'active'
                and subscription.ends_at > now()
              )
              or (
                subscription.status = 'canceled'
                and subscription.ends_at + interval '2 months' > now()
              )
            )
          )
          and not (
            subscription.preinvoice_data ->> 'renewal' = 'true'
            and subscription.payment_status = 'pending'
          )
          and not (
            subscription.preinvoice_data ->> 'planChange' = 'true'
            and subscription.payment_status = 'pending'
            and (subscription.preinvoice_data ->> 'dueDate')::timestamptz < now()
          )
        order by subscription.created_at desc
        limit 1
      ) as latest_subscription
      where (
          latest_subscription.status = 'active'
          and latest_subscription.ends_at is null
        )
        or (
          latest_subscription.status = 'active'
          and latest_subscription.ends_at > now()
          and latest_subscription.preinvoice_data ->> 'initialTrialAccess' = 'true'
          and latest_subscription.payment_status = 'pending'
        )
        or (
          latest_subscription.status in ('active', 'canceled', 'expired')
          and latest_subscription.ends_at + interval '2 months' > now()
          and not (
            latest_subscription.preinvoice_data ->> 'initialTrialAccess' = 'true'
            and latest_subscription.payment_status <> 'paid'
            and latest_subscription.status <> 'canceled'
          )
        )
    );
$$;

revoke all on function public.has_workspace_read_access(uuid) from public, anon;
grant execute on function public.has_workspace_read_access(uuid) to authenticated;

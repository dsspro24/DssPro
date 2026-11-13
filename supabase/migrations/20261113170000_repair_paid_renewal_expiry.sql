with latest_paid_subscription as (
  select distinct on (organization_id)
    id,
    organization_id
  from public.workspace_subscriptions
  where payment_status = 'paid'
    and status <> 'canceled'
  order by organization_id, created_at desc, id desc
),
repairable_renewal as (
  select
    subscription.id,
    (subscription.preinvoice_data ->> 'serviceStart')::timestamptz as service_start,
    (subscription.preinvoice_data ->> 'serviceEnd')::timestamptz as service_end
  from public.workspace_subscriptions as subscription
  join latest_paid_subscription as latest
    on latest.id = subscription.id
  where subscription.payment_status = 'paid'
    and subscription.status in ('active', 'expired')
    and subscription.preinvoice_data ->> 'renewal' = 'true'
    and (subscription.preinvoice_data ->> 'serviceStart')::timestamptz > subscription.ordered_at
    and (subscription.preinvoice_data ->> 'serviceEnd')::timestamptz > now()
    and (
      subscription.ends_at is null
      or subscription.ends_at < (subscription.preinvoice_data ->> 'serviceEnd')::timestamptz
    )
)
update public.workspace_subscriptions as subscription
set status = 'active',
    starts_at = repairable_renewal.service_start,
    ends_at = repairable_renewal.service_end,
    final_invoice_data = jsonb_set(
      jsonb_set(
        coalesce(subscription.final_invoice_data, '{}'::jsonb),
        '{serviceStart}',
        to_jsonb(repairable_renewal.service_start),
        true
      ),
      '{serviceEnd}',
      to_jsonb(repairable_renewal.service_end),
      true
    ),
    updated_at = now()
from repairable_renewal
where subscription.id = repairable_renewal.id;

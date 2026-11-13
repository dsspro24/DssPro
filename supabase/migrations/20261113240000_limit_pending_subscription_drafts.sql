drop index if exists public.workspace_subscriptions_one_pending_idx;

create unique index workspace_subscriptions_one_pending_idx
  on public.workspace_subscriptions (organization_id)
  where status = 'pending' and order_code is null;

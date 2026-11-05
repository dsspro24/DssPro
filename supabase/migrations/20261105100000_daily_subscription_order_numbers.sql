create table public.workspace_subscription_daily_order_counters (
  order_date date primary key,
  last_value integer not null check (last_value > 0)
);

revoke all on public.workspace_subscription_daily_order_counters from public, anon, authenticated;

create unique index if not exists workspace_subscriptions_order_code_global_unique_idx
  on public.workspace_subscriptions (order_code)
  where order_code is not null;

insert into public.workspace_subscription_daily_order_counters (order_date, last_value)
select (ordered_at at time zone 'UTC')::date,
       max(substring(order_code from 10)::integer)
from public.workspace_subscriptions
where order_code ~ '^DSS[0-9]{7,}$'
  and ordered_at is not null
  and substring(order_code from 4 for 6) = to_char((ordered_at at time zone 'UTC')::date, 'YYMMDD')
group by (ordered_at at time zone 'UTC')::date
on conflict (order_date) do update
  set last_value = greatest(
    public.workspace_subscription_daily_order_counters.last_value,
    excluded.last_value
  );

create or replace function public.assign_daily_workspace_subscription_order_number()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order_date date;
  daily_number integer;
begin
  if new.order_code is null or new.order_code !~ '^DSS[0-9]{7,}$' then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.order_code is not distinct from old.order_code then
    return new;
  end if;

  v_order_date := coalesce(
    (new.ordered_at at time zone 'UTC')::date,
    (new.created_at at time zone 'UTC')::date,
    (now() at time zone 'UTC')::date
  );

  insert into public.workspace_subscription_daily_order_counters (order_date, last_value)
  values (v_order_date, 1)
  on conflict (order_date) do update
    set last_value = public.workspace_subscription_daily_order_counters.last_value + 1
  returning last_value into daily_number;

  new.order_code := 'DSS' || to_char(v_order_date, 'YYMMDD') || daily_number::text;
  if new.preinvoice_data is not null then
    new.preinvoice_data := jsonb_set(
      jsonb_set(new.preinvoice_data, '{invoiceNumber}', to_jsonb(new.order_code), true),
      '{orderCode}',
      to_jsonb(new.order_code),
      true
    );
  end if;

  return new;
end;
$$;

revoke all on function public.assign_daily_workspace_subscription_order_number() from public, anon, authenticated;

drop trigger if exists assign_daily_workspace_subscription_order_number on public.workspace_subscriptions;
create trigger assign_daily_workspace_subscription_order_number
  before insert or update of order_code on public.workspace_subscriptions
  for each row execute function public.assign_daily_workspace_subscription_order_number();

create index if not exists workspace_subscriptions_final_invoice_issue_date_idx
  on public.workspace_subscriptions ((final_invoice_data ->> 'issueDate'))
  where final_invoice_data is not null and final_invoice_data ? 'issueDate';

create table public.workspace_subscription_invoice_year_totals (
  invoice_year integer primary key,
  invoice_count bigint not null check (invoice_count > 0),
  total_amount_cents bigint not null
);

revoke all on public.workspace_subscription_invoice_year_totals from public, anon, authenticated;

insert into public.workspace_subscription_invoice_year_totals (invoice_year, invoice_count, total_amount_cents)
select substring(subscription.final_invoice_data ->> 'issueDate' from 1 for 4)::integer,
       count(*)::bigint,
       coalesce(sum(
         case
           when subscription.final_invoice_data ->> 'totalAmountCents' ~ '^[0-9]+$'
             then (subscription.final_invoice_data ->> 'totalAmountCents')::numeric
           else 0
         end
       ), 0)::bigint
from public.workspace_subscriptions as subscription
where subscription.final_invoice_data is not null
  and coalesce(subscription.final_invoice_data ->> 'issueDate', '') ~ '^\d{4}-\d{2}-\d{2}'
group by substring(subscription.final_invoice_data ->> 'issueDate' from 1 for 4)::integer;

create or replace function public.update_workspace_subscription_invoice_year_totals()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  old_year integer;
  old_amount bigint;
  new_year integer;
  new_amount bigint;
begin
  if tg_op = 'UPDATE' and old.final_invoice_data is not distinct from new.final_invoice_data then
    return new;
  end if;

  if tg_op <> 'INSERT'
    and old.final_invoice_data is not null
    and coalesce(old.final_invoice_data ->> 'issueDate', '') ~ '^\d{4}-\d{2}-\d{2}' then
    old_year := substring(old.final_invoice_data ->> 'issueDate' from 1 for 4)::integer;
    old_amount := case
      when old.final_invoice_data ->> 'totalAmountCents' ~ '^[0-9]+$'
        then (old.final_invoice_data ->> 'totalAmountCents')::bigint
      else 0
    end;
    update public.workspace_subscription_invoice_year_totals
    set invoice_count = invoice_count - 1,
        total_amount_cents = total_amount_cents - old_amount
    where invoice_year = old_year;
    delete from public.workspace_subscription_invoice_year_totals
    where invoice_year = old_year and invoice_count <= 0;
  end if;

  if tg_op <> 'DELETE'
    and new.final_invoice_data is not null
    and coalesce(new.final_invoice_data ->> 'issueDate', '') ~ '^\d{4}-\d{2}-\d{2}' then
    new_year := substring(new.final_invoice_data ->> 'issueDate' from 1 for 4)::integer;
    new_amount := case
      when new.final_invoice_data ->> 'totalAmountCents' ~ '^[0-9]+$'
        then (new.final_invoice_data ->> 'totalAmountCents')::bigint
      else 0
    end;
    insert into public.workspace_subscription_invoice_year_totals (invoice_year, invoice_count, total_amount_cents)
    values (new_year, 1, new_amount)
    on conflict (invoice_year) do update
      set invoice_count = public.workspace_subscription_invoice_year_totals.invoice_count + 1,
          total_amount_cents = public.workspace_subscription_invoice_year_totals.total_amount_cents + excluded.total_amount_cents;
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create trigger maintain_workspace_subscription_invoice_year_totals
  after insert or update of final_invoice_data or delete on public.workspace_subscriptions
  for each row execute function public.update_workspace_subscription_invoice_year_totals();

create or replace function public.creator_subscription_invoice_years()
returns table (invoice_year integer, invoice_count bigint, total_amount_cents bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_creator() then
    raise exception 'Creator access required';
  end if;

  return query
  select totals.invoice_year, totals.invoice_count, totals.total_amount_cents
  from public.workspace_subscription_invoice_year_totals as totals
  order by totals.invoice_year desc;
end;
$$;

revoke all on function public.update_workspace_subscription_invoice_year_totals() from public, anon, authenticated;
revoke all on function public.creator_subscription_invoice_years() from public, anon;
grant execute on function public.creator_subscription_invoice_years() to authenticated;

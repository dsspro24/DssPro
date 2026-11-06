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
    where invoice_year = old_year and invoice_count > 1;

    if not found then
      delete from public.workspace_subscription_invoice_year_totals
      where invoice_year = old_year and invoice_count = 1;
    end if;
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

drop policy if exists "Delegated DSS managers can insert organization workspace" on public.organization_data;
create policy "Delegated DSS managers can insert organization workspace"
  on public.organization_data for insert to authenticated
  with check (
    updated_by = (select auth.uid())
    and exists (
      select 1 from public.organization_memberships as membership
      where membership.organization_id = organization_data.organization_id
        and membership.user_id = (select auth.uid())
        and membership.role = 'dss_specialist'
        and membership.can_manage_workspace
    )
  );

do $$
declare
  function_definition text;
  permission_function regprocedure;
  manager_only_check text := 'public.is_organization_member(input_organization_id, array[''manager''])';
  delegated_check text := 'public.can_manage_organization(input_organization_id)';
begin
  select pg_get_functiondef(
    'public.save_organization_employee(uuid, text, text, jsonb, jsonb, jsonb)'::regprocedure
  ) into function_definition;

  if position(manager_only_check in function_definition) = 0 then
    raise exception 'Could not locate save_organization_employee permission check';
  end if;

  execute replace(function_definition, manager_only_check, delegated_check);

  foreach permission_function in array array[
    'public.get_commission_signer_status(uuid)'::regprocedure,
    'public.set_commission_signer_pin(uuid, text, text)'::regprocedure,
    'public.record_commission_signature(uuid, text, text, text, text)'::regprocedure,
    'public.request_data_export(uuid, text, jsonb)'::regprocedure
  ] loop
    select pg_get_functiondef(permission_function) into function_definition;

    if position(manager_only_check in function_definition) = 0 then
      raise exception 'Could not locate management permission check in %', permission_function;
    end if;

    execute replace(function_definition, manager_only_check, delegated_check);
  end loop;
end;
$$;

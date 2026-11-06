do $$
declare
  routine record;
  routine_definition text;
  updated_count integer := 0;
begin
  for routine in
    select p.oid
    from pg_proc as p
    join pg_namespace as n on n.oid = p.pronamespace
    where n.nspname in ('public', 'private')
      and position('\.png$' in p.prosrc) > 0
  loop
    routine_definition := pg_get_functiondef(routine.oid);
    routine_definition := replace(routine_definition, '\.png$', '\.(png|svg)$');
    execute routine_definition;
    updated_count := updated_count + 1;
  end loop;

  if updated_count = 0 then
    raise exception 'No PNG-only signature path validations were found to update';
  end if;
end;
$$;

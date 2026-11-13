create extension if not exists pgtap with schema extensions;

begin;

do $$
declare
  creator_id uuid;
begin
  select id into creator_id
  from auth.users
  where lower(btrim(email)) = 'dsspro24@gmail.com'
  limit 1;

  if creator_id is null then
    creator_id := gen_random_uuid();
    insert into auth.users (id, aud, role, email, raw_user_meta_data)
    values (creator_id, 'authenticated', 'authenticated', 'dsspro24@gmail.com', '{}'::jsonb);
  end if;

  perform set_config('test.creator_resource_defaults_creator_id', creator_id::text, true);
end;
$$;

insert into public.profiles (id, full_name, account_type)
values (current_setting('test.creator_resource_defaults_creator_id')::uuid, 'DSS Pro Creator', 'creator')
on conflict (id) do update set account_type = excluded.account_type;

insert into public.organizations (id, name, created_by)
values (
  '93000000-0000-4000-8000-000000000010',
  'Default Test Company',
  current_setting('test.creator_resource_defaults_creator_id')::uuid
);

insert into public.organization_data (organization_id, data, updated_by)
values (
  '93000000-0000-4000-8000-000000000010',
  '{"organizations":[{"id":"93000000-0000-4000-8000-000000000010","resources":["keep-template"]}],"resources":[]}'::jsonb,
  current_setting('test.creator_resource_defaults_creator_id')::uuid
);

insert into public.creator_workspace_data (id, data, updated_by)
values (
  true,
  '{"resources":[{"id":"default-template","title":"Default template","type":"Žurnalas"}],"resourceTypes":["Žurnalas"]}'::jsonb,
  current_setting('test.creator_resource_defaults_creator_id')::uuid
)
on conflict (id) do update
  set data = excluded.data, updated_by = excluded.updated_by;

select plan(5);
select set_config(
  'request.jwt.claim.sub',
  current_setting('test.creator_resource_defaults_creator_id'),
  true
);

select is(
  public.set_creator_resource_default('default-template', true),
  true,
  'creator can enable a company default'
);
select ok(
  (select data #> '{organizations,0,resources}' ? 'default-template'
   from public.organization_data
   where organization_id = '93000000-0000-4000-8000-000000000010'),
  'enabling the default adds the resource to existing organizations'
);
select ok(
  (select data #> '{resources,0}' @> '{"defaultForOrganizations":true}'::jsonb
   from public.creator_workspace_data where id = true),
  'enabling the default is saved in the shared catalog'
);
select is(
  public.set_creator_resource_default('default-template', false),
  true,
  'creator can disable a company default'
);
select ok(
  (select not (data #> '{organizations,0,resources}' ? 'default-template')
       and (data #> '{organizations,0,resources}' ? 'keep-template')
   from public.organization_data
   where organization_id = '93000000-0000-4000-8000-000000000010'),
  'disabling the default removes only that resource assignment'
);

select * from finish();
rollback;

create extension if not exists pgtap with schema extensions;

begin;

insert into auth.users (id, aud, role, email)
values ('93000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'dsspro24@gmail.com');

insert into public.profiles (id, full_name, account_type)
values ('93000000-0000-4000-8000-000000000001', 'DSS Pro Creator', 'creator')
on conflict (id) do update set account_type = excluded.account_type;

insert into public.organizations (id, name, created_by)
values ('93000000-0000-4000-8000-000000000010', 'Default Test Company', '93000000-0000-4000-8000-000000000001');

insert into public.organization_data (organization_id, data, updated_by)
values (
  '93000000-0000-4000-8000-000000000010',
  '{"organizations":[{"id":"93000000-0000-4000-8000-000000000010","resources":["keep-template"]}],"resources":[]}'::jsonb,
  '93000000-0000-4000-8000-000000000001'
);

insert into public.creator_workspace_data (id, data, updated_by)
values (
  true,
  '{"resources":[{"id":"default-template","title":"Default template","type":"Žurnalas"}],"resourceTypes":["Žurnalas"]}'::jsonb,
  '93000000-0000-4000-8000-000000000001'
)
on conflict (id) do update
  set data = excluded.data, updated_by = excluded.updated_by;

select plan(5);
select set_config('request.jwt.claim.sub', '93000000-0000-4000-8000-000000000001', true);

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

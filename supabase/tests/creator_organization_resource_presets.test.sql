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

  perform set_config('test.creator_resource_presets_creator_id', creator_id::text, true);
end;
$$;

insert into public.creator_workspace_data (id, data, updated_by)
values (
  true,
  '{"resources":[{"id":"keep-template"}],"resourceTypes":["Žurnalas"]}'::jsonb,
  current_setting('test.creator_resource_presets_creator_id')::uuid
)
on conflict (id) do update
  set data = excluded.data, updated_by = excluded.updated_by;

select plan(3);
select set_config(
  'request.jwt.claim.sub',
  current_setting('test.creator_resource_presets_creator_id'),
  true
);

select lives_ok(
  $$select public.save_creator_resource_presets('[{"id":"basic","label":"Bazinis","resourceIds":["keep-template"]}]'::jsonb)$$,
  'creator can save organization resource presets'
);
select is(
  (select data -> 'organizationResourcePresets' from public.creator_workspace_data where id = true),
  '[{"id":"basic","label":"Bazinis","resourceIds":["keep-template"]}]'::jsonb,
  'saved presets are stored in the shared catalog'
);
select is(
  (select data -> 'resources' from public.creator_workspace_data where id = true),
  '[{"id":"keep-template"}]'::jsonb,
  'saving presets preserves the shared resource catalog'
);

select * from finish();
rollback;

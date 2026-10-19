insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('dsspro-assets', 'dsspro-assets', true, 10485760, array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'text/html']),
  ('signature-assets', 'signature-assets', false, 1048576, array['image/png'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Creators can upload shared DSS Pro assets" on storage.objects;
create policy "Creators can upload shared DSS Pro assets"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'dsspro-assets' and name like 'shared/%' and public.is_creator());

drop policy if exists "Creators can update shared DSS Pro assets" on storage.objects;
create policy "Creators can update shared DSS Pro assets"
  on storage.objects for update to authenticated
  using (bucket_id = 'dsspro-assets' and name like 'shared/%' and public.is_creator())
  with check (bucket_id = 'dsspro-assets' and name like 'shared/%' and public.is_creator());

drop policy if exists "Creators can delete shared DSS Pro assets" on storage.objects;
create policy "Creators can delete shared DSS Pro assets"
  on storage.objects for delete to authenticated
  using (bucket_id = 'dsspro-assets' and name like 'shared/%' and public.is_creator());

drop policy if exists "Organization members can read signature assets" on storage.objects;
create policy "Organization members can read signature assets"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'signature-assets'
    and public.is_organization_member((storage.foldername(name))[1]::uuid, array['manager', 'dss_specialist', 'employee'])
  );

drop policy if exists "Organization members can upload signature assets" on storage.objects;
create policy "Organization members can upload signature assets"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'signature-assets'
    and public.is_organization_member((storage.foldername(name))[1]::uuid, array['manager', 'dss_specialist', 'employee'])
  );

drop policy if exists "Organization members can delete signature assets" on storage.objects;
create policy "Organization members can delete signature assets"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'signature-assets'
    and public.is_organization_member((storage.foldername(name))[1]::uuid, array['manager', 'dss_specialist', 'employee'])
  );
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('signature-assets', 'signature-assets', false, 10240, array['image/png', 'image/svg+xml'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

do $$
declare
  signature_function record;
  function_definition text;
begin
  for signature_function in
    select proc.oid
    from pg_proc as proc
    join pg_namespace as nsp on nsp.oid = proc.pronamespace
    where nsp.nspname in ('public', 'private')
      and proc.prokind = 'f'
      and position('\.png$' in pg_get_functiondef(proc.oid)) > 0
  loop
    function_definition := pg_get_functiondef(signature_function.oid);
    -- Keep all existing signature RPCs compatible with new SVGs and stored PNGs.
    execute replace(function_definition, '\.png$', '\.(png|svg)$');
  end loop;
end;
$$;

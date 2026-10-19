import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Origin': '*',
};

const response = (status: number, body: Record<string, unknown>) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, 'Content-Type': 'application/json' },
});

async function listStorageFiles(client: ReturnType<typeof createClient>, bucket: string, folder: string): Promise<string[]> {
  const files: string[] = [];
  let offset = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await client.storage.from(bucket).list(folder, { limit: pageSize, offset });
    if (error) throw error;
    if (!data?.length) break;

    for (const item of data) {
      const path = `${folder}/${item.name}`;
      if (item.id === null) files.push(...await listStorageFiles(client, bucket, path));
      else files.push(path);
    }

    if (data.length < pageSize) break;
    offset += data.length;
  }

  return files;
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return response(405, { error: 'Method not allowed' });

  const authorization = request.headers.get('Authorization');
  if (!authorization) return response(401, { error: 'Authenticated request required' });

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SECRET_KEY');
  if (!supabaseUrl || !anonKey || !serviceKey) return response(500, { error: 'Supabase function environment is incomplete' });

  const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authorization } } });
  const adminClient = createClient(supabaseUrl, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: { user }, error: userError } = await userClient.auth.getUser();
  if (userError || !user) return response(401, { error: 'Session is invalid or expired' });

  const { data: isCreator, error: creatorError } = await userClient.rpc('is_creator');
  if (creatorError || !isCreator) return response(403, { error: 'Creator access required' });

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return response(400, { error: 'Invalid request body' });
  }

  const organizationId = String(body.organizationId ?? '');
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(organizationId)) {
    return response(400, { error: 'Organization id is invalid' });
  }

  const { data: deletedOrganization, error: deleteError } = await userClient.rpc('creator_delete_organization', {
    input_organization_id: organizationId,
  });
  if (deleteError) return response(500, { error: deleteError.message });
  if (!deletedOrganization) return response(404, { error: 'Organization was not found' });

  const files = [
    ...(Array.isArray(deletedOrganization.assetFiles) ? deletedOrganization.assetFiles : []),
    ...(Array.isArray(deletedOrganization.exportFiles) ? deletedOrganization.exportFiles : []),
  ].filter((file: Record<string, unknown>) => ['organization-assets', 'organization-exports'].includes(String(file.bucket))
    && typeof file.path === 'string' && file.path.length > 0);

  try {
    files.push(...(await listStorageFiles(adminClient, 'organization-assets', organizationId))
      .map((path) => ({ bucket: 'organization-assets', path })));
    const uniqueFiles = [...new Map(files.map((file: Record<string, string>) => [`${file.bucket}:${file.path}`, file])).values()];
    for (const bucket of ['organization-assets', 'organization-exports']) {
      const paths = uniqueFiles.filter((file: Record<string, string>) => file.bucket === bucket).map((file: Record<string, string>) => file.path);
      for (let index = 0; index < paths.length; index += 100) {
        const { error } = await adminClient.storage.from(bucket).remove(paths.slice(index, index + 100));
        if (error) throw error;
      }
    }
  } catch (error) {
    return response(200, {
      deleted: true,
      organizationName: deletedOrganization.organizationName,
      storageCleanupComplete: false,
      warning: `Company data was deleted, but stored files could not all be removed: ${error instanceof Error ? error.message : 'Storage cleanup failed'}`,
    });
  }

  return response(200, {
    deleted: true,
    organizationName: deletedOrganization.organizationName,
    storageCleanupComplete: true,
  });
});
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

  const targetUserId = String(body.userId ?? '');
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(targetUserId)) {
    return response(400, { error: 'User id is invalid' });
  }
  if (targetUserId === user.id) return response(400, { error: 'You cannot delete your own account' });

  const { data: targetProfile, error: profileError } = await adminClient
    .from('profiles')
    .select('id, full_name, account_type')
    .eq('id', targetUserId)
    .maybeSingle();
  if (profileError) return response(500, { error: profileError.message });
  if (!targetProfile) return response(404, { error: 'Account was not found' });
  if (!['manager', 'dss_specialist'].includes(targetProfile.account_type)) {
    return response(400, { error: 'Only manager and DSS specialist accounts can be deleted here' });
  }

  const { data: ownedOrganizations, error: organizationsError } = await adminClient
    .from('organizations')
    .select('id')
    .eq('created_by', targetUserId);
  if (organizationsError) return response(500, { error: organizationsError.message });

  let listedFiles: { bucket: string; path: string }[] = [];
  try {
    for (const organization of ownedOrganizations ?? []) {
      for (const bucket of ['organization-assets', 'organization-exports', 'signature-assets']) {
        listedFiles.push(...(await listStorageFiles(adminClient, bucket, organization.id))
          .map((path) => ({ bucket, path })));
      }
    }
  } catch (error) {
    return response(500, {
      error: `Could not enumerate company files; no account data was deleted: ${error instanceof Error ? error.message : 'Storage listing failed'}`,
    });
  }

  const { data: deletedAccount, error: deleteError } = await userClient.rpc('creator_delete_account', {
    input_user_id: targetUserId,
  });
  if (deleteError) return response(500, { error: deleteError.message });
  if (!deletedAccount) return response(404, { error: 'Account was not found' });

  const { error: authDeleteError } = await adminClient.auth.admin.deleteUser(targetUserId);
  if (authDeleteError) {
    return response(500, {
      error: `Company data and access were removed, but the Supabase account could not be deleted: ${authDeleteError.message}`,
      accountDeleted: false,
      dataDeleted: true,
    });
  }

  const files = [
    ...(Array.isArray(deletedAccount.storageFiles) ? deletedAccount.storageFiles : []),
    ...listedFiles,
  ].filter((file: Record<string, unknown>) => ['organization-assets', 'organization-exports', 'signature-assets'].includes(String(file.bucket))
    && typeof file.path === 'string' && file.path.length > 0);

  try {
    const uniqueFiles = [...new Map(files.map((file: Record<string, string>) => [`${file.bucket}:${file.path}`, file])).values()];
    for (const bucket of ['organization-assets', 'organization-exports', 'signature-assets']) {
      const paths = uniqueFiles.filter((file: Record<string, string>) => file.bucket === bucket).map((file) => file.path);
      for (let index = 0; index < paths.length; index += 100) {
        const { error } = await adminClient.storage.from(bucket).remove(paths.slice(index, index + 100));
        if (error) throw error;
      }
    }
  } catch (error) {
    return response(200, {
      deleted: true,
      fullName: deletedAccount.fullName ?? targetProfile.full_name,
      email: deletedAccount.email,
      ownedOrganizations: deletedAccount.ownedOrganizations ?? [],
      storageCleanupComplete: false,
      warning: `Account and database data were deleted, but some stored files could not be removed: ${error instanceof Error ? error.message : 'Storage cleanup failed'}`,
    });
  }

  return response(200, {
    deleted: true,
    fullName: deletedAccount.fullName ?? targetProfile.full_name,
    email: deletedAccount.email,
    ownedOrganizations: deletedAccount.ownedOrganizations ?? [],
    storageCleanupComplete: true,
  });
});

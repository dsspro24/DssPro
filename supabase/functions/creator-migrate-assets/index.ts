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

const asBase64Bytes = (dataUrl: string) => {
  const match = /^data:([^;,]+);base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!match) throw new Error('Unsupported Base64 asset format');
  const binary = atob(match[2]);
  return { contentType: match[1], bytes: Uint8Array.from(binary, (character) => character.charCodeAt(0)) };
};

const hashBytes = async (bytes: Uint8Array) => {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, '0')).join('');
};

async function uploadAsset(client: ReturnType<typeof createClient>, path: string, bytes: Uint8Array, contentType: string) {
  const { error } = await client.storage.from('dsspro-assets').upload(path, bytes, {
    contentType,
    cacheControl: '31536000',
    upsert: true,
  });
  if (error) throw error;
  return client.storage.from('dsspro-assets').getPublicUrl(path).data.publicUrl;
}

async function migrateSignatureImages(
  client: ReturnType<typeof createClient>,
  organizationId: string | null,
  signatures: unknown[],
  counters: { signatures: number },
) {
  if (!organizationId) return { signatures, changed: false };
  let changed = false;
  const migrated = [];

  for (const rawSignature of signatures) {
    if (!rawSignature || typeof rawSignature !== 'object') {
      migrated.push(rawSignature);
      continue;
    }
    const signature = { ...(rawSignature as Record<string, unknown>) };
    const dataUrl = typeof signature.signatureImage === 'string' ? signature.signatureImage : '';
    if (dataUrl.startsWith('data:image/png;base64,')) {
      const { contentType, bytes } = asBase64Bytes(dataUrl);
      const signatureId = String(signature.id ?? crypto.randomUUID());
      const safeFileId = signatureId.replace(/[^a-zA-Z0-9_-]/g, '_');
      const path = `${organizationId}/${safeFileId}.png`;
      await client.storage.from('signature-assets').upload(path, bytes, {
        contentType,
        cacheControl: '31536000',
        upsert: true,
      }).then(({ error }) => { if (error) throw error; });
      signature.signaturePath = path;
      delete signature.signatureImage;
      changed = true;
      counters.signatures += 1;

      const { data: normalizedSignature, error: readError } = await client
        .from('document_signatures')
        .select('metadata')
        .eq('signature_id', signatureId)
        .maybeSingle();
      if (readError) throw readError;
      if (normalizedSignature) {
        const metadata = { ...(normalizedSignature.metadata ?? {}), signaturePath: path };
        delete metadata.signatureImage;
        const { error: updateError } = await client.from('document_signatures')
          .update({ metadata })
          .eq('signature_id', signatureId);
        if (updateError) throw updateError;
      }
    } else if (dataUrl) {
      delete signature.signatureImage;
      changed = true;
    }
    migrated.push(signature);
  }

  return { signatures: migrated, changed };
}

async function migrateResourceAssets(client: ReturnType<typeof createClient>, resources: unknown[], counters: { images: number; documents: number }, urlCache: Map<string, string>) {
  let changed = false;
  const migrated = [];

  for (const rawResource of resources) {
    if (!rawResource || typeof rawResource !== 'object') {
      migrated.push(rawResource);
      continue;
    }

    const resource = { ...(rawResource as Record<string, unknown>) };
    const resourceId = String(resource.id ?? crypto.randomUUID()).replace(/[^a-zA-Z0-9_-]/g, '_');
    const imageValue = typeof resource.image === 'string' ? resource.image : '';
    const htmlValue = typeof resource.html === 'string' ? resource.html : '';

    if (imageValue.startsWith('data:image/')) {
      let publicUrl = urlCache.get(imageValue);
      if (!publicUrl) {
        const { contentType, bytes } = asBase64Bytes(imageValue);
        const hash = await hashBytes(bytes);
        const extension = contentType.split('/')[1]?.replace(/[^a-z0-9]/gi, '') || 'img';
        publicUrl = await uploadAsset(client, `shared/${resourceId}/image-${hash}.${extension}`, bytes, contentType);
        urlCache.set(imageValue, publicUrl);
        counters.images += 1;
      }
      resource.imageUrl = publicUrl;
      delete resource.image;
      changed = true;
    } else if (imageValue) {
      resource.imageUrl = resource.imageUrl ?? imageValue;
      delete resource.image;
      changed = true;
    } else if (resource.imageUrl) {
      delete resource.image;
    }

    if (htmlValue && !resource.htmlUrl) {
      const bytes = new TextEncoder().encode(htmlValue);
      const hash = await hashBytes(bytes);
      resource.htmlUrl = await uploadAsset(client, `shared/${resourceId}/document-${hash}.html`, bytes, 'text/html; charset=utf-8');
      counters.documents += 1;
      changed = true;
    }
    if ('html' in resource) {
      delete resource.html;
      changed = true;
    }
    migrated.push(resource);
  }

  return { resources: migrated, changed };
}

async function migrateWorkspace(client: ReturnType<typeof createClient>, organizationId: string | null, data: Record<string, unknown>, counters: { images: number; documents: number; signatures: number }, urlCache: Map<string, string>) {
  let changed = false;
  const nextData = { ...data };
  const resources = await migrateResourceAssets(client, Array.isArray(data.resources) ? data.resources : [], counters, urlCache);
  if (resources.changed) {
    nextData.resources = resources.resources;
    changed = true;
  }

  const signatures = await migrateSignatureImages(client, organizationId, Array.isArray(data.signatures) ? data.signatures : [], counters);
  if (signatures.changed) {
    nextData.signatures = signatures.signatures;
    changed = true;
  }

  if (Array.isArray(data.archivedEmployees)) {
    const archivedEmployees = [];
    for (const record of data.archivedEmployees) {
      if (!record || typeof record !== 'object') {
        archivedEmployees.push(record);
        continue;
      }
      const archived = { ...(record as Record<string, unknown>) };
      const archivedResources = await migrateResourceAssets(client, Array.isArray(archived.resources) ? archived.resources : [], counters, urlCache);
      if (archivedResources.changed) {
        archived.resources = archivedResources.resources;
        changed = true;
      }
      const archivedSignatures = await migrateSignatureImages(client, organizationId, Array.isArray(archived.signatures) ? archived.signatures : [], counters);
      if (archivedSignatures.changed) {
        archived.signatures = archivedSignatures.signatures;
        changed = true;
      }
      archivedEmployees.push(archived);
    }
    if (changed) nextData.archivedEmployees = archivedEmployees;
  }

  return { data: nextData, changed };
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
  if (creatorError) return response(403, { error: 'Could not verify workspace access' });

  let organizationIds: string[] = [];
  if (!isCreator) {
    const { data: memberships, error: membershipError } = await userClient
      .from('organization_memberships')
      .select('organization_id')
      .eq('user_id', user.id);
    if (membershipError) return response(403, { error: membershipError.message });
    organizationIds = [...new Set((memberships ?? []).map((membership) => membership.organization_id))];
    if (!organizationIds.length) organizationIds = ['00000000-0000-0000-0000-000000000001'];
  }
  const migrationKey = isCreator
    ? 'base64-assets-v1:all'
    : `base64-assets-v1:organizations:${[...organizationIds].sort().join(',')}`;
  const migrationKeys = isCreator ? [migrationKey] : ['base64-assets-v1:all', migrationKey];
  const { data: migrationState, error: migrationStateError } = await adminClient
    .from('storage_migration_state')
    .select('migration_key')
    .in('migration_key', migrationKeys);
  if (migrationStateError) return response(500, { error: migrationStateError.message });
  if (migrationState?.length) return response(200, { migrated: true, alreadyMigrated: true });

  const counters = { images: 0, documents: 0, signatures: 0, workspaces: 0 };
  const urlCache = new Map<string, string>();
  if (isCreator) {
    const { data: catalog, error: catalogError } = await adminClient
      .from('creator_workspace_data')
      .select('data, updated_by, updated_at')
      .eq('id', true)
      .maybeSingle();
    if (catalogError) return response(500, { error: catalogError.message });

    if (catalog?.data) {
      const result = await migrateWorkspace(adminClient, null, catalog.data, counters, urlCache);
      if (result.changed) {
        const { error } = await adminClient.from('creator_workspace_data').update({
          data: result.data,
          updated_by: catalog.updated_by,
          updated_at: new Date().toISOString(),
        }).eq('id', true).eq('updated_at', catalog.updated_at);
        if (error) return response(500, { error: `Could not update creator catalog: ${error.message}` });
      }
    }
  }

  const pageSize = 100;
  for (let offset = 0; ; offset += pageSize) {
    let workspaceQuery = adminClient
      .from('organization_data')
      .select('organization_id, data, updated_by, updated_at');
    if (!isCreator) workspaceQuery = workspaceQuery.in('organization_id', organizationIds);
    const { data: workspaces, error } = await workspaceQuery
      .order('organization_id')
      .range(offset, offset + pageSize - 1);
    if (error) return response(500, { error: error.message });
    if (!workspaces?.length) break;

    for (const workspace of workspaces) {
      const result = await migrateWorkspace(adminClient, workspace.organization_id, workspace.data ?? {}, counters, urlCache);
      if (!result.changed) continue;
      const { error: updateError } = await adminClient.from('organization_data').update({
        data: result.data,
        updated_by: workspace.updated_by,
        updated_at: new Date().toISOString(),
      }).eq('organization_id', workspace.organization_id).eq('updated_at', workspace.updated_at);
      if (updateError) return response(500, { error: `Could not update organization ${workspace.organization_id}: ${updateError.message}` });
      counters.workspaces += 1;
    }

    if (workspaces.length < pageSize) break;
  }

  const documentsPageSize = 100;
  for (let offset = 0; ; offset += documentsPageSize) {
    let documentQuery = adminClient
      .from('organization_documents')
      .select('document_id, payload, updated_at')
      .not('payload', 'is', null);
    if (!isCreator) {
      documentQuery = organizationIds.length
        ? documentQuery.or(`organization_id.is.null,organization_id.in.(${organizationIds.join(',')})`)
        : documentQuery.is('organization_id', null);
    }
    const { data: documents, error } = await documentQuery
      .order('document_id')
      .range(offset, offset + documentsPageSize - 1);
    if (error) return response(500, { error: error.message });
    if (!documents?.length) break;

    for (const document of documents) {
      const result = await migrateResourceAssets(adminClient, [document.payload], counters, urlCache);
      if (!result.changed) continue;
      const { error: updateError } = await adminClient.from('organization_documents').update({
        payload: result.resources[0],
        updated_at: new Date().toISOString(),
      }).eq('document_id', document.document_id).eq('updated_at', document.updated_at);
      if (updateError) return response(500, { error: `Could not update document ${document.document_id}: ${updateError.message}` });
    }

    if (documents.length < documentsPageSize) break;
  }

  const { error: stateError } = await adminClient.from('storage_migration_state').upsert({
    migration_key: migrationKey,
    completed_at: new Date().toISOString(),
  });
  if (stateError) return response(500, { error: `Assets migrated, but the migration marker could not be saved: ${stateError.message}` });

  return response(200, { migrated: true, ...counters });
});

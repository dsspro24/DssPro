import { supabase } from './supabase.js';

const signatureBucket = 'signature-assets';

export async function uploadCreatorAsset(file) {
  if (!supabase) throw new Error('Supabase nėra sukonfigūruotas.');
  const extension = file.name.split('.').at(-1)?.toLowerCase().replace(/[^a-z0-9]/g, '') || (file.type === 'text/html' ? 'html' : 'img');
  const path = `shared/${crypto.randomUUID()}.${extension}`;
  const { error } = await supabase.storage.from('dsspro-assets').upload(path, file, {
    contentType: file.type || (extension === 'html' ? 'text/html' : 'application/octet-stream'),
    cacheControl: '31536000',
    upsert: false,
  });
  if (error) throw error;
  return { path, publicUrl: supabase.storage.from('dsspro-assets').getPublicUrl(path).data.publicUrl };
}

export async function uploadSignatureDataUrl(organizationId, dataUrl) {
  if (!supabase) throw new Error('Supabase nėra sukonfigūruotas.');
  if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/png;base64,')) {
    throw new Error('Parašo vaizdo formatas neteisingas.');
  }
  const blob = await (await fetch(dataUrl)).blob();
  const path = `${organizationId}/${crypto.randomUUID()}.png`;
  const { error: uploadError } = await supabase.storage.from(signatureBucket).upload(path, blob, {
    contentType: 'image/png',
    cacheControl: '31536000',
    upsert: false,
  });
  if (uploadError) throw uploadError;
  return { path };
}

export async function removeSignatureAsset(path) {
  if (!supabase || !path) return;
  await supabase.storage.from(signatureBucket).remove([path]);
}

export async function hydrateSignatureImages(signatures) {
  if (!supabase || !Array.isArray(signatures)) return signatures ?? [];
  const signaturePaths = [...new Set(signatures.map((signature) => signature.signaturePath).filter(Boolean))];
  const signedUrls = new Map();

  for (let index = 0; index < signaturePaths.length; index += 100) {
    const paths = signaturePaths.slice(index, index + 100);
    const { data, error } = await supabase.storage.from(signatureBucket).createSignedUrls(paths, 60 * 60 * 24 * 7);
    if (error) throw error;
    for (const item of data ?? []) {
      if (item.path && item.signedUrl) signedUrls.set(item.path, item.signedUrl);
    }
  }

  return signatures.map((signature) => {
    const signedUrl = signedUrls.get(signature.signaturePath);
    return signedUrl ? { ...signature, signatureImage: signedUrl } : signature;
  });
}

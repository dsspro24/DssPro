import { env } from 'node:process';

const siteUrl = 'https://www.dsspro.lt';

function xmlEscape(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function validDate(value) {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10);
}

function sitemapUrl(location, lastModified) {
  const lastmod = lastModified ? `<lastmod>${xmlEscape(lastModified)}</lastmod>` : '';
  return `<url><loc>${xmlEscape(location)}</loc>${lastmod}</url>`;
}

export default async function handler(request, response) {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.setHeader('Allow', 'GET, HEAD');
    return response.status(405).send('Method not allowed');
  }

  const supabaseUrl = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
  const supabaseKey = env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseKey) {
    return response.status(503).send('Sitemap is temporarily unavailable.');
  }

  let baseUrl;
  try {
    baseUrl = new URL(supabaseUrl);
  } catch {
    return response.status(500).send('Sitemap configuration is invalid.');
  }
  if (baseUrl.protocol !== 'https:' && baseUrl.hostname !== 'localhost') {
    return response.status(500).send('Sitemap configuration must use HTTPS.');
  }

  try {
    const headers = { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` };
    const fetchPosts = async () => {
      const posts = [];
      for (let offset = 0; offset <= 49000; offset += 1000) {
        const pageHeaders = { ...headers, Range: `${offset}-${offset + 999}`, Prefer: 'count=exact' };
        const postsResponse = await fetch(new URL('/rest/v1/blog_posts?select=slug,updated_at,published_at&status=eq.published&order=published_at.desc', baseUrl), { headers: pageHeaders });
        if (!postsResponse.ok) {
          const details = await postsResponse.text();
          console.error(`Sitemap blog query failed (${postsResponse.status}): ${details}`);
          throw new Error('Sitemap blog query failed.');
        }
        const page = await postsResponse.json();
        if (!Array.isArray(page)) throw new Error('Sitemap blog query returned an invalid response shape.');
        posts.push(...page);
        if (posts.length > 49998) throw new Error('Sitemap exceeded the maximum supported number of URLs.');
        if (page.length < 1000) return posts;
      }
      throw new Error('Sitemap exceeded the maximum supported number of articles.');
    };
    const [posts, legalResponse] = await Promise.all([
      fetchPosts(),
      fetch(new URL('/rest/v1/site_legal_settings?select=terms_status,published_at,updated_at&id=eq.true', baseUrl), { headers }),
    ]);

    if (!legalResponse.ok) {
      const details = await legalResponse.text();
      console.error(`Sitemap legal settings query failed (${legalResponse.status}): ${details}`);
      return response.status(502).send('Sitemap content is temporarily unavailable.');
    }

    const legalSettings = await legalResponse.json();
    if (!Array.isArray(legalSettings)) {
      console.error('Sitemap query returned an invalid response shape.');
      return response.status(502).send('Sitemap content is temporarily unavailable.');
    }

    const urls = [
      sitemapUrl(`${siteUrl}/`),
      sitemapUrl(`${siteUrl}/privatumo-politika`),
      sitemapUrl(`${siteUrl}/tinklarastis`, validDate(posts[0]?.updated_at)),
      ...posts
        .filter((post) => typeof post.slug === 'string' && /^[a-z0-9]+(-[a-z0-9]+)*$/.test(post.slug))
        .map((post) => sitemapUrl(
          `${siteUrl}/tinklarastis/${encodeURIComponent(post.slug)}`,
          validDate(post.updated_at || post.published_at),
        )),
    ];

    const terms = legalSettings[0];
    if (terms?.terms_status === 'published') {
      urls.push(sitemapUrl(`${siteUrl}/naudojimo-salygos`, validDate(terms.updated_at || terms.published_at)));
    }

    const xml = `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.join('')}</urlset>`;
    response.setHeader('Content-Type', 'application/xml; charset=utf-8');
    response.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
    response.setHeader('X-Robots-Tag', 'noindex');
    if (request.method === 'HEAD') return response.status(200).end();
    return response.status(200).send(xml);
  } catch (error) {
    console.error('Sitemap generation failed:', error);
    return response.status(502).send('Sitemap content is temporarily unavailable.');
  }
}

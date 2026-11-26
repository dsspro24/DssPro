import assert from 'node:assert/strict';
import { env } from 'node:process';
import test from 'node:test';
import handler from './blog.js';

const shell = '<html><head><title>Home</title><script id="seo-structured-data" type="application/ld+json">{"@type":"FAQPage"}</script></head><body><div id="root"></div></body></html>';

function createResponse(json) {
  return {
    ok: true,
    headers: {
      get(name) { return name === 'content-range' ? `0-${json.length - 1}/${json.length}` : null; },
    },
    json: async () => json,
    text: async () => '',
  };
}

function createHttpResponse() {
  return {
    headers: {},
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    send(body) { this.body = body; return this; },
  };
}

async function renderBlogPage(request, article) {
  const originalFetch = globalThis.fetch;
  const originalUrl = env.SUPABASE_URL;
  const originalKey = env.SUPABASE_ANON_KEY;
  env.SUPABASE_URL = 'https://supabase.example';
  env.SUPABASE_ANON_KEY = 'test-key';
  globalThis.fetch = async (url) => {
    if (String(url) === 'https://www.dsspro.lt') return { ok: true, text: async () => shell };
    return createResponse(article ? [article] : []);
  };
  const response = createHttpResponse();

  try {
    await handler(request, response);
    return response;
  } finally {
    globalThis.fetch = originalFetch;
    if (originalUrl === undefined) delete env.SUPABASE_URL;
    else env.SUPABASE_URL = originalUrl;
    if (originalKey === undefined) delete env.SUPABASE_ANON_KEY;
    else env.SUPABASE_ANON_KEY = originalKey;
  }
}

test('blog article SSR includes visible article data and breadcrumbs in JSON-LD', async () => {
  const article = {
    id: 'post-id',
    title: 'Matomas straipsnio pavadinimas',
    slug: 'straipsnis',
    excerpt: 'Matoma straipsnio ištrauka.',
    category: 'Darbų sauga',
    content: 'Matomas straipsnio turinys.',
    seo_title: 'Paieškos pavadinimas',
    seo_description: 'Paieškos aprašymas.',
    status: 'published',
    published_at: '2025-02-01T10:00:00.000Z',
    updated_at: '2025-03-01T10:00:00.000Z',
  };
  const response = await renderBlogPage({
    method: 'GET',
    url: '/api/blog?slug=straipsnis',
    query: { slug: 'straipsnis' },
  }, article);

  assert.equal(response.statusCode, 200);
  assert.match(response.body, /name="description" content="Paieškos aprašymas\."/);
  assert.match(response.body, /Matoma straipsnio ištrauka\./);
  const match = response.body.match(/<script id="seo-structured-data" type="application\/ld\+json">([\s\S]*?)<\/script>/);
  assert.ok(match);
  const graph = JSON.parse(match[1])['@graph'];
  const schema = graph.find((item) => item['@type'] === 'BlogPosting');

  assert.equal(schema.description, article.excerpt);
  assert.equal(schema.datePublished, article.published_at);
  assert.equal('dateModified' in schema, false);
  assert.ok(graph.some((item) => item['@type'] === 'BreadcrumbList'));
  assert.doesNotMatch(match[1], /FAQPage/);
});

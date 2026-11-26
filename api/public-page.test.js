import assert from 'node:assert/strict';
import test from 'node:test';
import handler from './public-page.js';

test('public page route returns its structured data in the initial HTML head', async () => {
  const originalFetch = globalThis.fetch;
  const shell = '<html><head><title>Home</title><script id="seo-structured-data" type="application/ld+json">{"@type":"FAQPage"}</script></head><body><div id="root"></div></body></html>';
  globalThis.fetch = async () => ({
    ok: true,
    text: async () => shell,
  });

  const response = {
    headers: {},
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    send(body) { this.body = body; return this; },
  };

  try {
    await handler({
      method: 'GET',
      url: '/api/public-page?path=%2Fkontaktai',
      query: { path: '/kontaktai' },
    }, response);
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(response.statusCode, 200);
  assert.equal((response.body.match(/id="seo-structured-data"/g) ?? []).length, 1);
  assert.ok(response.body.indexOf('"@type":"ContactPage"') < response.body.indexOf('</head>'));
  assert.doesNotMatch(response.body, /FAQPage/);
  assert.equal(response.headers['Content-Type'], 'text/html; charset=utf-8');
});

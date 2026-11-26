import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  buildBreadcrumbList,
  buildSiteStructuredData,
  injectSeoMetadata,
  serializeJsonLd,
} from './seo.js';

test('homepage JSON-LD remains valid and exposes the organization contact details', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const match = html.match(/<script id="seo-structured-data" type="application\/ld\+json">([\s\S]*?)<\/script>/);
  assert.ok(match);

  const data = JSON.parse(match[1]);
  const organization = data['@graph'].find((item) => item['@type'] === 'Organization');
  assert.equal(organization.email, 'dsspro@inbox.lt');
  assert.equal(organization.contactPoint.email, organization.email);
  assert.ok(organization.sameAs.includes('https://www.facebook.com/dsspro.lt'));
});

test('JSON-LD omits empty properties and safely escapes script-breaking content', () => {
  const output = serializeJsonLd(buildSiteStructuredData({
    '@type': 'WebPage',
    name: '</script><script>alert("x")</script>',
    description: null,
    nested: { missing: undefined, present: 'yes' },
    items: [null, 'visible'],
  }));
  const parsed = JSON.parse(output);
  const page = parsed['@graph'].at(-1);

  assert.equal(page.name, '</script><script>alert("x")</script>');
  assert.equal('description' in page, false);
  assert.deepEqual(page.nested, { present: 'yes' });
  assert.deepEqual(page.items, ['visible']);
  assert.equal(output.includes('</script>'), false);
});

test('breadcrumbs have ordered, one-based list positions', () => {
  assert.deepEqual(buildBreadcrumbList([
    { name: 'Pradžia', url: 'https://www.dsspro.lt/' },
    { name: 'Tinklaraštis', url: 'https://www.dsspro.lt/tinklarastis' },
  ]), {
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Pradžia', item: 'https://www.dsspro.lt/' },
      { '@type': 'ListItem', position: 2, name: 'Tinklaraštis', item: 'https://www.dsspro.lt/tinklarastis' },
    ],
  });
});

test('SEO metadata replaces homepage metadata and its schema for an inner page', () => {
  const shell = '<html><head><title>Home</title><meta name="description" content="Home"><link rel="canonical" href="https://www.dsspro.lt/"><script id="seo-structured-data" type="application/ld+json">{"@type":"FAQPage"}</script></head><body><div id="root"></div></body></html>';
  const html = injectSeoMetadata(shell, {
    title: 'Apie DSS Pro & daugiau',
    description: 'Aprašymas <saugiai>',
    canonical: '/apie-mus',
    structuredData: { '@type': 'AboutPage', name: 'Apie DSS Pro' },
  });

  assert.match(html, /<title>Apie DSS Pro &amp; daugiau<\/title>/);
  assert.match(html, /name="description" content="Aprašymas &lt;saugiai&gt;"/);
  assert.match(html, /rel="canonical" href="https:\/\/www\.dsspro\.lt\/apie-mus"/);
  assert.equal((html.match(/id="seo-structured-data"/g) ?? []).length, 1);
  assert.match(html, /"@type":"AboutPage"/);
  assert.doesNotMatch(html, /FAQPage/);
});

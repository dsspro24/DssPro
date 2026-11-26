export const SITE_URL = 'https://www.dsspro.lt';

const ORGANIZATION_ID = `${SITE_URL}/#organization`;

const siteEntities = [
  {
    '@type': 'Organization',
    '@id': ORGANIZATION_ID,
    name: 'DSS Pro',
    url: `${SITE_URL}/`,
    logo: `${SITE_URL}/favicon.svg`,
    email: 'dsspro@inbox.lt',
    description: 'Darbuotojų saugos ir sveikatos procesų valdymo sistema įmonėms.',
    sameAs: [
      'https://www.linkedin.com/company/dsspro',
      'https://www.facebook.com/dsspro.lt',
    ],
    contactPoint: {
      '@type': 'ContactPoint',
      email: 'dsspro@inbox.lt',
      contactType: 'customer support',
      availableLanguage: 'lt',
    },
  },
  {
    '@type': 'WebSite',
    '@id': `${SITE_URL}/#website`,
    url: `${SITE_URL}/`,
    name: 'DSS Pro',
    inLanguage: 'lt-LT',
    publisher: { '@id': ORGANIZATION_ID },
  },
  {
    '@type': 'SoftwareApplication',
    '@id': `${SITE_URL}/#software`,
    name: 'DSS Pro',
    applicationCategory: 'BusinessApplication',
    operatingSystem: 'Web',
    description: 'DSS dokumentų, darbuotojų instruktavimų, testų, parašų ir terminų valdymo sistema.',
    url: `${SITE_URL}/`,
    publisher: { '@id': ORGANIZATION_ID },
  },
];

function omitNullish(value) {
  if (Array.isArray(value)) return value.map(omitNullish).filter((item) => item !== null && item !== undefined);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value)
    .filter(([, item]) => item !== null && item !== undefined)
    .map(([key, item]) => [key, omitNullish(item)]));
}

export function buildSiteStructuredData(pageSchemas = []) {
  const additions = Array.isArray(pageSchemas) ? pageSchemas : [pageSchemas];
  return omitNullish({
    '@context': 'https://schema.org',
    '@graph': [...siteEntities, ...additions],
  });
}

export function buildBreadcrumbList(items) {
  return {
    '@type': 'BreadcrumbList',
    itemListElement: items.map(({ name, url }, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name,
      item: url,
    })),
  };
}

export function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function serializeJsonLd(value) {
  return JSON.stringify(value)
    .replaceAll('<', '\\u003c')
    .replaceAll('>', '\\u003e')
    .replaceAll('&', '\\u0026')
    .replaceAll('\u2028', '\\u2028')
    .replaceAll('\u2029', '\\u2029');
}

export function injectSeoMetadata(html, page) {
  const image = page.image ?? `${SITE_URL}/og-image.png`;
  const metadata = [
    `<title>${escapeHtml(page.title)}</title>`,
    `<meta name="description" content="${escapeHtml(page.description)}">`,
    `<meta name="robots" content="${escapeHtml(page.robots ?? 'index,follow,max-image-preview:large')}">`,
    '<meta property="og:locale" content="lt_LT">',
    '<meta property="og:site_name" content="DSS Pro">',
    `<meta property="og:type" content="${escapeHtml(page.type ?? 'website')}">`,
    `<meta property="og:title" content="${escapeHtml(page.title)}">`,
    `<meta property="og:description" content="${escapeHtml(page.description)}">`,
    `<meta property="og:url" content="${escapeHtml(`${SITE_URL}${page.canonical}`)}">`,
    `<meta property="og:image" content="${escapeHtml(image)}">`,
    `<meta property="og:image:alt" content="${escapeHtml(page.title)}">`,
    '<meta name="twitter:card" content="summary_large_image">',
    `<meta name="twitter:title" content="${escapeHtml(page.title)}">`,
    `<meta name="twitter:description" content="${escapeHtml(page.description)}">`,
    `<meta name="twitter:image" content="${escapeHtml(image)}">`,
    `<link rel="canonical" href="${escapeHtml(`${SITE_URL}${page.canonical}`)}">`,
    `<script id="seo-structured-data" type="application/ld+json">${serializeJsonLd(buildSiteStructuredData(page.structuredData))}</script>`,
  ].join('\n    ');

  let result = html.replace(/<title>[\s\S]*?<\/title>/i, '');
  const existingTags = [
    'meta\\s+name=["\']description["\']',
    'meta\\s+name=["\']robots["\']',
    'meta\\s+name=["\']twitter:card["\']',
    'meta\\s+name=["\']twitter:title["\']',
    'meta\\s+name=["\']twitter:description["\']',
    'meta\\s+name=["\']twitter:image["\']',
    'meta\\s+property=["\']og:locale["\']',
    'meta\\s+property=["\']og:site_name["\']',
    'meta\\s+property=["\']og:type["\']',
    'meta\\s+property=["\']og:title["\']',
    'meta\\s+property=["\']og:description["\']',
    'meta\\s+property=["\']og:url["\']',
    'meta\\s+property=["\']og:image(?::[^"\']+)?["\']',
    'link\\s+rel=["\']canonical["\']',
  ];
  for (const tag of existingTags) result = result.replace(new RegExp(`<${tag}[^>]*>`, 'i'), '');
  result = result.replace(/<script\s+id=["']seo-structured-data["'][\s\S]*?<\/script>/i, '');
  if (!result.includes('</head>')) throw new Error('HTML shell does not contain a closing head tag.');
  return result.replace('</head>', `    ${metadata}\n  </head>`);
}

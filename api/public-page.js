import { env } from 'node:process';
import { buildBreadcrumbList, injectSeoMetadata, SITE_URL } from './seo.js';

const publicPages = {
  '/apie-mus': {
    title: 'Apie DSS Pro | Darbuotojų saugos procesų sistema',
    description: 'Sužinokite, kaip DSS Pro padeda įmonėms tvarkyti darbuotojų instruktavimus, testus, saugos žurnalus, parašus ir dokumentus.',
    name: 'Apie DSS Pro',
    type: 'AboutPage',
  },
  '/kontaktai': {
    title: 'Kontaktai | DSS Pro',
    description: 'Susisiekite su DSS Pro el. paštu klausimais apie sistemą, planus, registraciją ar bendradarbiavimą.',
    name: 'Kontaktai',
    type: 'ContactPage',
  },
  '/vdi-testai': {
    title: 'VDI testai | DSS Pro',
    description: 'Pasirinkite pasiruošimo kryptį ir išbandykite žinias VDI testuose darbdaviams ir darbuotojų saugos specialistams.',
    name: 'VDI testai',
    type: 'CollectionPage',
  },
  '/naudojimo-salygos': {
    title: 'Naudojimo sąlygos | DSS Pro',
    description: 'DSS Pro naudojimo sąlygos įmonėms ir profesinei veiklai.',
    name: 'Naudojimo sąlygos',
    type: 'WebPage',
    terms: true,
  },
  '/privatumo-politika': {
    title: 'Privatumo politika | DSS Pro',
    description: 'Sužinokite, kaip DSS Pro tvarko svetainės ir paslaugos naudotojų asmens duomenis.',
    name: 'Privatumo politika',
    type: 'WebPage',
  },
};

function getPath(request) {
  const queryPath = typeof request.query?.path === 'string' ? request.query.path : '';
  if (queryPath) return queryPath;
  return new URL(request.url, 'https://request.invalid').searchParams.get('path') ?? '';
}

async function getTermsRobots() {
  const supabaseUrl = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
  const supabaseKey = env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseKey) return 'noindex,nofollow';

  const settingsUrl = new URL('/rest/v1/site_legal_settings?select=terms_status&id=eq.true', supabaseUrl);
  const settingsResponse = await fetch(settingsUrl, {
    headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` },
  });
  if (!settingsResponse.ok) throw new Error(`Terms visibility query failed (${settingsResponse.status}).`);
  const settings = await settingsResponse.json();
  if (!Array.isArray(settings)) throw new Error('Terms visibility query returned an invalid response.');
  return settings[0]?.terms_status === 'published' ? 'index,follow,max-image-preview:large' : 'noindex,nofollow';
}

function pageStructuredData(path, page) {
  const pageUrl = `${SITE_URL}${path}`;
  const schema = {
    '@type': page.type,
    '@id': `${pageUrl}#webpage`,
    name: page.name,
    url: pageUrl,
    inLanguage: 'lt-LT',
    isPartOf: { '@id': `${SITE_URL}/#website` },
  };
  if (page.type === 'AboutPage' || page.type === 'ContactPage') {
    schema.about = { '@id': `${SITE_URL}/#organization` };
  }

  const schemas = [schema, buildBreadcrumbList([
    { name: 'Pradžia', url: `${SITE_URL}/` },
    { name: page.name, url: pageUrl },
  ])];

  if (path === '/vdi-testai') {
    schema.mainEntity = {
      '@type': 'ItemList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Darbdaviui atstovaujantis asmuo' },
        { '@type': 'ListItem', position: 2, name: 'DSS specialistas – visos ekonominių veiklos rūšių grupės' },
      ],
    };
  }

  return schemas;
}

export default async function handler(request, response) {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.setHeader('Allow', 'GET, HEAD');
    return response.status(405).send('Method not allowed');
  }

  let path;
  try {
    path = getPath(request);
  } catch {
    return response.status(400).send('Invalid page path.');
  }
  const page = publicPages[path];
  if (!page) return response.status(404).send('Page not found.');

  try {
    const shellResponse = await fetch(`${SITE_URL}/`);
    if (!shellResponse.ok) {
      console.error(`Public page HTML shell request failed (${shellResponse.status}).`);
      return response.status(502).send('Page content is temporarily unavailable.');
    }

    let robots = 'index,follow,max-image-preview:large';
    if (page.terms) {
      try {
        robots = await getTermsRobots();
      } catch (error) {
        console.error('Could not determine whether terms are published:', error);
        robots = 'noindex,nofollow';
      }
    }

    const html = injectSeoMetadata(await shellResponse.text(), {
      ...page,
      canonical: path,
      robots,
      structuredData: pageStructuredData(path, page),
    });
    response.setHeader('Content-Type', 'text/html; charset=utf-8');
    response.setHeader('Cache-Control', page.terms
      ? 'public, s-maxage=60, stale-while-revalidate=300'
      : 'public, s-maxage=3600, stale-while-revalidate=86400');
    response.setHeader('X-Robots-Tag', robots.replace(',', ', '));
    if (request.method === 'HEAD') return response.status(200).end();
    return response.status(200).send(html);
  } catch (error) {
    console.error('Public page SEO rendering failed:', error);
    return response.status(502).send('Page content is temporarily unavailable.');
  }
}

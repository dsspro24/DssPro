import { env } from 'node:process';

const siteUrl = 'https://www.dsspro.lt';
const blogPath = '/tinklarastis';
const pageSize = 20;
const listingDescription = 'Praktiniai patarimai įmonių vadovams ir DSS specialistams apie darbuotojų saugą, instruktavimus, rizikų valdymą ir dokumentus.';

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function escapeJsonForHtml(value) {
  return JSON.stringify(value)
    .replaceAll('<', '\\u003c')
    .replaceAll('>', '\\u003e')
    .replaceAll('&', '\\u0026')
    .replaceAll('\u2028', '\\u2028')
    .replaceAll('\u2029', '\\u2029');
}

function parseArticleBlocks(content) {
  const blocks = [];
  let paragraph = [];
  let list = [];
  const flushParagraph = () => {
    if (paragraph.length) blocks.push({ type: 'paragraph', text: paragraph.join(' ') });
    paragraph = [];
  };
  const flushList = () => {
    if (list.length) blocks.push({ type: 'list', items: list });
    list = [];
  };

  for (const line of String(content ?? '').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) {
      flushParagraph();
      flushList();
    } else if (trimmed.startsWith('## ')) {
      flushParagraph();
      flushList();
      blocks.push({ type: 'heading', text: trimmed.slice(3) });
    } else if (trimmed.startsWith('- ')) {
      flushParagraph();
      list.push(trimmed.slice(2));
    } else {
      flushList();
      paragraph.push(trimmed);
    }
  }
  flushParagraph();
  flushList();
  return blocks;
}

function renderInline(text) {
  const parts = String(text).split(/(\[[^\]]+\]\(https?:\/\/[^\s)]+\)|\*\*[^*]+\*\*)/g);
  return parts.map((part) => {
    const link = part.match(/^\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)$/);
    if (link) {
      return `<a href="${escapeHtml(link[2])}" target="_blank" rel="noopener noreferrer">${escapeHtml(link[1])}</a>`;
    }
    if (part.startsWith('**') && part.endsWith('**')) return `<strong>${escapeHtml(part.slice(2, -2))}</strong>`;
    return escapeHtml(part);
  }).join('');
}

function renderArticleContent(content) {
  return parseArticleBlocks(content).map((block) => {
    if (block.type === 'heading') return `<h2>${escapeHtml(block.text)}</h2>`;
    if (block.type === 'list') return `<ul>${block.items.map((item) => `<li>${renderInline(item)}</li>`).join('')}</ul>`;
    return `<p>${renderInline(block.text)}</p>`;
  }).join('\n');
}

function formatDate(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('lt-LT', {
    timeZone: 'Europe/Vilnius',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(date);
}

function schemaScript(data) {
  return `<script id="seo-structured-data" type="application/ld+json">${escapeJsonForHtml(data)}</script>`;
}

function renderHeader() {
  return '<header class="border-b border-slate-200 bg-white"><div class="mx-auto flex max-w-6xl items-center justify-between px-5 py-5 sm:px-8"><a href="/" class="text-xl font-black tracking-tight text-[#0c4a3b]" aria-label="DSS Pro pradžia">DSS<span class="ml-1 rounded-md bg-emerald-100 px-1.5 py-0.5 text-sm font-bold text-emerald-800">Pro</span></a><a href="/" class="text-sm font-semibold text-slate-600 hover:text-emerald-800">Į DSS Pro svetainę</a></div></header>';
}

function renderFooter() {
  return '<footer class="border-t border-slate-200 bg-slate-50 px-5 py-6 text-center text-xs text-slate-500"><nav aria-label="Poraštės nuorodos" class="flex flex-wrap justify-center gap-x-5 gap-y-2"><a href="/tinklarastis" class="font-semibold text-emerald-800 hover:text-emerald-950">Tinklaraštis</a><a href="/naudojimo-salygos" class="font-semibold text-emerald-800 hover:text-emerald-950">Naudojimo sąlygos</a></nav><p class="mt-3">© 2026 DSS Pro. Informaciniai straipsniai nepakeičia individualios konsultacijos.</p></footer>';
}

function renderArticleCard(post) {
  const href = `${blogPath}/${encodeURIComponent(post.slug)}`;
  const title = escapeHtml(post.title);
  const date = formatDate(post.published_at);
  return `<article class="rounded-2xl border border-slate-200 p-6 transition hover:border-emerald-300 hover:shadow-sm sm:p-8"><div class="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-semibold text-emerald-800"><span>${escapeHtml(post.category)}</span>${date ? `<span aria-hidden="true">·</span><time datetime="${escapeHtml(post.published_at)}">${escapeHtml(date)}</time>` : ''}</div><h2 class="mt-3 text-2xl font-bold tracking-tight text-slate-950"><a href="${href}" class="hover:text-emerald-800">${title}</a></h2><p class="mt-3 leading-7 text-slate-600">${escapeHtml(post.excerpt)}</p><a href="${href}" class="mt-5 inline-flex items-center gap-2 text-sm font-bold text-emerald-800 hover:text-emerald-950">Skaityti straipsnį <span aria-hidden="true">→</span></a></article>`;
}

function renderPagination(page, total) {
  const pageCount = Math.ceil(total / pageSize);
  if (pageCount <= 1) return '';
  const previous = page > 1
    ? `<a aria-label="Ankstesnis straipsnių puslapis" class="inline-flex min-h-10 items-center gap-1 rounded-md border border-slate-300 px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50" href="${page === 2 ? blogPath : `${blogPath}?puslapis=${page - 1}`}">← Ankstesnis</a>`
    : '<span aria-disabled="true" class="inline-flex min-h-10 items-center gap-1 rounded-md border border-slate-300 px-3 text-sm font-semibold text-slate-400">← Ankstesnis</span>';
  const next = page < pageCount
    ? `<a aria-label="Kitas straipsnių puslapis" class="inline-flex min-h-10 items-center gap-1 rounded-md border border-slate-300 px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50" href="${blogPath}?puslapis=${page + 1}">Kitas →</a>`
    : '<span aria-disabled="true" class="inline-flex min-h-10 items-center gap-1 rounded-md border border-slate-300 px-3 text-sm font-semibold text-slate-400">Kitas →</span>';
  const first = (page - 1) * pageSize + 1;
  const last = Math.min(page * pageSize, total);
  return `<nav aria-label="Tinklaraščio puslapiavimas" class="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-5"><p class="text-sm text-slate-600">Rodoma ${first}–${last} iš ${total} straipsnių</p><div class="flex items-center gap-2">${previous}<span aria-current="page" class="min-w-16 text-center text-sm font-semibold tabular-nums text-slate-700">${page} / ${pageCount}</span>${next}</div></nav>`;
}

function renderListing(posts, total, page) {
  const canonical = page > 1 ? `${blogPath}?puslapis=${page}` : blogPath;
  const title = `Tinklaraštis apie darbuotojų saugą | DSS Pro${page > 1 ? ` · ${page} puslapis` : ''}`;
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: title,
    description: listingDescription,
    url: `${siteUrl}${canonical}`,
    inLanguage: 'lt-LT',
    mainEntity: {
      '@type': 'ItemList',
      numberOfItems: total,
      itemListElement: posts.map((post, index) => ({
        '@type': 'ListItem',
        position: (page - 1) * pageSize + index + 1,
        url: `${siteUrl}${blogPath}/${encodeURIComponent(post.slug)}`,
        name: post.title,
      })),
    },
  };
  const body = `<main class="mx-auto max-w-4xl px-5 py-12 sm:px-8 sm:py-16"><div class="mb-10"><p class="inline-flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-emerald-800"><span aria-hidden="true">▧</span> DSS Pro žinynas</p><h1 class="mt-3 text-4xl font-black tracking-tight text-slate-950 sm:text-5xl">Tinklaraštis</h1><p class="mt-4 max-w-2xl text-lg leading-8 text-slate-600">${escapeHtml(listingDescription)}</p></div>${posts.length ? `<div class="grid gap-5">${posts.map(renderArticleCard).join('')}</div>${renderPagination(page, total)}` : '<p class="rounded-xl border border-dashed border-slate-300 p-8 text-center text-slate-600">Straipsnių kol kas nėra.</p>'}</main>`;
  const initialData = { path: blogPath, slug: '', page, totalPosts: total, posts };
  return { title, description: listingDescription, canonical, schema, body, initialData };
}

function renderArticle(post) {
  const canonical = `${blogPath}/${encodeURIComponent(post.slug)}`;
  const title = post.seo_title || post.title;
  const description = post.seo_description || post.excerpt;
  const publishedDate = formatDate(post.published_at);
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: post.title,
    description,
    datePublished: post.published_at || undefined,
    dateModified: post.updated_at || post.published_at || undefined,
    mainEntityOfPage: `${siteUrl}${canonical}`,
    url: `${siteUrl}${canonical}`,
    author: { '@type': 'Organization', name: 'DSS Pro', url: siteUrl },
    publisher: { '@type': 'Organization', name: 'DSS Pro', url: siteUrl },
    articleSection: post.category,
    inLanguage: 'lt-LT',
  };
  const body = `<main class="mx-auto max-w-4xl px-5 py-12 sm:px-8 sm:py-16"><a href="${blogPath}" class="mb-8 inline-flex items-center gap-2 text-sm font-semibold text-emerald-800 hover:text-emerald-950"><span aria-hidden="true">←</span>Visi straipsniai</a><article><div class="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm font-semibold text-emerald-800"><span>${escapeHtml(post.category)}</span>${publishedDate ? `<span aria-hidden="true">·</span><time datetime="${escapeHtml(post.published_at)}">${escapeHtml(publishedDate)}</time>` : ''}</div><h1 class="mt-4 text-4xl font-black leading-tight tracking-tight text-slate-950 sm:text-5xl">${escapeHtml(post.title)}</h1><p class="mt-5 border-l-4 border-emerald-600 pl-4 text-xl leading-8 text-slate-600">${escapeHtml(post.excerpt)}</p><div class="mt-10 space-y-5 text-base leading-8 text-slate-700">${renderArticleContent(post.content)}</div><div class="mt-12 border-t border-slate-200 pt-6"><a href="/" class="inline-flex items-center gap-2 font-semibold text-emerald-800 hover:text-emerald-950">Sužinoti apie DSS Pro <span aria-hidden="true">→</span></a></div></article></main>`;
  const initialData = { path: canonical, slug: post.slug, page: 1, totalPosts: 0, posts: [], article: post };
  return { title, description, canonical, schema, body, initialData };
}

function renderNotFound() {
  const title = 'Straipsnis nerastas | DSS Pro';
  const description = 'Ieškomas DSS Pro tinklaraščio straipsnis nerastas.';
  const canonical = blogPath;
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: title,
    description,
    url: `${siteUrl}${canonical}`,
    inLanguage: 'lt-LT',
  };
  const body = `<main class="mx-auto max-w-4xl px-5 py-12 sm:px-8 sm:py-16"><section class="rounded-2xl border border-slate-200 bg-slate-50 p-8 text-center"><h1 class="text-2xl font-bold">Straipsnis nerastas</h1><p class="mt-2 text-slate-600">Jis galėjo būti pašalintas arba dar nepaskelbtas.</p><a href="${blogPath}" class="mt-5 inline-flex items-center gap-2 font-semibold text-emerald-800">Grįžti į tinklaraštį <span aria-hidden="true">→</span></a></section></main>`;
  return { title, description, canonical, schema, body, initialData: null };
}

function htmlAttribute(value) {
  return escapeHtml(value);
}

function injectMetadata(html, page) {
  const metadata = [
    `<title>${escapeHtml(page.title)}</title>`,
    `<meta name="description" content="${htmlAttribute(page.description)}">`,
    '<meta name="robots" content="index,follow,max-image-preview:large">',
    '<meta property="og:locale" content="lt_LT">',
    '<meta property="og:site_name" content="DSS Pro">',
    `<meta property="og:type" content="${page.schema['@type'] === 'BlogPosting' ? 'article' : 'website'}">`,
    `<meta property="og:title" content="${htmlAttribute(page.title)}">`,
    `<meta property="og:description" content="${htmlAttribute(page.description)}">`,
    `<meta property="og:url" content="${siteUrl}${page.canonical}">`,
    '<meta name="twitter:card" content="summary">',
    `<meta name="twitter:title" content="${htmlAttribute(page.title)}">`,
    `<meta name="twitter:description" content="${htmlAttribute(page.description)}">`,
    `<link rel="canonical" href="${siteUrl}${page.canonical}">`,
    schemaScript(page.schema),
  ].join('\n    ');
  let result = html.replace(/<title>[\s\S]*?<\/title>/i, '');
  const existingTags = [
    'meta\\s+name=["\']description["\']',
    'meta\\s+name=["\']robots["\']',
    'meta\\s+name=["\']twitter:card["\']',
    'meta\\s+name=["\']twitter:title["\']',
    'meta\\s+name=["\']twitter:description["\']',
    'meta\\s+property=["\']og:locale["\']',
    'meta\\s+property=["\']og:site_name["\']',
    'meta\\s+property=["\']og:type["\']',
    'meta\\s+property=["\']og:title["\']',
    'meta\\s+property=["\']og:description["\']',
    'meta\\s+property=["\']og:url["\']',
    'link\\s+rel=["\']canonical["\']',
  ];
  for (const tag of existingTags) result = result.replace(new RegExp(`<${tag}[^>]*>`, 'i'), '');
  result = result.replace(/<script\s+id=["']seo-structured-data["'][\s\S]*?<\/script>/i, '');
  result = result.replace('</head>', `    ${metadata}\n  </head>`);
  result = result.replace('<div id="root"></div>', `<div id="root">${renderHeader()}${page.body}${renderFooter()}</div>`);
  const bootScript = page.initialData
    ? `<script>window.__BLOG_SSR__=${escapeJsonForHtml(page.initialData)};</script>`
    : '';
  return result.replace('</body>', `${bootScript}\n  </body>`);
}

function readPage(requestUrl) {
  const page = Number.parseInt(new URL(requestUrl).searchParams.get('puslapis') ?? '', 10);
  return Number.isInteger(page) && page > 0 ? Math.min(page, 100000) : 1;
}

function respondError(response, status, message) {
  response.setHeader('Content-Type', 'text/plain; charset=utf-8');
  response.setHeader('Cache-Control', 'no-store');
  return response.status(status).send(message);
}

export default async function handler(request, response) {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.setHeader('Allow', 'GET, HEAD');
    return respondError(response, 405, 'Method not allowed');
  }

  const supabaseUrl = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
  const supabaseKey = env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseKey) {
    return respondError(response, 503, 'Blog is temporarily unavailable.');
  }

  let baseUrl;
  let requestUrl;
  try {
    baseUrl = new URL(supabaseUrl);
    requestUrl = new URL(request.url, 'https://request.invalid');
  } catch {
    return respondError(response, 500, 'Blog configuration is invalid.');
  }
  if (baseUrl.protocol !== 'https:' && baseUrl.hostname !== 'localhost') {
    return respondError(response, 500, 'Blog configuration must use HTTPS.');
  }

  try {
    const headers = { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` };
    const slug = typeof request.query?.slug === 'string'
      ? request.query.slug
      : requestUrl.searchParams.get('slug') ?? '';
    let page;
    let statusCode = 200;

    if (slug) {
      const postUrl = new URL('/rest/v1/blog_posts', baseUrl);
      postUrl.searchParams.set('select', 'id,title,slug,excerpt,category,content,seo_title,seo_description,status,published_at,updated_at');
      postUrl.searchParams.set('slug', `eq.${slug}`);
      postUrl.searchParams.set('status', 'eq.published');
      postUrl.searchParams.set('limit', '1');
      const [postResponse, shellResponse] = await Promise.all([
        fetch(postUrl, { headers }),
        fetch(siteUrl),
      ]);
      if (!postResponse.ok) {
        console.error(`Blog article query failed (${postResponse.status}): ${await postResponse.text()}`);
        return respondError(response, 502, 'Blog content is temporarily unavailable.');
      }
      if (!shellResponse.ok) {
        console.error(`Blog HTML shell request failed (${shellResponse.status}).`);
        return respondError(response, 502, 'Blog page is temporarily unavailable.');
      }
      const posts = await postResponse.json();
      if (!Array.isArray(posts)) return respondError(response, 502, 'Blog content is temporarily unavailable.');
      const post = posts[0];
      page = post ? renderArticle(post) : renderNotFound();
      if (!post) statusCode = 404;
      const html = injectMetadata(await shellResponse.text(), page);
      response.setHeader('Content-Type', 'text/html; charset=utf-8');
      response.setHeader('Cache-Control', statusCode === 200 ? 'public, s-maxage=300, stale-while-revalidate=3600' : 'public, s-maxage=60');
      response.setHeader('X-Robots-Tag', statusCode === 200 ? 'index, follow' : 'noindex');
      if (request.method === 'HEAD') return response.status(statusCode).end();
      return response.status(statusCode).send(html);
    }

    const currentPage = readPage(requestUrl);
    const firstItem = (currentPage - 1) * pageSize;
    const postsUrl = new URL('/rest/v1/blog_posts', baseUrl);
    postsUrl.searchParams.set('select', 'id,title,slug,excerpt,category,published_at,updated_at');
    postsUrl.searchParams.set('status', 'eq.published');
    postsUrl.searchParams.set('order', 'published_at.desc');
    postsUrl.searchParams.set('limit', String(pageSize));
    postsUrl.searchParams.set('offset', String(firstItem));
    let knownTotal = null;
    if (currentPage > 1) {
      const countUrl = new URL('/rest/v1/blog_posts', baseUrl);
      countUrl.searchParams.set('select', 'id');
      countUrl.searchParams.set('status', 'eq.published');
      countUrl.searchParams.set('limit', '1');
      const countResponse = await fetch(countUrl, {
        headers: { ...headers, Prefer: 'count=exact' },
      });
      if (!countResponse.ok) {
        console.error(`Blog listing count query failed (${countResponse.status}): ${await countResponse.text()}`);
        return respondError(response, 502, 'Blog content is temporarily unavailable.');
      }
      const countRange = countResponse.headers.get('content-range')?.match(/\/(\d+|\*)$/);
      knownTotal = countRange && countRange[1] !== '*' ? Number(countRange[1]) : null;
      if (!Number.isInteger(knownTotal)) {
        return respondError(response, 502, 'Blog content is temporarily unavailable.');
      }
      const pageCount = Math.max(1, Math.ceil(knownTotal / pageSize));
      if (currentPage > pageCount) {
        response.setHeader('Location', pageCount === 1 ? blogPath : `${blogPath}?puslapis=${pageCount}`);
        response.setHeader('Cache-Control', 'no-store');
        return response.status(308).end();
      }
    }
    const [postsResponse, shellResponse] = await Promise.all([
      fetch(postsUrl, {
        headers: { ...headers, Prefer: 'count=exact' },
      }),
      fetch(siteUrl),
    ]);
    if (!postsResponse.ok) {
      console.error(`Blog listing query failed (${postsResponse.status}): ${await postsResponse.text()}`);
      return respondError(response, 502, 'Blog content is temporarily unavailable.');
    }
    if (!shellResponse.ok) {
      console.error(`Blog HTML shell request failed (${shellResponse.status}).`);
      return respondError(response, 502, 'Blog page is temporarily unavailable.');
    }
    const posts = await postsResponse.json();
    const range = postsResponse.headers.get('content-range')?.match(/\/(\d+|\*)$/);
    const total = knownTotal ?? (range && range[1] !== '*' ? Number(range[1]) : posts.length);
    if (!Array.isArray(posts) || !Number.isInteger(total)) {
      return respondError(response, 502, 'Blog content is temporarily unavailable.');
    }
    const pageCount = Math.max(1, Math.ceil(total / pageSize));
    if (currentPage > pageCount) {
      response.setHeader('Location', pageCount === 1 ? blogPath : `${blogPath}?puslapis=${pageCount}`);
      response.setHeader('Cache-Control', 'no-store');
      return response.status(308).end();
    }
    page = renderListing(posts, total, currentPage);
    const html = injectMetadata(await shellResponse.text(), page);
    response.setHeader('Content-Type', 'text/html; charset=utf-8');
    response.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=3600');
    response.setHeader('X-Robots-Tag', 'index, follow');
    if (request.method === 'HEAD') return response.status(200).end();
    return response.status(200).send(html);
  } catch (error) {
    console.error('Blog server rendering failed:', error);
    return respondError(response, 502, 'Blog content is temporarily unavailable.');
  }
}

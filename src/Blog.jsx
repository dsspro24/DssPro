import { useEffect, useState } from 'react';
import { ArrowLeft, ArrowRight, BookOpen, ChevronLeft, ChevronRight, Eye, Pencil, Plus, Save, Trash2, X } from 'lucide-react';
import { supabase } from './lib/supabase.js';

const BLOG_PATH = '/tinklarastis';
const SITE_URL = 'https://www.dsspro.lt';
const BLOG_PAGE_SIZE = 20;
const articleFields = 'id, title, slug, excerpt, category, content, seo_title, seo_description, status, published_at, updated_at';

function getBlogPageFromUrl() {
  const page = Number.parseInt(new URLSearchParams(window.location.search).get('puslapis') ?? '', 10);
  return Number.isInteger(page) && page > 1 ? page : 1;
}

function updatePageMetadata({ title, description, canonical, type = 'website', structuredData }) {
  const originalTitle = document.title;
  const metaTags = [
    { attribute: 'name', key: 'description', value: description },
    { attribute: 'name', key: 'robots', value: 'index,follow,max-image-preview:large' },
    { attribute: 'property', key: 'og:locale', value: 'lt_LT' },
    { attribute: 'property', key: 'og:site_name', value: 'DSS Pro' },
    { attribute: 'property', key: 'og:type', value: type },
    { attribute: 'property', key: 'og:title', value: title },
    { attribute: 'property', key: 'og:description', value: description },
    { attribute: 'property', key: 'og:url', value: `${SITE_URL}${canonical}` },
    { attribute: 'name', key: 'twitter:card', value: 'summary' },
    { attribute: 'name', key: 'twitter:title', value: title },
    { attribute: 'name', key: 'twitter:description', value: description },
  ];
  const originalMeta = metaTags.map(({ attribute, key }) => {
    const element = document.head.querySelector(`meta[${attribute}="${key}"]`);
    return { attribute, key, element, content: element?.content, existed: Boolean(element) };
  });
  metaTags.forEach(({ attribute, key, value }) => {
    let element = document.head.querySelector(`meta[${attribute}="${key}"]`);
    if (!element) {
      element = document.createElement('meta');
      element.setAttribute(attribute, key);
      document.head.append(element);
    }
    element.content = value;
  });
  let canonicalLink = document.querySelector('link[rel="canonical"]');
  const createdCanonical = !canonicalLink;
  if (!canonicalLink) {
    canonicalLink = document.createElement('link');
    canonicalLink.rel = 'canonical';
    document.head.append(canonicalLink);
  }
  const originalCanonical = canonicalLink.href;
  const structuredDataElement = document.querySelector('#seo-structured-data');
  const originalStructuredData = structuredDataElement?.textContent ?? '';
  let jsonLd = structuredDataElement;
  if (!jsonLd) {
    jsonLd = document.createElement('script');
    jsonLd.id = 'seo-structured-data';
    jsonLd.type = 'application/ld+json';
    document.head.append(jsonLd);
  }
  jsonLd.textContent = JSON.stringify(structuredData).replace(/</g, '\\u003c');
  document.title = title;
  canonicalLink.href = `${SITE_URL}${canonical}`;

  return () => {
    document.title = originalTitle;
    originalMeta.forEach(({ attribute, key, element, content, existed }) => {
      if (existed) element.content = content;
      else document.head.querySelector(`meta[${attribute}="${key}"]`)?.remove();
    });
    if (createdCanonical) canonicalLink.remove();
    else canonicalLink.href = originalCanonical;
    if (structuredDataElement) structuredDataElement.textContent = originalStructuredData;
    else jsonLd.remove();
  };
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

  for (const line of content.split(/\r?\n/)) {
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
  return text.split(/(\[[^\]]+\]\(https?:\/\/[^\s)]+\)|\*\*[^*]+\*\*)/g).map((part, index) => {
    const linkMatch = part.match(/^\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)$/);
    if (linkMatch) {
      return <a key={index} href={linkMatch[2]} target="_blank" rel="noreferrer" className="font-medium text-emerald-800 underline underline-offset-2 hover:text-emerald-950">{linkMatch[1]}</a>;
    }
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={index}>{part.slice(2, -2)}</strong>;
    }
    return part;
  });
}

function ArticleContent({ content }) {
  return <div className="space-y-5 text-base leading-8 text-slate-700">
    {parseArticleBlocks(content).map((block, index) => {
      if (block.type === 'heading') return <h2 key={index} className="pt-3 text-2xl font-bold leading-tight tracking-tight text-slate-950">{block.text}</h2>;
      if (block.type === 'list') return <ul key={index} className="list-disc space-y-2 pl-6">{block.items.map((item, itemIndex) => <li key={itemIndex}>{renderInline(item)}</li>)}</ul>;
      return <p key={index}>{renderInline(block.text)}</p>;
    })}
  </div>;
}

function formatDate(value) {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : new Intl.DateTimeFormat('lt-LT', { year: 'numeric', month: 'long', day: 'numeric' }).format(date);
}

function BlogHeader() {
  return <header className="border-b border-slate-200 bg-white">
    <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5 sm:px-8">
      <a href="/" className="text-xl font-black tracking-tight text-[#0c4a3b]" aria-label="DSS Pro pradžia">DSS<span className="ml-1 rounded-md bg-emerald-100 px-1.5 py-0.5 text-sm font-bold text-emerald-800">Pro</span></a>
      <a href="/" className="text-sm font-semibold text-slate-600 hover:text-emerald-800">Į DSS Pro svetainę</a>
    </div>
  </header>;
}

export default function BlogPage({ slug = '', initialData = null }) {
  const isArticle = Boolean(slug);
  const [posts, setPosts] = useState(() => initialData && !isArticle && initialData.page === getBlogPageFromUrl() ? initialData.posts : []);
  const [totalPosts, setTotalPosts] = useState(() => initialData && !isArticle && initialData.page === getBlogPageFromUrl() ? initialData.totalPosts : 0);
  const [page, setPage] = useState(getBlogPageFromUrl);
  const [article, setArticle] = useState(() => initialData && isArticle && initialData.slug === slug ? initialData.article : null);
  const hasInitialData = initialData?.path === window.location.pathname
    && (isArticle ? initialData.slug === slug : initialData.page === getBlogPageFromUrl());
  const [status, setStatus] = useState(hasInitialData ? 'ready' : supabase ? 'loading' : 'error');
  const [error, setError] = useState(supabase ? '' : 'Supabase ryšys nesukonfigūruotas.');

  const navigateToPage = (nextPage, { replace = false } = {}) => {
    const normalizedPage = Math.max(1, nextPage);
    const url = new URL(window.location.href);
    if (normalizedPage === 1) url.searchParams.delete('puslapis');
    else url.searchParams.set('puslapis', String(normalizedPage));
    const historyMethod = replace ? 'replaceState' : 'pushState';
    window.history[historyMethod](window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
    setStatus('loading');
    setPage(normalizedPage);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  useEffect(() => {
    if (isArticle) return undefined;
    const handlePopState = () => {
      setPage(getBlogPageFromUrl());
      setStatus('loading');
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [isArticle]);

  useEffect(() => {
    let active = true;
    if (hasInitialData) return () => { active = false; };
    if (!supabase) return () => { active = false; };
    const request = isArticle
      ? supabase.from('blog_posts').select(articleFields).eq('slug', slug).eq('status', 'published').maybeSingle()
      : supabase.from('blog_posts')
        .select('id, title, slug, excerpt, category, published_at', { count: 'exact' })
        .eq('status', 'published')
        .order('published_at', { ascending: false })
        .range((page - 1) * BLOG_PAGE_SIZE, page * BLOG_PAGE_SIZE - 1);

    request.then(({ data, count, error: requestError }) => {
      if (!active) return;
      if (requestError) {
        setError(requestError.message);
        setStatus('error');
        return;
      }
      if (isArticle) {
        setArticle(data);
        setStatus(data ? 'ready' : 'not-found');
      } else {
        const total = count ?? data?.length ?? 0;
        const pageCount = Math.max(1, Math.ceil(total / BLOG_PAGE_SIZE));
        if (page > pageCount) {
          navigateToPage(pageCount, { replace: true });
          return;
        }
        setPosts(data ?? []);
        setTotalPosts(total);
        setStatus('ready');
      }
    }).catch((requestError) => {
      if (!active) return;
      setError(requestError instanceof Error ? requestError.message : String(requestError));
      setStatus('error');
    });

    return () => { active = false; };
  }, [hasInitialData, isArticle, slug, page]);

  useEffect(() => {
    const canonical = isArticle ? `${BLOG_PATH}/${encodeURIComponent(slug)}` : BLOG_PATH;
    const listingPageCanonical = !isArticle && page > 1 ? `${BLOG_PATH}?puslapis=${page}` : canonical;
    const title = article && isArticle
      ? (article.seo_title || article.title)
      : `Tinklaraštis apie darbuotojų saugą | DSS Pro${!isArticle && page > 1 ? ` · ${page} puslapis` : ''}`;
    const description = article && isArticle
      ? (article.seo_description || article.excerpt)
      : 'Praktiniai patarimai įmonių vadovams ir DSS specialistams apie darbuotojų saugą, instruktavimus, rizikų valdymą ir dokumentus.';
    const articleSchema = article && isArticle ? {
      '@context': 'https://schema.org',
      '@type': 'BlogPosting',
      headline: article.title,
      description: article.seo_description || article.excerpt,
      datePublished: article.published_at || undefined,
      dateModified: article.updated_at || article.published_at || undefined,
      mainEntityOfPage: `${SITE_URL}${canonical}`,
      url: `${SITE_URL}${canonical}`,
      author: { '@type': 'Organization', name: 'DSS Pro', url: SITE_URL },
      publisher: { '@type': 'Organization', name: 'DSS Pro', url: SITE_URL },
      articleSection: article.category,
      inLanguage: 'lt-LT',
    } : {
      '@context': 'https://schema.org',
      '@type': 'CollectionPage',
      name: title,
      description,
      url: `${SITE_URL}${listingPageCanonical}`,
      inLanguage: 'lt-LT',
      mainEntity: {
        '@type': 'ItemList',
        numberOfItems: totalPosts,
        itemListElement: posts.map((post, index) => ({
          '@type': 'ListItem',
          position: (page - 1) * BLOG_PAGE_SIZE + index + 1,
          url: `${SITE_URL}${BLOG_PATH}/${encodeURIComponent(post.slug)}`,
          name: post.title,
        })),
      },
    };
    return updatePageMetadata({
      title,
      description,
      canonical: listingPageCanonical,
      type: article && isArticle ? 'article' : 'website',
      structuredData: articleSchema,
    });
  }, [article, isArticle, page, posts, slug, totalPosts]);

  return <div className="min-h-screen bg-white text-slate-900">
    <BlogHeader />
    <main className="mx-auto max-w-4xl px-5 py-12 sm:px-8 sm:py-16">
      {isArticle && <a href={BLOG_PATH} className="mb-8 inline-flex items-center gap-2 text-sm font-semibold text-emerald-800 hover:text-emerald-950"><ArrowLeft size={16} />Visi straipsniai</a>}
      {!isArticle && <div className="mb-10">
        <p className="inline-flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-emerald-800"><BookOpen size={16} /> DSS Pro žinynas</p>
        <h1 className="mt-3 text-4xl font-black tracking-tight text-slate-950 sm:text-5xl">Tinklaraštis</h1>
        <p className="mt-4 max-w-2xl text-lg leading-8 text-slate-600">Praktinė informacija apie darbuotojų saugą, mokymus ir kasdienių procesų organizavimą.</p>
      </div>}
      {status === 'loading' && <p role="status" className="rounded-xl border border-slate-200 bg-slate-50 p-5 text-sm text-slate-600">Įkeliami straipsniai…</p>}
      {status === 'error' && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-5 text-sm text-rose-800">Straipsnių įkelti nepavyko: {error}</p>}
      {status === 'not-found' && <section className="rounded-2xl border border-slate-200 bg-slate-50 p-8 text-center">
        <h1 className="text-2xl font-bold">Straipsnis nerastas</h1>
        <p className="mt-2 text-slate-600">Jis galėjo būti pašalintas arba dar nepaskelbtas.</p>
        <a href={BLOG_PATH} className="mt-5 inline-flex items-center gap-2 font-semibold text-emerald-800">Grįžti į tinklaraštį <ArrowRight size={16} /></a>
      </section>}
      {status === 'ready' && !isArticle && (posts.length ? <>
        <div className="grid gap-5">
          {posts.map((post) => <article key={post.id} className="rounded-2xl border border-slate-200 p-6 transition hover:border-emerald-300 hover:shadow-sm sm:p-8">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-semibold text-emerald-800"><span>{post.category}</span>{post.published_at && <><span aria-hidden="true">·</span><time dateTime={post.published_at}>{formatDate(post.published_at)}</time></>}</div>
            <h2 className="mt-3 text-2xl font-bold tracking-tight text-slate-950"><a href={`${BLOG_PATH}/${encodeURIComponent(post.slug)}`} className="hover:text-emerald-800">{post.title}</a></h2>
            <p className="mt-3 leading-7 text-slate-600">{post.excerpt}</p>
            <a href={`${BLOG_PATH}/${encodeURIComponent(post.slug)}`} className="mt-5 inline-flex items-center gap-2 text-sm font-bold text-emerald-800 hover:text-emerald-950">Skaityti straipsnį <ArrowRight size={16} /></a>
          </article>)}
        </div>
        {totalPosts > BLOG_PAGE_SIZE && <nav aria-label="Tinklaraščio puslapiavimas" className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-5">
          <p className="text-sm text-slate-600">Rodoma {(page - 1) * BLOG_PAGE_SIZE + 1}–{Math.min(page * BLOG_PAGE_SIZE, totalPosts)} iš {totalPosts} straipsnių</p>
          <div className="flex items-center gap-2">
            <button type="button" aria-label="Ankstesnis straipsnių puslapis" className="inline-flex min-h-10 items-center gap-1 rounded-md border border-slate-300 px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40" disabled={page <= 1} onClick={() => navigateToPage(page - 1)}><ChevronLeft size={16} />Ankstesnis</button>
            <span aria-current="page" className="min-w-16 text-center text-sm font-semibold tabular-nums text-slate-700">{page} / {Math.ceil(totalPosts / BLOG_PAGE_SIZE)}</span>
            <button type="button" aria-label="Kitas straipsnių puslapis" className="inline-flex min-h-10 items-center gap-1 rounded-md border border-slate-300 px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40" disabled={page >= Math.ceil(totalPosts / BLOG_PAGE_SIZE)} onClick={() => navigateToPage(page + 1)}>Kitas<ChevronRight size={16} /></button>
          </div>
        </nav>}
      </> : <p className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-slate-600">Straipsnių kol kas nėra.</p>)}
      {status === 'ready' && isArticle && article && <article>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm font-semibold text-emerald-800"><span>{article.category}</span>{article.published_at && <><span aria-hidden="true">·</span><time dateTime={article.published_at}>{formatDate(article.published_at)}</time></>}</div>
        <h1 className="mt-4 text-4xl font-black leading-tight tracking-tight text-slate-950 sm:text-5xl">{article.title}</h1>
        <p className="mt-5 border-l-4 border-emerald-600 pl-4 text-xl leading-8 text-slate-600">{article.excerpt}</p>
        <div className="mt-10"><ArticleContent content={article.content} /></div>
        <div className="mt-12 border-t border-slate-200 pt-6">
          <a href="/" className="inline-flex items-center gap-2 font-semibold text-emerald-800 hover:text-emerald-950">Sužinoti apie DSS Pro <ArrowRight size={16} /></a>
        </div>
      </article>}
    </main>
    <footer className="border-t border-slate-200 bg-slate-50 px-5 py-6 text-center text-xs text-slate-500">
      <nav aria-label="Poraštės nuorodos" className="flex flex-wrap justify-center gap-x-5 gap-y-2">
        <a href={BLOG_PATH} className="font-semibold text-emerald-800 hover:text-emerald-950">Tinklaraštis</a>
        <a href="/naudojimo-salygos" className="font-semibold text-emerald-800 hover:text-emerald-950">Naudojimo sąlygos</a>
      </nav>
      <p className="mt-3">© 2026 DSS Pro. Informaciniai straipsniai nepakeičia individualios konsultacijos.</p>
    </footer>
  </div>;
}

const emptyPost = {
  title: '',
  slug: '',
  excerpt: '',
  category: 'Darbuotojų sauga',
  content: '',
  seo_title: '',
  seo_description: '',
  status: 'draft',
};

function slugify(title) {
  const replacements = { ą: 'a', č: 'c', ę: 'e', ė: 'e', į: 'i', š: 's', ų: 'u', ū: 'u', ž: 'z' };
  return title.toLocaleLowerCase('lt')
    .replace(/[ąčęėįšųūž]/g, (letter) => replacements[letter])
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 180)
    .replace(/-$/g, '');
}

export function BlogAdmin() {
  const [posts, setPosts] = useState([]);
  const [draft, setDraft] = useState(emptyPost);
  const [editingId, setEditingId] = useState('');
  const [loading, setLoading] = useState(Boolean(supabase));
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState('');
  const [error, setError] = useState(supabase ? '' : 'Supabase ryšys nesukonfigūruotas.');
  const [notice, setNotice] = useState('');

  const loadPosts = async () => {
    const { data, error: requestError } = await supabase.from('blog_posts').select(articleFields).order('updated_at', { ascending: false }).limit(100);
    if (requestError) {
      setError(`Straipsnių įkelti nepavyko: ${requestError.message}`);
    } else {
      setPosts(data ?? []);
    }
    setLoading(false);
  };

  useEffect(() => {
    let active = true;
    if (!supabase) return () => { active = false; };
    supabase.from('blog_posts').select(articleFields).order('updated_at', { ascending: false }).limit(100)
      .then(({ data, error: requestError }) => {
        if (!active) return;
        if (requestError) setError(`Straipsnių įkelti nepavyko: ${requestError.message}`);
        else setPosts(data ?? []);
        setLoading(false);
      })
      .catch((requestError) => {
        if (!active) return;
        setError(`Straipsnių įkelti nepavyko: ${requestError instanceof Error ? requestError.message : String(requestError)}`);
        setLoading(false);
      });
    return () => { active = false; };
  }, []);

  const updateDraft = (field, value) => {
    setDraft((current) => ({ ...current, [field]: value }));
    setError('');
    setNotice('');
  };

  const editPost = (post) => {
    setEditingId(post.id);
    setDraft({
      title: post.title,
      slug: post.slug,
      excerpt: post.excerpt,
      category: post.category,
      content: post.content,
      seo_title: post.seo_title ?? '',
      seo_description: post.seo_description ?? '',
      status: post.status,
    });
    setNotice('');
    setError('');
    document.getElementById('blog-editor')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const resetEditor = () => {
    setEditingId('');
    setDraft(emptyPost);
  };

  const savePost = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    setNotice('');
    if (!supabase) {
      setSaving(false);
      setError('Supabase ryšys nesukonfigūruotas.');
      return;
    }
    let createdBy = '';
    if (!editingId) {
      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError) {
        setSaving(false);
        setError(`Administratoriaus paskyros nustatyti nepavyko: ${userError.message}`);
        return;
      }
      createdBy = userData.user?.id ?? '';
    }
    const payload = {
      ...draft,
      slug: draft.slug.trim() || slugify(draft.title),
      title: draft.title.trim(),
      excerpt: draft.excerpt.trim(),
      category: draft.category.trim(),
      content: draft.content.trim(),
      seo_title: draft.seo_title.trim(),
      seo_description: draft.seo_description.trim(),
      ...(!editingId ? { created_by: createdBy } : {}),
    };
    if (!payload.created_by && !editingId) {
      setSaving(false);
      setError('Nepavyko nustatyti administratoriaus paskyros. Prisijunkite iš naujo ir bandykite dar kartą.');
      return;
    }
    const result = editingId
      ? await supabase.from('blog_posts').update(payload).eq('id', editingId).select('id').maybeSingle()
      : await supabase.from('blog_posts').insert(payload).select('id').single();
    setSaving(false);
    if (result.error) {
      setError(`Straipsnio išsaugoti nepavyko: ${result.error.message}`);
      return;
    }
    if (!result.data) {
      setError('Straipsnio išsaugoti nepavyko: įrašas nerastas arba neturite teisės jo keisti.');
      return;
    }
    await loadPosts();
    resetEditor();
    setNotice(payload.status === 'published' ? 'Straipsnis išsaugotas ir paskelbtas.' : 'Straipsnis išsaugotas kaip juodraštis.');
  };

  const deletePost = async (post) => {
    if (!window.confirm(`Ar tikrai ištrinti straipsnį „${post.title}“? Šio veiksmo atšaukti negalėsite.`)) return;
    setDeletingId(post.id);
    setError('');
    const { data, error: deleteError } = await supabase.from('blog_posts').delete().eq('id', post.id).select('id').maybeSingle();
    setDeletingId('');
    if (deleteError) {
      setError(`Straipsnio ištrinti nepavyko: ${deleteError.message}`);
      return;
    }
    if (!data) {
      setError('Straipsnio ištrinti nepavyko: įrašas nerastas arba neturite teisės jo ištrinti.');
      return;
    }
    if (editingId === post.id) resetEditor();
    setPosts((current) => current.filter((item) => item.id !== post.id));
    setNotice('Straipsnis ištrintas.');
  };

  const inputClass = 'mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100';

  return <section className="space-y-5">
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div><h2 className="text-2xl font-bold">Tinklaraščio straipsniai</h2><p className="mt-1 text-sm text-slate-600">Kurti ir tvarkyti viešus DSS Pro straipsnius bei juodraščius.</p></div>
      <a href={BLOG_PATH} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"><Eye size={16} />Atverti tinklaraštį</a>
    </div>
    {error && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}
    {notice && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">{notice}</p>}

    <section id="blog-editor" className="scroll-mt-5 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h3 className="font-bold">{editingId ? 'Redaguoti straipsnį' : 'Naujas straipsnis'}</h3>
        {editingId && <button type="button" className="inline-flex items-center gap-1 text-sm font-semibold text-slate-600 hover:text-slate-900" onClick={resetEditor}><X size={15} />Atšaukti redagavimą</button>}
      </div>
      <form className="grid gap-4 md:grid-cols-2" onSubmit={savePost}>
        <label className="text-sm font-semibold md:col-span-2">Pavadinimas
          <input className={inputClass} value={draft.title} onChange={(event) => updateDraft('title', event.target.value)} minLength={5} maxLength={180} required />
        </label>
        <label className="text-sm font-semibold">Nuorodos dalis (slug)
          <input className={inputClass} value={draft.slug} onChange={(event) => updateDraft('slug', event.target.value)} pattern="[a-z0-9]+(-[a-z0-9]+)*" maxLength={180} placeholder={slugify(draft.title) || 'straipsnio-pavadinimas'} />
          <span className="mt-1 block text-xs font-normal text-slate-500">Adresas: dsspro.lt/tinklarastis/{draft.slug || slugify(draft.title) || 'straipsnio-pavadinimas'}</span>
        </label>
        <label className="text-sm font-semibold">Kategorija
          <input className={inputClass} value={draft.category} onChange={(event) => updateDraft('category', event.target.value)} minLength={2} maxLength={80} required />
        </label>
        <label className="text-sm font-semibold md:col-span-2">Trumpas aprašymas
          <textarea className={inputClass} value={draft.excerpt} onChange={(event) => updateDraft('excerpt', event.target.value)} minLength={20} maxLength={320} rows={2} required />
        </label>
        <label className="text-sm font-semibold md:col-span-2">Straipsnio tekstas
          <textarea className={`${inputClass} font-mono`} value={draft.content} onChange={(event) => updateDraft('content', event.target.value)} minLength={100} maxLength={30000} rows={15} required aria-describedby="blog-markdown-help" />
          <span id="blog-markdown-help" className="mt-1 block text-xs font-normal text-slate-500">Naudokite ## antraštė, - punktas ir [nuorodos tekstas](https://adresas). HTML kodas nevykdomas.</span>
        </label>
        <label className="text-sm font-semibold">SEO pavadinimas
          <input className={inputClass} value={draft.seo_title} onChange={(event) => updateDraft('seo_title', event.target.value)} maxLength={180} placeholder="Jei tuščia, naudojamas straipsnio pavadinimas" />
        </label>
        <label className="text-sm font-semibold">SEO aprašymas
          <textarea className={inputClass} value={draft.seo_description} onChange={(event) => updateDraft('seo_description', event.target.value)} maxLength={320} rows={2} placeholder="Jei tuščia, naudojamas trumpas aprašymas" />
        </label>
        <label className="text-sm font-semibold">Būsena
          <select className={inputClass} value={draft.status} onChange={(event) => updateDraft('status', event.target.value)}>
            <option value="draft">Juodraštis – viešai nematomas</option>
            <option value="published">Paskelbtas – matomas viešai</option>
          </select>
        </label>
        <div className="flex flex-wrap items-center gap-2 self-end md:col-span-2">
          <button type="submit" disabled={saving} className="inline-flex min-h-10 items-center gap-2 rounded-md bg-emerald-800 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-900 disabled:cursor-wait disabled:opacity-60"><Save size={16} />{saving ? 'Saugoma…' : editingId ? 'Išsaugoti pakeitimus' : 'Sukurti straipsnį'}</button>
          {!editingId && <button type="button" className="inline-flex min-h-10 items-center gap-2 rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50" onClick={() => document.getElementById('blog-editor')?.scrollIntoView({ behavior: 'smooth' })}><Plus size={16} />Naujas</button>}
        </div>
      </form>
    </section>

    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
      <h3 className="font-bold">Straipsnių sąrašas</h3>
      {loading && <p role="status" className="py-5 text-sm text-slate-600">Įkeliami straipsniai…</p>}
      {!loading && posts.length === 0 && <p className="py-5 text-sm text-slate-600">Straipsnių nėra. Sukurkite pirmąjį aukščiau.</p>}
      {!loading && posts.length > 0 && <div className="mt-3 divide-y divide-slate-100">
        {posts.map((post) => <article key={post.id} className="flex flex-wrap items-center justify-between gap-3 py-4">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2"><h4 className="font-semibold text-slate-900">{post.title}</h4><span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${post.status === 'published' ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-800'}`}>{post.status === 'published' ? 'Paskelbtas' : 'Juodraštis'}</span></div>
            <p className="mt-1 truncate text-sm text-slate-500">{post.category} · /tinklarastis/{post.slug} · atnaujinta {formatDate(post.updated_at)}</p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {post.status === 'published' && <a href={`${BLOG_PATH}/${encodeURIComponent(post.slug)}`} target="_blank" rel="noreferrer" aria-label={`Peržiūrėti straipsnį: ${post.title}`} className="grid size-9 place-items-center rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50"><Eye size={16} /></a>}
            <button type="button" aria-label={`Redaguoti straipsnį: ${post.title}`} className="grid size-9 place-items-center rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50" onClick={() => editPost(post)}><Pencil size={16} /></button>
            <button type="button" aria-label={`Ištrinti straipsnį: ${post.title}`} disabled={deletingId === post.id} className="grid size-9 place-items-center rounded-md border border-rose-200 text-rose-700 hover:bg-rose-50 disabled:opacity-50" onClick={() => void deletePost(post)}><Trash2 size={16} /></button>
          </div>
        </article>)}
      </div>}
    </section>
  </section>;
}

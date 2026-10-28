// Внешние каталоги: Google Books (основной) и Open Library (запасной).
// Оба бесплатные и работают прямо из браузера, без сервера.
const API = (() => {
  const GB = 'https://www.googleapis.com/books/v1/volumes';
  const OL = 'https://openlibrary.org';
  const OL_FIELDS = 'key,title,subtitle,author_name,first_publish_year,number_of_pages_median,language,cover_i,subject,ebook_access,ratings_average,ratings_count,ia';
  const OL_LANG = { rus: 'ru', eng: 'en', kaz: 'kk' };
  const OL_LANG_BACK = { ru: 'rus', en: 'eng', kk: 'kaz' };
  const colorKeys = Object.keys(COVER_COLORS);

  // Жанр по категориям/темам из API
  function mapGenre(list) {
    const s = (list || []).join(' ').toLowerCase();
    if (/comput|program|software|javascript|python|java\b|game develop|video games|информат|программ/.test(s)) return 'it';
    if (/juvenile|children|детск|picture book/.test(s)) return 'kids';
    if (/mystery|detective|crime|детектив/.test(s)) return 'detective';
    if (/science fiction|fantasy|фантаст|фэнтези/.test(s)) return 'fantasy';
    if (/self-help|psycholog|personal|business|success|motivat|психолог|саморазв/.test(s)) return 'self';
    if (/classic|literature|fiction|классик|роман/.test(s)) return 'classic';
    return null;
  }

  function colorFor(str) {
    let h = 0;
    for (const ch of str) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return colorKeys[h % colorKeys.length];
  }

  function stripHtml(html) {
    const d = document.createElement('div');
    d.innerHTML = html || '';
    return d.textContent.trim();
  }

  async function getJSON(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return res.json();
  }

  // ---------- Google Books ----------
  function fromGoogle(v) {
    const i = v.volumeInfo || {}, a = v.accessInfo || {}, s = v.saleInfo || {};
    const title = i.title || 'Без названия';
    const author = (i.authors || []).join(', ') || 'Автор не указан';
    const img = i.imageLinks ? (i.imageLinks.thumbnail || i.imageLinks.smallThumbnail || '') : '';
    const free = a.accessViewStatus === 'FULL_PUBLIC_DOMAIN' || s.saleability === 'FREE';
    const lang = i.language === 'kk' ? 'kk' : i.language === 'ru' ? 'ru' : i.language === 'en' ? 'en' : i.language;
    const apiLinks = [];
    if (s.buyLink) apiLinks.push({ kind: 'buy', label: 'Купить в Google Play', note: 'Электронная книга', url: s.buyLink });
    if (a.webReaderLink && a.viewability !== 'NO_PAGES') apiLinks.push({ kind: 'read', label: 'Читать в Google Books', note: free ? 'Полный текст бесплатно' : 'Фрагмент книги', url: a.webReaderLink });
    const dl = (a.epub && a.epub.downloadLink) || (a.pdf && a.pdf.downloadLink);
    if (free && dl) apiLinks.push({ kind: 'download', label: 'Скачать', note: 'Открытый доступ · Google Books', url: dl });
    return {
      id: 'gb:' + v.id, source: 'gb', title, subtitle: i.subtitle || '', author,
      year: parseInt(i.publishedDate, 10) || null, pages: i.pageCount || null, lang,
      genre: mapGenre(i.categories), categories: i.categories || [],
      desc: stripHtml(i.description), rating: i.averageRating || null, ratingsCount: i.ratingsCount || 0,
      cover: img ? img.replace('http://', 'https://').replace('&edge=curl', '') : '',
      free, formats: s.isEbook ? ['electronic', 'paper'] : ['paper'],
      color: colorFor(title), apiLinks, infoLink: i.infoLink || ''
    };
  }

  async function searchGoogle(q, opts) {
    let url = GB + '?q=' + encodeURIComponent(q) + '&maxResults=' + Math.min(40, opts.max || CONFIG.apiResults) + '&printType=books';
    if (opts.lang) url += '&langRestrict=' + opts.lang;
    if (opts.free) url += '&filter=free-ebooks';
    if (CONFIG.googleBooksKey) url += '&key=' + CONFIG.googleBooksKey;
    const data = await getJSON(url);
    return (data.items || []).map(fromGoogle);
  }

  async function getGoogle(id) {
    let url = GB + '/' + encodeURIComponent(id);
    if (CONFIG.googleBooksKey) url += '?key=' + CONFIG.googleBooksKey;
    return fromGoogle(await getJSON(url));
  }

  // ---------- Open Library ----------
  function fromOpenLibrary(d) {
    const key = (d.key || '').replace('/works/', '');
    const langs = (d.language || []).map(l => OL_LANG[l]).filter(Boolean);
    const free = d.ebook_access === 'public';
    const apiLinks = [];
    if (d.ebook_access === 'public' || d.ebook_access === 'borrowable') {
      apiLinks.push({ kind: 'read', label: 'Читать в Open Library', note: free ? 'Открытый доступ' : 'Электронная выдача, нужна регистрация', url: OL + '/works/' + key });
    }
    if (free && d.ia && d.ia[0]) apiLinks.push({ kind: 'download', label: 'Скачать', note: 'Открытый доступ · Internet Archive', url: 'https://archive.org/details/' + d.ia[0] });
    return {
      id: 'ol:' + key, source: 'ol', title: d.title || 'Без названия', subtitle: d.subtitle || '',
      author: (d.author_name || []).slice(0, 3).join(', ').replace(/[︠-︣]/g, '').replace(/\s+/g, ' ').trim() || 'Автор не указан',
      year: d.first_publish_year || null, pages: d.number_of_pages_median || null,
      lang: langs.includes('ru') ? 'ru' : (langs[0] || null), langs,
      genre: mapGenre(d.subject), categories: (d.subject || []).slice(0, 3),
      desc: '', rating: d.ratings_average ? Math.round(d.ratings_average * 10) / 10 : null, ratingsCount: d.ratings_count || 0,
      cover: d.cover_i ? 'https://covers.openlibrary.org/b/id/' + d.cover_i + '-L.jpg' : '',
      free, formats: d.ebook_access && d.ebook_access !== 'no_ebook' ? ['electronic', 'paper'] : ['paper'],
      color: colorFor(d.title || key), apiLinks, infoLink: OL + '/works/' + key
    };
  }

  async function searchOpenLibrary(q, opts) {
    let url = OL + '/search.json?q=' + encodeURIComponent(q) + '&limit=' + (opts.max || CONFIG.apiResults) + '&fields=' + OL_FIELDS;
    if (opts.lang && OL_LANG_BACK[opts.lang]) url += '&language=' + OL_LANG_BACK[opts.lang];
    if (opts.free) url += '&ebook_access=public';
    const data = await getJSON(url);
    return (data.docs || []).map(fromOpenLibrary);
  }

  async function getOpenLibrary(key, base) {
    const w = await getJSON(OL + '/works/' + key + '.json');
    const book = base || fromOpenLibrary({ key: '/works/' + key, title: w.title, subject: w.subjects, cover_i: (w.covers || [])[0] });
    const desc = typeof w.description === 'string' ? w.description : (w.description && w.description.value) || '';
    book.desc = desc.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/-{3,}[\s\S]*$/, '').trim();
    if (!book.categories.length && w.subjects) book.categories = w.subjects.slice(0, 3);
    if (!book.genre) book.genre = mapGenre(w.subjects);
    if (!base || book.author === 'Автор не указан') {
      try {
        const keys = (w.authors || []).slice(0, 3).map(x => x.author && x.author.key).filter(Boolean);
        const names = await Promise.all(keys.map(k => getJSON(OL + k + '.json').then(a => a.name)));
        if (names.length) book.author = names.join(', ');
      } catch (e) { /* имя автора не критично */ }
    }
    if (!book.year && w.first_publish_date) book.year = parseInt(w.first_publish_date.match(/\d{4}/), 10) || null;
    return book;
  }

  // ---------- Общий вход ----------
  // Сначала Google Books; если лимит исчерпан или ошибка — Open Library.
  // После ошибки лимита (429) не дёргаем Google Books 5 минут.
  const GB_PAUSE = 'polka:gb-pause';
  const gbPaused = () => { try { return Date.now() < +sessionStorage.getItem(GB_PAUSE); } catch (e) { return false; } };

  async function search(q, opts = {}) {
    if (!gbPaused()) {
      try {
        const items = await searchGoogle(q, opts);
        if (items.length) return { source: 'Google Books', items };
      } catch (e) {
        console.warn('Google Books недоступен:', e.message);
        try { sessionStorage.setItem(GB_PAUSE, Date.now() + 5 * 60 * 1000); } catch (err) { /* без паузы */ }
      }
    }
    const items = await searchOpenLibrary(q, opts);
    return { source: 'Open Library', items };
  }

  async function get(id) {
    const cached = Store.cached(id);
    if (id.startsWith('gb:')) {
      try { return await getGoogle(id.slice(3)); }
      catch (e) { if (cached) return cached; throw e; }
    }
    if (id.startsWith('ol:')) return getOpenLibrary(id.slice(3), cached);
    throw new Error('Неизвестный источник');
  }

  return { search, get, mapGenre };
})();

// Общие функции для всех страниц «Полки».
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function plural(n, one, few, many) {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return few;
  return many;
}

const genreById = id => GENRES.find(g => g.id === id);
const genreName = id => (genreById(id) || {}).name || '';
const bookById = id => BOOKS.find(b => b.id === id);
const bookUrl = b => 'book.html?id=' + encodeURIComponent(b.id);
const fmtRating = r => (r ? Number(r).toFixed(1).replace('.', ',') : '—');

// ---------- Хранилище: избранное (localStorage) и кэш книг из API (sessionStorage) ----------
const Store = (() => {
  const FAV = 'polka:favs';
  function read(storage, key, def) {
    try { const v = storage.getItem(key); return v ? JSON.parse(v) : def; } catch (e) { return def; }
  }
  function write(storage, key, val) {
    try { storage.setItem(key, JSON.stringify(val)); } catch (e) { /* хранилище недоступно */ }
  }
  const favs = () => read(localStorage, FAV, []);
  return {
    favs,
    isFav: id => favs().some(f => f.id === id),
    toggleFav(b) {
      let list = favs();
      const on = !list.some(f => f.id === b.id);
      if (on) list.unshift({ id: b.id, title: b.title, author: b.author, year: b.year, color: b.color, rating: b.rating, genre: b.genre, lang: b.lang, formats: b.formats, free: b.free, source: b.source || 'local' });
      else list = list.filter(f => f.id !== b.id);
      write(localStorage, FAV, list);
      updateFavCount();
      return on;
    },
    clearFavs() { write(localStorage, FAV, []); updateFavCount(); },
    cache: b => { if (b.source) write(sessionStorage, 'polka:b:' + b.id, b); },
    cached: id => read(sessionStorage, 'polka:b:' + id, null)
  };
})();

// ---------- Поиск по своему каталогу ----------
const Search = (() => {
  const STOP = new Set('книга книги книгу книг книжка про о об обо для что чтобы почитать прочитать за на и в во с со по как это мне хочу какую какой нибудь или а the a an of and to about'.split(' '));
  const END = /(иями|ями|ами|ого|его|ому|ему|ыми|ими|ией|ий|ый|ой|ая|яя|ое|ее|ые|ие|ую|юю|ах|ях|ам|ям|ом|ем|ов|ев|ей|ть|у|ю|а|я|ы|и|е|о|ь|ing|es|s)$/;

  const norm = s => (s || '').toLowerCase().replace(/ё/g, 'е').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  function stem(w) {
    if (w.length <= 3) return w;
    const s = w.replace(END, '');
    return s.length >= 3 ? s : w;
  }
  const words = s => norm(s).split(' ').filter(Boolean);
  const queryStems = q => words(q).filter(w => !STOP.has(w)).map(stem);
  const cleanQuery = q => words(q).filter(w => !STOP.has(w)).join(' ');

  // Индекс: для каждой книги — поля с весами
  const index = new Map();
  function fieldsOf(b) {
    if (index.has(b.id)) return index.get(b.id);
    const extra = [genreName(b.genre), ...(b.collections || []).map(c => COLLECTIONS[c])];
    if (b.pages && b.pages <= 200) extra.push('короткая вечер быстро');
    if (b.free) extra.push('бесплатно бесплатная');
    const f = [
      [10, words(b.title)],
      [7, words(b.author)],
      [4, words((b.tags || []).join(' ') + ' ' + extra.join(' '))],
      [3, words(b.subtitle)],
      [2, words(b.desc + ' ' + (b.summary || '') + ' ' + (b.audience || []).join(' '))],
      [1, words((b.chapters || []).map(c => c.join(' ')).join(' '))]
    ].map(([w, list]) => [w, list.map(stem)]);
    index.set(b.id, f);
    return f;
  }

  function score(b, stems, q) {
    if (!stems.length) return 0;
    const f = fieldsOf(b);
    let total = 0, matched = 0;
    for (const qs of stems) {
      let best = 0;
      for (const [w, list] of f) {
        if (w <= best) continue;
        if (list.some(t => t.startsWith(qs) || (t.length >= 4 && qs.startsWith(t)))) best = w;
      }
      if (best) { matched++; total += best; }
    }
    if (matched < Math.ceil(stems.length / 2)) return 0;
    let s = total * (matched / stems.length);
    if (norm(b.title).includes(norm(q))) s += 25;
    return s;
  }

  function local(q, list = BOOKS) {
    const stems = queryStems(q);
    return list.map(b => ({ book: b, score: score(b, stems, q) }))
      .filter(r => r.score > 0)
      .sort((a, b) => b.score - a.score || b.book.pop - a.book.pop)
      .map(r => r.book);
  }

  // Ключ для поиска дублей между своим каталогом и API
  const dedupeKey = b => norm(b.title).replace(/\s+/g, '').slice(0, 24) + '|' + (words(b.author).slice(-1)[0] || '').slice(0, 5);

  return { local, norm, cleanQuery, dedupeKey };
})();

// ---------- Ссылки «Где взять» ----------
function linksFor(b) {
  const q = b.title + ' ' + (b.author || '');
  // Книги из базы: кнопки берутся из таблицы book_links
  if (!b.source && b.links && b.links.length) {
    return b.links.filter(l => STORES[l.store]).map(l => {
      const s = STORES[l.store];
      const label = l.kind === 'buy' ? 'Купить в ' + s.name : l.kind === 'download' ? 'Скачать' : b.free ? 'Читать бесплатно' : 'Читать онлайн';
      return { kind: l.kind, label, note: l.note, url: l.url || s.url(l.store === b.freeSource ? (b.freeQuery || q) : q) };
    });
  }
  const out = [];
  const fm = b.formats || ['paper'];
  if (b.source) out.push(...(b.apiLinks || []).filter(l => l.kind === 'buy'));
  if (fm.includes('electronic') || b.source) out.push({ kind: 'buy', label: 'Купить в Литрес', note: 'Электронная книга', url: STORES.litres.url(q) });
  if (fm.includes('paper') || b.source) {
    out.push({ kind: 'buy', label: 'Купить в Meloman', note: 'Бумажная книга · Казахстан', url: STORES.meloman.url(q) });
    out.push({ kind: 'buy', label: 'Купить в Marwin', note: 'Бумажная книга · Казахстан', url: STORES.marwin.url(q) });
  }
  if (b.source) {
    const read = (b.apiLinks || []).filter(l => l.kind !== 'buy');
    if (read.length) out.push(...read);
    else out.push({ kind: 'read', label: 'Читать онлайн', note: 'Фрагмент или подписка в магазине', url: STORES.litres.url(q) });
  } else if (b.free && b.freeSource) {
    const src = STORES[b.freeSource];
    out.push({ kind: 'read', label: 'Читать бесплатно', note: 'Открытый доступ · ' + src.name, url: src.url(b.freeQuery || q) });
    out.push({ kind: 'download', label: 'Скачать', note: 'Проверенный источник · ' + src.name, url: src.url(b.freeQuery || q) });
  } else {
    out.push({ kind: 'read', label: 'Читать онлайн', note: 'Фрагмент или подписка в магазине', url: STORES.litres.url(q) });
  }
  return out;
}

// ---------- Иконки ----------
const ICONS = {
  star: '<path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8L3.5 9.7l5.9-.9z"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2"/>',
  code: '<path d="M9 7l-5 5 5 5M15 7l5 5-5 5"/>',
  trend: '<path d="M3.5 17l6-6 4 4 7-7.5M15 7.5h5.5V13"/>',
  smile: '<circle cx="12" cy="12" r="8.5"/><path d="M8.5 14c.9 1.3 2 2 3.5 2s2.6-.7 3.5-2M9 9.5h.01M15 9.5h.01"/>',
  book: '<path d="M5 4.5h10a3 3 0 013 3v12H8a3 3 0 01-3-3z"/><path d="M5 16.5a3 3 0 013-3h10"/>',
  bookmark: '<path d="M6.5 4h11v16l-5.5-4-5.5 4z"/>',
  share: '<path d="M12 15V4M8 8l4-4 4 4M5 13v6h14v-6"/>',
  arrow: '<path d="M7 17L17 7M9 7h8v8"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  filter: '<path d="M4 6h16M7 12h10M10 18h4"/>'
};
const icon = (name, cls = '') => '<svg class="ic ' + cls + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + ICONS[name] + '</svg>';

const LOGO = '<a class="logo" href="index.html" aria-label="Полка — на главную"><svg viewBox="0 0 30 24" aria-hidden="true"><rect x="0" y="1" width="5" height="22" rx="1" fill="#16171B"/><rect x="7.5" y="1" width="5" height="22" rx="1" fill="#2F4BFF"/><path d="M16 2.2l4.6-1.3 6.4 21.6-4.7 1.3z" fill="#16171B"/></svg><span>Полка</span></a>';

// ---------- Обложка и карточки ----------
const registry = new Map(); // книги из API, показанные на странице (для кэша при переходе)

function coverHTML(b, opts = {}) {
  const [bg, fg] = COVER_COLORS[b.color] || COVER_COLORS.blue;
  const title = b.title.length > 60 ? b.title.slice(0, 57) + '…' : b.title;
  // Размер шрифта — по общей длине; самое длинное слово (--w) ограничивает его по ширине обложки
  const len = title.length;
  const word = Math.max(...title.split(/[\s-]+/).map(w => w.length));
  const size = len > 32 ? ' cover--long' : len > 18 ? ' cover--mid' : '';
  const badge = opts.badge && b.formats ? '<span class="cover-badge">' + FORMATS[b.formats[0]] + '</span>' : '';
  const sub = opts.subtitle && b.subtitle ? '<span class="cover-sub">' + esc(b.subtitle) + '</span>' : '';
  return '<div class="cover' + size + (opts.big ? ' cover--big' : '') + '" style="--bg:' + bg + ';--fg:' + fg + '">' +
    '<div class="cover-top"><span class="cover-author">' + esc(b.author) + '</span>' + badge + '</div>' +
    '<div class="cover-bottom"><span class="cover-title" style="--w:' + Math.max(word, 6) + '">' + esc(title) + '</span>' + sub + '</div></div>';
}

// variant: 'row' (главная) | 'grid' (результаты) | 'mini'
function cardHTML(b, variant = 'row') {
  if (b.source) registry.set(b.id, b);
  const meta = variant === 'grid'
    ? '<div class="card-author">' + esc(b.author) + '</div><div class="card-meta">' + (b.year || '—') + ' <span class="dot">·</span> <span class="star">★</span> ' + fmtRating(b.rating) + (b.free ? ' <span class="free-tag">бесплатно</span>' : '') + '</div>'
    : '<div class="card-meta">' + esc(b.author) + (b.year && variant === 'row' ? ' · ' + b.year : '') + '</div>';
  return '<article class="card card--' + variant + '"><a class="card-link" href="' + bookUrl(b) + '" data-id="' + esc(b.id) + '">' +
    coverHTML(b, { badge: variant === 'grid' }) + '<h3 class="card-title">' + esc(b.title) + '</h3></a>' + meta + '</article>';
}

document.addEventListener('click', e => {
  const a = e.target.closest('a[data-id]');
  if (a && registry.has(a.dataset.id)) Store.cache(registry.get(a.dataset.id));
});

// ---------- Шапка и подвал ----------
function renderHeader(variant, q = '') {
  const el = $('#site-header');
  const favBtn = '<a class="icon-btn fav-link" href="search.html?fav=1" aria-label="Избранное" title="Избранное">' + icon('bookmark') + '<span class="fav-count" hidden></span></a>';
  const login = '<span class="user-slot"></span>';
  if (variant === 'home') {
    el.innerHTML = '<div class="container header-row">' + LOGO +
      '<nav class="main-nav"><a href="search.html">Каталог</a><a href="index.html#picker">Подбери мне книгу</a><a href="search.html?col=itgd">IT и геймдев</a><a href="search.html?access=free">Бесплатно</a></nav>' +
      '<div class="header-actions">' + favBtn + login + '</div></div>';
  } else {
    el.innerHTML = '<div class="container header-row">' + LOGO +
      '<form class="search-box search-box--header" action="search.html" role="search">' + icon('search', 'search-ic') +
      '<input type="search" name="q" value="' + esc(q) + '" placeholder="Название, автор или о чём книга" aria-label="Поиск книг" autocomplete="off">' +
      '<button class="btn btn-blue" type="submit">Найти</button></form>' +
      '<div class="header-actions">' + favBtn + login + '</div></div>';
    el.classList.add('site-header--inner');
  }
  renderUserSlot();
  updateFavCount();
  if (!renderHeader.hooked && typeof DB !== 'undefined') {
    renderHeader.hooked = true;
    DB.onAuth(() => { renderUserSlot(); updateFavCount(); });
  }
}

// «Войти» или имя пользователя в шапке
function renderUserSlot() {
  const user = typeof DB !== 'undefined' && DB.user;
  const name = user && DB.profile ? DB.profile.display_name : '';
  $$('.user-slot').forEach(s => {
    s.innerHTML = user
      ? '<a class="user-chip" href="account.html" title="Мой профиль"><span class="avatar">' + esc(name.charAt(0).toUpperCase() || '?') + '</span><span class="user-name">' + esc(name) + '</span></a>'
      : '<a class="btn btn-dark btn-sm" href="account.html">Войти</a>';
  });
}

function updateFavCount() {
  const show = n => $$('.fav-count').forEach(s => { s.textContent = n; s.hidden = !n; });
  if (typeof DB !== 'undefined' && DB.user) DB.shelf().then(list => show(list.filter(r => r.is_favorite).length), () => show(0));
  else show(Store.favs().length);
}

function renderFooter() {
  $('#site-footer').innerHTML = '<div class="container footer-row"><p><b>Полка</b> — поиск книг. Мы не продаём и не храним книги: цена и наличие — в магазине.</p>' +
    '<nav><a href="#" data-modal="about">О проекте</a><a href="#" data-modal="rights">Правообладателям</a><a href="' + CONFIG.telegram + '" target="_blank" rel="noopener">Telegram</a></nav></div>';
}

const MODALS = {
  about: ['О проекте', '<p>«Полка» — поисковик по книгам. Мы помогаем найти книгу, понять, о чём она, и перейти в магазин или к легальному бесплатному источнику.</p><p>Каталог собран вручную, а если книги в нём нет — поиск идёт по Google Books и Open Library. Описания, пересказы и «для кого книга» написаны своими словами.</p>'],
  rights: ['Правообладателям', '<p>Мы не храним и не распространяем тексты книг. На сайте есть только факты о книге (название, автор, год, список глав), собственные описания и ссылки на магазины.</p><p>Кнопка «Скачать» появляется только у книг в открытом доступе и ведёт на сторонние проверенные источники. Если вы считаете, что ссылка нарушает ваши права, напишите нам в Telegram — мы уберём её.</p>']
};

function openModal(title, html) {
  let m = $('#modal');
  if (!m) {
    m = document.createElement('div');
    m.id = 'modal';
    m.className = 'modal';
    m.innerHTML = '<div class="modal-box" role="dialog" aria-modal="true" aria-labelledby="modal-title"><button class="modal-close icon-btn" type="button" aria-label="Закрыть">' + icon('x') + '</button><h2 id="modal-title"></h2><div class="modal-body"></div></div>';
    document.body.appendChild(m);
    m.addEventListener('click', e => { if (e.target === m || e.target.closest('.modal-close')) m.classList.remove('open'); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') m.classList.remove('open'); });
  }
  $('#modal-title', m).textContent = title;
  $('.modal-body', m).innerHTML = html;
  m.classList.add('open');
  $('.modal-close', m).focus();
}

document.addEventListener('click', e => {
  const t = e.target.closest('[data-modal]');
  if (!t) return;
  e.preventDefault();
  const [title, html] = MODALS[t.dataset.modal];
  openModal(title, html);
});

function toast(msg) {
  let t = $('#toast');
  if (!t) { t = document.createElement('div'); t.id = 'toast'; t.className = 'toast'; t.setAttribute('role', 'status'); document.body.appendChild(t); }
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._h);
  t._h = setTimeout(() => t.classList.remove('show'), 2400);
}

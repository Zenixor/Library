// Страница книги
const bookId = new URLSearchParams(location.search).get('id') || '';
const root = $('#book');
let current = null;
let myReview = null;

const SOURCE_NAME = { gb: 'Google Books', ol: 'Open Library' };
const STATUS = { want: 'Хочу прочитать', reading: 'Читаю', read: 'Прочитано' };
const cap = s => (s ? s.charAt(0).toUpperCase() + s.slice(1) : '');
const nextUrl = () => 'account.html?next=' + encodeURIComponent(location.pathname.split('/').pop() + location.search);
const fmtDate = d => new Date(d).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
const stars = n => '★★★★★'.slice(0, n) + '<span class="stars-off">' + '★★★★★'.slice(n) + '</span>';

function coverBlock(b) {
  if (b.source && b.cover) {
    return '<img class="cover-img" src="' + esc(b.cover) + '" alt="Обложка книги «' + esc(b.title) + '»" data-fallback>' +
      '<p class="cover-caption">Обложка — через ' + SOURCE_NAME[b.source] + ' API</p>';
  }
  return coverHTML(b, { big: true, subtitle: true }) +
    '<p class="cover-caption">' + (b.source ? 'Обложки в ' + SOURCE_NAME[b.source] + ' нет — оригинал в магазине' : 'Оригинальная обложка — на странице магазина') + '</p>';
}

function whereBlock(b) {
  const links = linksFor(b);
  const firstBuy = links.findIndex(l => l.kind === 'buy');
  const lastRead = links.map(l => l.kind).lastIndexOf('read');
  const rows = links.map((l, i) => {
    let cls = '';
    if (i === firstBuy) cls = ' where-btn--primary';
    else if (l.kind === 'download') cls = ' where-btn--free';
    else if (l.kind === 'read' && i === lastRead) cls = b.free ? ' where-btn--free' : ' where-btn--ghost';
    return '<a class="where-btn' + cls + '" href="' + esc(l.url) + '" target="_blank" rel="noopener nofollow"><span><b>' + esc(l.label) + '</b><small>' + esc(l.note) + '</small></span>' + icon('arrow') + '</a>';
  }).join('');
  return '<div class="where"><div class="where-head"><h2>Где взять</h2><span>Цена — в магазине</span></div><div class="where-list">' + rows + '</div>' +
    '<p class="where-note">' + (b.free ? 'Эта книга в открытом доступе — её можно легально скачать из проверенного источника.' : 'Кнопка «Скачать» появляется только у бесплатных книг из открытого доступа.') + '</p></div>';
}

function similarLocal(b) {
  const tags = new Set(b.tags || []);
  return BOOKS.filter(x => x.id !== b.id && x.lang !== 'kk').map(x => {
    let s = 0;
    if (x.genre === b.genre) s += 3;
    if (x.author === b.author) s += 3;
    (x.tags || []).forEach(t => { if (tags.has(t)) s += 2; });
    (x.collections || []).forEach(c => { if ((b.collections || []).includes(c)) s += 1; });
    return { x, s };
  }).filter(r => r.s > 0).sort((a, c) => c.s - a.s || c.x.pop - a.x.pop).slice(0, 6).map(r => r.x);
}

function render(b) {
  current = b;
  document.title = b.title + ' — ' + b.author + ' — Полка';
  const g = genreById(b.genre);
  const extraTag = b.source ? (b.categories || [])[0] : (b.tags || [])[0];
  const tags = (g ? '<a class="tag tag--blue" href="search.html?genre=' + g.id + '">' + esc(g.name) + '</a>' : '') +
    (extraTag ? '<span class="tag">' + esc(cap(extraTag)) + '</span>' : '') +
    (b.free ? '<span class="tag tag--green">Бесплатно</span>' : '');
  const fact = (label, val, id) => '<div class="fact"' + (id ? ' id="' + id + '"' : '') + '><small>' + label + '</small><b>' + esc(val || '—') + '</b></div>';
  const langName = LANGS[b.lang] || (b.lang ? b.lang.toUpperCase() : '—');
  const desc = b.desc || 'Описания пока нет. Подробности — на странице книги в магазине.';
  const long = desc.length > 600;
  const fav = !DB.user && Store.isFav(b.id);

  let info = '';
  if (b.summary || (b.audience && b.audience.length)) {
    info = '<section class="info-cards">' +
      (b.summary ? '<div class="info-card info-card--yellow"><p class="eyebrow">Коротко за 1 минуту</p><p>' + esc(b.summary) + '</p></div>' : '') +
      (b.audience && b.audience.length ? '<div class="info-card info-card--blue"><p class="eyebrow">Для кого и что узнаешь</p><ul class="checklist">' + b.audience.map(a => '<li>' + esc(a) + '</li>').join('') + '</ul></div>' : '') +
      '</section>';
  }

  const ch = b.chapters || [];
  const toc = '<section><div class="toc-head"><h2 class="section-title">Содержание</h2><span>' + (ch.length ? ch.length + ' ' + plural(ch.length, 'глава', 'главы', 'глав') : '') + '</span></div>' +
    (ch.length
      ? '<div class="toc">' + ch.map((c, i) => '<div class="toc-item"><span class="toc-num">' + String(i + 1).padStart(2, '0') + '</span><div><b>' + esc(c[0]) + '</b>' + (c[1] ? '<small>' + esc(c[1]) + '</small>' : '') + '</div></div>').join('') + '</div>'
      : '<p class="toc-empty">Содержания для этой книги пока нет — ' + (b.source ? SOURCE_NAME[b.source] + ' не отдаёт список глав. Его можно посмотреть на странице книги в магазине.' : 'скоро добавим.') + '</p>') +
    '</section>';

  const shelfRow = DB.enabled
    ? '<div class="shelf-row"><span class="shelf-label">Моя полка:</span>' +
      Object.entries(STATUS).map(([k, t]) => '<button class="btn btn-outline btn-sm" type="button" data-status="' + k + '" aria-pressed="false">' + t + '</button>').join('') + '</div>'
    : '';

  root.innerHTML =
    '<nav class="breadcrumbs" aria-label="Навигация"><a href="index.html">Главная</a><span>/</span>' +
    (g ? '<a href="search.html?genre=' + g.id + '">' + esc(g.name) + '</a><span>/</span>' : '<a href="search.html">Каталог</a><span>/</span>') +
    '<b>' + esc(b.title) + '</b></nav>' +
    '<section class="book-top"><div class="book-cover">' + coverBlock(b) + '</div><div>' +
      '<div class="tags">' + tags + '</div>' +
      '<h1 class="book-title">' + esc(b.title) + '</h1>' +
      '<p class="book-author">' + esc(b.author) + '</p>' +
      '<div class="facts">' + fact('Год', b.year) + fact('Страниц', b.pages) + fact('Язык', langName) + fact('Рейтинг', b.rating ? '★ ' + fmtRating(b.rating) : '', 'fact-rating') + '</div>' +
      '<p class="book-desc' + (long ? ' clamped' : '') + '" id="desc">' + esc(desc) + '</p>' +
      (long ? '<button class="link-btn more-btn" type="button" id="more">Читать полностью</button>' : '') +
      whereBlock(b) +
      '<div class="book-actions">' +
        '<button class="btn btn-outline btn-sm' + (fav ? ' is-on' : '') + '" type="button" id="fav" aria-pressed="' + fav + '">' + icon('bookmark') + '<span>' + (fav ? 'В избранном' : 'В избранное') + '</span></button>' +
        '<button class="btn btn-outline btn-sm" type="button" id="share">' + icon('share') + 'Поделиться</button>' +
      '</div>' + shelfRow +
    '</div></section>' +
    info + toc +
    (DB.enabled ? '<section class="section reviews" id="reviews"><div class="section-head"><h2 class="section-title">Отзывы читателей</h2><span class="reviews-summary" id="reviews-summary"></span></div><div class="reviews-layout"><div id="review-form"></div><div id="review-list"><div class="spinner"></div></div></div></section>' : '') +
    '<section class="section" id="similar-wrap" hidden><div class="section-head"><h2 class="section-title">Похожие книги</h2></div><div class="book-row" id="similar"></div></section>';

  const img = $('img[data-fallback]', root);
  if (img) img.addEventListener('error', () => { img.parentElement.innerHTML = coverHTML(b, { big: true, subtitle: true }) + '<p class="cover-caption">Оригинальная обложка — на странице магазина</p>'; });
  const more = $('#more');
  if (more) more.addEventListener('click', () => { $('#desc').classList.remove('clamped'); more.remove(); });
  $('#fav').addEventListener('click', toggleFav);
  $('#share').addEventListener('click', share);
  $$('[data-status]', root).forEach(btn => btn.addEventListener('click', () => setStatus(btn.dataset.status)));

  syncShelf();
  loadReviews();
  renderSimilar(b);
}

// ---------- Полка ----------
function paintShelf(item) {
  const fav = item ? item.is_favorite : (!DB.user && Store.isFav(current.id));
  const btn = $('#fav');
  btn.classList.toggle('is-on', fav);
  btn.setAttribute('aria-pressed', String(fav));
  $('span', btn).textContent = fav ? 'В избранном' : 'В избранное';
  $$('[data-status]', root).forEach(s => {
    const on = !!item && item.status === s.dataset.status;
    s.classList.toggle('is-on', on);
    s.setAttribute('aria-pressed', String(on));
  });
}

async function syncShelf() {
  if (!DB.user) return paintShelf(null);
  try { paintShelf(await DB.shelfItem(current.id)); } catch (e) { console.warn(e.message); }
}

async function toggleFav() {
  if (!DB.user) {
    const on = Store.toggleFav(current);
    paintShelf(null);
    toast(on ? (DB.enabled ? 'Сохранено в браузере. Войдите, чтобы избранное было в аккаунте' : 'Добавлено в избранное') : 'Убрано из избранного');
    return;
  }
  const btn = $('#fav');
  btn.disabled = true;
  try {
    const cur = await DB.shelfItem(current.id);
    const on = !(cur && cur.is_favorite);
    paintShelf(await DB.setShelf(current, { is_favorite: on }));
    toast(on ? 'Добавлено в избранное' : 'Убрано из избранного');
  } catch (e) { toast('Не получилось: ' + e.message); }
  btn.disabled = false;
}

async function setStatus(status) {
  if (!DB.user) { location.href = nextUrl(); return; }
  try {
    const cur = await DB.shelfItem(current.id);
    const next = cur && cur.status === status ? null : status;
    paintShelf(await DB.setShelf(current, { status: next }));
    toast(next ? 'На полке: «' + STATUS[next] + '»' : 'Убрано с полки');
  } catch (e) { toast('Не получилось: ' + e.message); }
}

// ---------- Отзывы ----------
async function loadReviews() {
  if (!DB.enabled) return;
  let data;
  try { data = await DB.reviews(current.id); }
  catch (e) { $('#review-list').innerHTML = '<p class="muted">Отзывы сейчас не загрузились.</p>'; return; }

  myReview = data.list.find(r => r.mine) || null;
  $('#reviews-summary').innerHTML = data.count ? '<span class="star">★</span> ' + fmtRating(data.avg) + ' · ' + data.count + ' ' + plural(data.count, 'оценка', 'оценки', 'оценок') : '';
  if (data.count) {
    $('#fact-rating').innerHTML = '<small>Рейтинг читателей</small><b>★ ' + fmtRating(data.avg) + '</b>';
  }

  $('#review-list').innerHTML = data.list.length
    ? data.list.map(r => '<article class="review' + (r.mine ? ' review--mine' : '') + '"><div class="review-head"><span class="avatar">' + esc(r.name.charAt(0).toUpperCase()) + '</span><div><b>' + esc(r.name) + (r.mine ? ' <span class="tag">Ваш отзыв</span>' : '') + '</b><small>' + fmtDate(r.created_at) + '</small></div><span class="stars">' + stars(r.rating) + '</span></div>' + (r.body ? '<p>' + esc(r.body) + '</p>' : '') + '</article>').join('')
    : '<div class="reviews-empty"><b>Отзывов пока нет</b><p>Станьте первым, кто оценит эту книгу.</p></div>';

  renderReviewForm();
}

function renderReviewForm() {
  const box = $('#review-form');
  if (!DB.user) {
    box.innerHTML = '<div class="review-card"><h3>Оцените книгу</h3><p class="muted">Войдите, чтобы поставить оценку и написать отзыв. Это бесплатно.</p><a class="btn btn-dark btn-sm" href="' + nextUrl() + '">Войти или создать аккаунт</a></div>';
    return;
  }
  const r = myReview;
  box.innerHTML = '<form class="review-card" id="rform"><h3>' + (r ? 'Ваш отзыв' : 'Оцените книгу') + '</h3>' +
    '<div class="star-input" role="radiogroup" aria-label="Оценка">' + [1, 2, 3, 4, 5].map(n => '<button type="button" class="star-btn" data-n="' + n + '" role="radio" aria-checked="false" aria-label="' + n + ' из 5">★</button>').join('') + '</div>' +
    '<label class="field"><span>Отзыв <small>(по желанию)</small></span><textarea name="body" rows="4" maxlength="2000" placeholder="Чем книга понравилась или не понравилась?">' + esc(r ? r.body : '') + '</textarea></label>' +
    '<p class="form-msg" id="rmsg" role="alert"></p>' +
    '<div class="form-actions"><button class="btn btn-dark btn-sm" type="submit">' + (r ? 'Сохранить' : 'Опубликовать') + '</button>' + (r ? '<button class="link-btn" type="button" id="rdel">Удалить отзыв</button>' : '') + '</div></form>';

  let rating = r ? r.rating : 0;
  const paint = n => $$('.star-btn', box).forEach(s => { const on = +s.dataset.n <= n; s.classList.toggle('on', on); s.setAttribute('aria-checked', String(+s.dataset.n === rating)); });
  paint(rating);
  $$('.star-btn', box).forEach(s => {
    s.addEventListener('click', () => { rating = +s.dataset.n; paint(rating); });
    s.addEventListener('mouseenter', () => paint(+s.dataset.n));
  });
  $('.star-input', box).addEventListener('mouseleave', () => paint(rating));

  $('#rform').addEventListener('submit', async e => {
    e.preventDefault();
    const msg = $('#rmsg');
    if (!rating) { msg.textContent = 'Выберите оценку от 1 до 5 звёзд'; return; }
    const btn = $('button[type=submit]', e.target);
    btn.disabled = true;
    try {
      await DB.saveReview(current, rating, e.target.body.value.trim(), r && r.id);
      toast(r ? 'Отзыв обновлён' : 'Спасибо за отзыв!');
      loadReviews();
    } catch (err) { msg.textContent = 'Не получилось сохранить: ' + err.message; btn.disabled = false; }
  });
  const del = $('#rdel');
  if (del) del.addEventListener('click', async () => {
    if (!confirm('Удалить ваш отзыв?')) return;
    try { await DB.deleteReview(r.id); toast('Отзыв удалён'); loadReviews(); } catch (err) { toast('Не получилось: ' + err.message); }
  });
}

// ---------- Похожие ----------
function showSimilar(list) {
  if (!list.length) return;
  $('#similar').innerHTML = list.slice(0, 6).map(x => cardHTML(x, 'mini')).join('');
  $('#similar-wrap').hidden = false;
}

async function renderSimilar(b) {
  const local = similarLocal(b);
  showSimilar(local);
  if (!b.source || local.length >= 6) return;
  try {
    const res = await API.search(b.author.split(',')[0], { max: 10 });
    if (current !== b) return;
    const keys = new Set([Search.dedupeKey(b), ...local.map(Search.dedupeKey)]);
    const ext = res.items.filter(x => { const k = Search.dedupeKey(x); if (keys.has(k)) return false; keys.add(k); return true; });
    showSimilar(local.concat(ext));
  } catch (e) { /* похожие — не главное */ }
}

async function share() {
  const data = { title: current.title + ' — Полка', text: current.title + ', ' + current.author, url: location.href };
  try {
    if (navigator.share) { await navigator.share(data); return; }
    await navigator.clipboard.writeText(location.href);
    toast('Ссылка скопирована');
  } catch (e) {
    if (e.name !== 'AbortError') toast('Не удалось скопировать ссылку');
  }
}

function notFound(msg) {
  root.innerHTML = '<div class="empty" style="padding:120px 16px"><h3>' + esc(msg) + '</h3><p>Попробуйте найти её через поиск.</p><p><a class="btn btn-dark btn-sm" href="search.html">Открыть каталог</a></p></div>';
}

boot(async () => {
  renderHeader('inner');
  renderFooter();
  DB.onAuth((user, event) => { if (current && event !== 'SHELF') { syncShelf(); loadReviews(); } });

  const local = bookById(bookId);
  if (local) { render(local); DB.trackView(local.id); return; }
  if (!/^(gb|ol):/.test(bookId)) return notFound('Книга не найдена');
  const cached = Store.cached(bookId);
  if (cached) render(cached);
  try {
    const full = await API.get(bookId);
    Store.cache(full);
    render(full);
  } catch (e) {
    if (!cached) notFound('Не удалось загрузить книгу');
  }
});

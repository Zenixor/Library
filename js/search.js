// Страница результатов: свой каталог + Google Books / Open Library, фильтры, сортировка, страницы
const ALL_FORMATS = Object.keys(FORMATS);
const SUBJECTS = { fantasy: 'fantasy', detective: 'detective', it: 'computers', self: 'self-help', kids: 'juvenile fiction', classic: 'classics' };

const state = readState();
const api = { key: '', status: 'idle', source: '', items: [] };

function readState() {
  const p = new URLSearchParams(location.search);
  const list = k => (p.get(k) || '').split(',').filter(Boolean);
  return {
    q: (p.get('q') || '').trim(),
    genre: list('genre'),
    lang: list('lang'),
    from: p.get('from') || '',
    to: p.get('to') || '',
    access: p.get('access') || 'all',
    format: p.has('format') ? list('format') : ALL_FORMATS.slice(),
    sort: p.get('sort') || 'pop',
    page: Math.max(1, parseInt(p.get('page'), 10) || 1),
    col: p.get('col') || '',
    fav: p.get('fav') === '1'
  };
}

function writeState() {
  const p = new URLSearchParams();
  if (state.q) p.set('q', state.q);
  if (state.fav) p.set('fav', '1');
  if (state.col) p.set('col', state.col);
  if (state.genre.length) p.set('genre', state.genre.join(','));
  if (state.lang.length) p.set('lang', state.lang.join(','));
  if (state.from) p.set('from', state.from);
  if (state.to) p.set('to', state.to);
  if (state.access !== 'all') p.set('access', state.access);
  if (state.format.length !== ALL_FORMATS.length) p.set('format', state.format.join(','));
  if (state.sort !== 'pop') p.set('sort', state.sort);
  if (state.page > 1) p.set('page', state.page);
  const qs = p.toString();
  history.replaceState(null, '', qs ? '?' + qs : location.pathname);
}

// ---------- Исходный список ----------
let accountFavs = null; // избранное из аккаунта, если пользователь вошёл

function baseList() {
  if (state.fav && accountFavs) return accountFavs;
  if (state.fav) return Store.favs().map(f => bookById(f.id) || Store.cached(f.id) || f);
  let list = state.q ? Search.local(state.q) : BOOKS.slice().sort((a, b) => b.pop - a.pop);
  if (state.col) list = list.filter(b => (b.collections || []).includes(state.col));
  return list;
}

function apiQuery() {
  if (state.fav || state.col) return null;
  if (state.q) return Search.cleanQuery(state.q) || state.q;
  if (state.genre.length) return 'subject:' + SUBJECTS[state.genre[0]];
  if (state.access === 'free') return 'subject:classics';
  return null;
}

async function loadApi() {
  const q = apiQuery();
  const lang = state.lang.length === 1 ? state.lang[0] : '';
  const key = q ? [q, lang, state.access === 'free'].join('|') : '';
  if (key === api.key) return;
  api.key = key;
  api.items = [];
  if (!q) { api.status = 'idle'; return; }
  api.status = 'loading';
  render();
  try {
    const res = await API.search(q, { lang, free: state.access === 'free' });
    if (api.key !== key) return; // запрос устарел
    const subjGenre = q.startsWith('subject:') ? state.genre[0] : null;
    api.items = res.items.map(b => (subjGenre && !b.genre ? Object.assign(b, { genre: subjGenre }) : b));
    api.source = res.source;
    api.status = 'done';
  } catch (e) {
    if (api.key !== key) return;
    api.status = 'error';
  }
  render();
}

// ---------- Фильтры ----------
function passes(b) {
  if (state.genre.length && !state.genre.includes(b.genre)) return false;
  if (state.lang.length) {
    const langs = b.langs && b.langs.length ? b.langs : [b.lang];
    if (!langs.some(l => state.lang.includes(l))) return false;
  }
  const from = parseInt(state.from, 10), to = parseInt(state.to, 10);
  if ((from || to) && !b.year) return false;
  if (from && b.year < from) return false;
  if (to && b.year > to) return false;
  if (state.access === 'free' && !b.free) return false;
  if (state.access === 'paid' && b.free) return false;
  if (state.format.length && state.format.length < ALL_FORMATS.length && !(b.formats || []).some(f => state.format.includes(f))) return false;
  return true;
}

function results() {
  const local = baseList();
  const seen = new Set(local.map(Search.dedupeKey));
  const ext = api.items.filter(b => {
    const k = Search.dedupeKey(b);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  let list = local.concat(ext).filter(passes);
  if (state.sort === 'rating') list = list.slice().sort((a, b) => (b.rating || 0) - (a.rating || 0));
  if (state.sort === 'new') list = list.slice().sort((a, b) => (b.year || 0) - (a.year || 0));
  return list;
}

// ---------- Отрисовка ----------
function checkboxes(el, entries, key) {
  el.innerHTML = entries.map(([v, label]) => '<label class="check"><input type="checkbox" value="' + v + '"' + (state[key].includes(v) ? ' checked' : '') + '> ' + esc(label) + '</label>').join('');
}

function renderFilters() {
  checkboxes($('#f-genre'), GENRES.map(g => [g.id, g.name]), 'genre');
  checkboxes($('#f-lang'), Object.entries(LANGS), 'lang');
  checkboxes($('#f-format'), Object.entries(FORMATS), 'format');
  $('#f-from').value = state.from;
  $('#f-to').value = state.to;
  $$('#f-access button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.v === state.access)));
  $$('#sort button').forEach(b => b.classList.toggle('is-on', b.dataset.v === state.sort));
  const n = state.genre.length + state.lang.length + (state.from || state.to ? 1 : 0) + (state.access !== 'all' ? 1 : 0) + (state.format.length < ALL_FORMATS.length ? 1 : 0);
  $('#filters-toggle').innerHTML = icon('filter') + ' Фильтры' + (n ? ' · ' + n : '');
}

function chips() {
  const out = [];
  if (state.fav) out.push(['fav', 'Избранное']);
  if (state.col) out.push(['col', COLLECTIONS[state.col] || state.col]);
  state.genre.forEach(g => out.push(['genre:' + g, genreName(g)]));
  state.lang.forEach(l => out.push(['lang:' + l, LANGS[l]]));
  if (state.from || state.to) out.push(['years', (state.from || '…') + '–' + (state.to || '…')]);
  if (state.access !== 'all') out.push(['access', state.access === 'free' ? 'Бесплатные' : 'Платные']);
  if (state.format.length < ALL_FORMATS.length) out.push(['format', state.format.length ? state.format.map(f => FORMATS[f]).join(', ') : 'Без формата']);
  return out;
}

function titleText() {
  if (state.q) return 'Результаты: «' + state.q + '»';
  if (state.fav) return 'Избранное';
  if (state.col) return COLLECTIONS[state.col] || 'Подборка';
  if (state.genre.length === 1) return genreName(state.genre[0]);
  if (state.access === 'free') return 'Читай легально и бесплатно';
  return 'Каталог';
}

function skeleton(n) {
  return Array.from({ length: n }, () => '<div class="card card--grid skeleton"><div class="cover"></div><div class="bar"></div><div class="bar short"></div></div>').join('');
}

function render() {
  const list = results();
  const pages = Math.max(1, Math.ceil(list.length / CONFIG.perPage));
  if (state.page > pages) state.page = pages;
  const slice = list.slice((state.page - 1) * CONFIG.perPage, state.page * CONFIG.perPage);
  const title = titleText();

  $('#r-title').textContent = title;
  document.title = title + ' — Полка';

  const n = list.length;
  let sub = (state.q ? 'Нашли ' : state.fav ? 'Сохранено ' : 'В подборке ') + n + ' ' + plural(n, 'книга', 'книги', 'книг');
  if (state.q) sub += ' · совпадения по названию, автору, описанию и содержанию';
  const statusText = { loading: 'ищем ещё в Google Books и Open Library…', done: api.items.length ? 'часть результатов — из ' + api.source : '', error: 'внешние каталоги сейчас недоступны — показан только свой каталог' }[api.status];
  $('#r-sub').innerHTML = esc(sub) + (statusText ? ' · <span class="api-status">' + esc(statusText) + '</span>' : '');

  $('#chips').innerHTML = chips().map(([k, label]) => '<button class="a-chip" type="button" data-k="' + esc(k) + '" aria-label="Убрать фильтр ' + esc(label) + '">' + esc(label) + icon('x') + '</button>').join('');

  const grid = $('#grid');
  if (!slice.length && api.status === 'loading') grid.innerHTML = skeleton(CONFIG.perPage);
  else if (!slice.length) {
    grid.innerHTML = state.fav && !baseList().length
      ? '<div class="empty"><h3>В избранном пока пусто</h3><p>Нажмите «В избранное» на странице книги — она появится здесь.</p><p><a class="btn btn-dark btn-sm" href="index.html">На главную</a></p></div>'
      : '<div class="empty"><h3>Ничего не нашли</h3><p>Попробуйте другой запрос или уберите часть фильтров.</p><p><button class="btn btn-dark btn-sm" type="button" data-reset>Сбросить фильтры</button></p></div>';
  } else grid.innerHTML = slice.map(b => cardHTML(b, 'grid')).join('');

  const pag = $('#pagination');
  if (pages <= 1) { pag.innerHTML = ''; return; }
  let nums = [];
  for (let i = 1; i <= pages; i++) if (i === 1 || i === pages || Math.abs(i - state.page) <= 2) nums.push(i);
  let html = state.page > 1 ? '<button class="page-btn" type="button" data-p="' + (state.page - 1) + '">← Назад</button>' : '';
  nums.forEach((p, i) => {
    if (i && p - nums[i - 1] > 1) html += '<span class="page-btn" aria-hidden="true">…</span>';
    html += '<button class="page-btn" type="button" data-p="' + p + '"' + (p === state.page ? ' aria-current="page"' : '') + '>' + p + '</button>';
  });
  if (state.page < pages) html += '<button class="page-btn" type="button" data-p="' + (state.page + 1) + '">Дальше →</button>';
  pag.innerHTML = html;
}

function update(resetPage = true) {
  if (resetPage) state.page = 1;
  writeState();
  renderFilters();
  render();
  loadApi();
}

// ---------- События ----------
['genre', 'lang', 'format'].forEach(key => {
  $('#f-' + key).addEventListener('change', e => {
    state[key] = $$('input:checked', $('#f-' + key)).map(i => i.value);
    update();
  });
});

let yearTimer;
['from', 'to'].forEach(key => {
  $('#f-' + key).addEventListener('input', e => {
    clearTimeout(yearTimer);
    yearTimer = setTimeout(() => { state[key] = e.target.value; update(); }, 400);
  });
});

$('#f-access').addEventListener('click', e => {
  const b = e.target.closest('button');
  if (b) { state.access = b.dataset.v; update(); }
});

$('#sort').addEventListener('click', e => {
  const b = e.target.closest('button');
  if (b) { state.sort = b.dataset.v; update(); }
});

function resetFilters() {
  Object.assign(state, { genre: [], lang: [], from: '', to: '', access: 'all', format: ALL_FORMATS.slice(), col: '', fav: false });
  update();
}
$('#reset').addEventListener('click', resetFilters);
document.addEventListener('click', e => { if (e.target.closest('[data-reset]')) resetFilters(); });

$('#chips').addEventListener('click', e => {
  const c = e.target.closest('.a-chip');
  if (!c) return;
  const [k, v] = c.dataset.k.split(':');
  if (k === 'genre' || k === 'lang') state[k] = state[k].filter(x => x !== v);
  else if (k === 'years') { state.from = ''; state.to = ''; }
  else if (k === 'access') state.access = 'all';
  else if (k === 'format') state.format = ALL_FORMATS.slice();
  else if (k === 'col') state.col = '';
  else if (k === 'fav') state.fav = false;
  update();
});

$('#pagination').addEventListener('click', e => {
  const b = e.target.closest('button[data-p]');
  if (!b) return;
  state.page = +b.dataset.p;
  update(false);
  window.scrollTo({ top: 0, behavior: 'smooth' });
});

$('#filters-toggle').addEventListener('click', e => {
  const open = $('#filters').classList.toggle('open');
  e.currentTarget.setAttribute('aria-expanded', String(open));
});

async function loadAccountFavs() {
  accountFavs = null;
  if (DB.user) {
    try { accountFavs = (await DB.shelf()).filter(r => r.is_favorite).map(DB.shelfBook); } catch (e) { console.warn(e.message); }
  }
}

boot(async () => {
  renderHeader('inner', state.q);
  renderFooter();
  await loadAccountFavs();
  update(false);
  DB.onAuth(async () => { await loadAccountFavs(); render(); });
});

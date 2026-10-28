// Связь сайта с базой Supabase: каталог, аккаунт, полка, отзывы, статистика.
// Если база не настроена или недоступна — сайт работает на js/books.js.
const DB = (() => {
  const CACHE_KEY = 'polka:catalog:v1';
  const CACHE_TTL = 10 * 60 * 1000;
  const sb = SUPABASE.url && SUPABASE.anonKey && window.supabase
    ? window.supabase.createClient(SUPABASE.url, SUPABASE.anonKey)
    : null;

  const state = { user: null, profile: null, source: 'local', shelf: null };
  const listeners = [];

  // ---------- Каталог ----------
  function rowToBook(r) {
    const cols = (r.book_collections || []);
    return {
      id: r.id, title: r.title, subtitle: r.subtitle || '', author: r.author, year: r.year, pages: r.pages,
      lang: r.lang, genre: r.genre_id, color: r.color, formats: r.formats, free: r.is_free,
      freeSource: r.free_source, freeQuery: r.free_query,
      rating: r.rating == null ? null : Number(r.rating), pop: r.popularity,
      mood: r.mood, tags: r.tags, desc: r.description || '', summary: r.summary || '', audience: r.audience,
      collections: cols.map(c => c.collection_id),
      positions: Object.fromEntries(cols.map(c => [c.collection_id, c.position])),
      chapters: (r.chapters || []).sort((a, b) => a.position - b.position).map(c => [c.title, c.about || '']),
      links: (r.book_links || []).sort((a, b) => a.position - b.position).map(l => ({ store: l.store_id, kind: l.kind, note: l.note, url: l.url }))
    };
  }

  // Подменяем содержимое глобальных справочников — остальной код сайта их просто читает
  function applyCatalog(c) {
    GENRES.splice(0, GENRES.length, ...c.genres.map(g => ({ id: g.id, name: g.name, icon: g.icon, color: g.color, tile: g.show_tile })));
    Object.keys(COLLECTIONS).forEach(k => delete COLLECTIONS[k]);
    c.collections.forEach(x => { COLLECTIONS[x.id] = x.title; });
    Object.keys(STORES).forEach(k => delete STORES[k]);
    c.stores.forEach(s => {
      STORES[s.id] = { name: s.name, free: s.is_free, url: q => s.search_url.replace('{q}', encodeURIComponent(q)) + (s.partner_param ? (s.search_url.includes('?') ? '&' : '?') + s.partner_param : '') };
    });
    BOOKS.splice(0, BOOKS.length, ...c.books.map(rowToBook));
  }

  async function fetchCatalog() {
    const [g, s, c, b] = await Promise.all([
      sb.from('genres').select('*').order('sort'),
      sb.from('stores').select('*'),
      sb.from('collections').select('*').order('sort'),
      sb.from('books').select('*, chapters(position, title, about), book_collections(collection_id, position), book_links(store_id, kind, note, url, position)').eq('source', 'polka')
    ]);
    const err = g.error || s.error || c.error || b.error;
    if (err) throw err;
    if (!b.data.length) throw new Error('В базе нет книг — запустите database/03_seed.sql');
    return { genres: g.data, stores: s.data, collections: c.data, books: b.data };
  }

  function readCache() {
    try { return JSON.parse(localStorage.getItem(CACHE_KEY)); } catch (e) { return null; }
  }

  async function loadCatalog() {
    const cache = readCache();
    if (cache && Date.now() - cache.t < CACHE_TTL) { applyCatalog(cache.data); state.source = 'cache'; return; }
    try {
      const data = await fetchCatalog();
      applyCatalog(data);
      state.source = 'supabase';
      try { localStorage.setItem(CACHE_KEY, JSON.stringify({ t: Date.now(), data })); } catch (e) { /* без кэша */ }
    } catch (e) {
      console.warn('Каталог из Supabase не загрузился:', e.message || e);
      if (cache) { applyCatalog(cache.data); state.source = 'cache'; }
    }
  }

  // ---------- Аккаунт ----------
  async function loadProfile() {
    if (!state.user) { state.profile = null; return; }
    const { data } = await sb.from('profiles').select('display_name, created_at').eq('id', state.user.id).maybeSingle();
    state.profile = data || { display_name: (state.user.email || '').split('@')[0] };
  }

  function emit(event) { listeners.forEach(fn => { try { fn(state.user, event); } catch (e) { console.error(e); } }); }

  const ready = (async () => {
    if (!sb) return;
    const [{ data }] = await Promise.all([sb.auth.getSession(), loadCatalog()]);
    state.user = data.session ? data.session.user : null;
    await loadProfile();
    // Другие запросы к Supabase внутри этого обработчика делаем через setTimeout —
    // иначе supabase-js может зависнуть на собственной блокировке сессии
    sb.auth.onAuthStateChange((event, session) => {
      setTimeout(async () => {
        const before = state.user && state.user.id;
        state.user = session ? session.user : null;
        if (event === 'PASSWORD_RECOVERY') return emit(event);
        if ((state.user && state.user.id) === before && event !== 'USER_UPDATED') return;
        state.shelf = null;
        await loadProfile();
        if (event === 'SIGNED_IN') await migrateLocalFavs();
        emit(event);
      }, 0);
    });
  })().catch(e => console.warn('Supabase недоступен:', e.message || e));

  const AUTH_ERRORS = [
    [/invalid login credentials/i, 'Неверный email или пароль'],
    [/already registered|already been registered/i, 'Этот email уже зарегистрирован — войдите'],
    [/email not confirmed/i, 'Сначала подтвердите email — письмо уже в почте'],
    [/at least 6 characters|password should be/i, 'Пароль должен быть не короче 6 символов'],
    [/rate limit|too many|security purposes/i, 'Слишком много попыток — подождите минуту'],
    [/unable to validate email|invalid email|email address .* invalid/i, 'Проверьте адрес почты'],
    [/failed to fetch|network/i, 'Нет связи с сервером. Проверьте интернет']
  ];
  function authError(e) {
    const msg = (e && e.message) || String(e);
    const hit = AUTH_ERRORS.find(([re]) => re.test(msg));
    return new Error(hit ? hit[1] : msg);
  }
  const redirectTo = () => (location.protocol.startsWith('http') ? location.href.replace(/[^/]*$/, 'account.html') : undefined);

  async function signUp(email, password, name) {
    const { data, error } = await sb.auth.signUp({ email, password, options: { data: { display_name: name }, emailRedirectTo: redirectTo() } });
    if (error) throw authError(error);
    // Supabase не раскрывает, что email занят: возвращает пользователя без identities
    if (data.user && data.user.identities && !data.user.identities.length) throw new Error('Этот email уже зарегистрирован — войдите');
    return { needsConfirm: !data.session };
  }
  async function signIn(email, password) {
    const { error } = await sb.auth.signInWithPassword({ email, password });
    if (error) throw authError(error);
  }
  async function signOut() { await sb.auth.signOut(); }
  async function resetPassword(email) {
    const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: redirectTo() });
    if (error) throw authError(error);
  }
  async function updatePassword(password) {
    const { error } = await sb.auth.updateUser({ password });
    if (error) throw authError(error);
  }
  async function updateName(name) {
    const { error } = await sb.from('profiles').update({ display_name: name }).eq('id', state.user.id);
    if (error) throw error;
    state.profile.display_name = name;
    emit('PROFILE');
  }

  // ---------- Полка ----------
  // Книга из Google Books / Open Library должна быть в таблице books до того, как на неё сошлются
  async function ensureBook(b) {
    if (!b.source) return;
    const { error } = await sb.rpc('ensure_external_book', {
      p_id: b.id, p_title: b.title, p_author: b.author, p_year: b.year || null,
      p_cover: b.cover || null, p_color: b.color || 'blue', p_lang: b.lang || null, p_genre: b.genre || null
    });
    if (error) throw error;
  }

  async function shelf(force) {
    if (!state.user) return [];
    if (state.shelf && !force) return state.shelf;
    const { data, error } = await sb.from('user_books')
      .select('book_id, is_favorite, status, updated_at, books(id, source, title, author, year, color, cover_url, genre_id, lang, formats, is_free, rating)')
      .order('updated_at', { ascending: false });
    if (error) throw error;
    state.shelf = data;
    return data;
  }

  async function shelfItem(bookId) {
    const list = await shelf();
    return list.find(r => r.book_id === bookId) || null;
  }

  // patch: { is_favorite?, status? }. Если книга больше нигде не отмечена — строка удаляется
  async function setShelf(b, patch) {
    const cur = await shelfItem(b.id);
    const next = { is_favorite: cur ? cur.is_favorite : false, status: cur ? cur.status : null, ...patch };
    if (!next.is_favorite && !next.status) {
      const { error } = await sb.from('user_books').delete().eq('user_id', state.user.id).eq('book_id', b.id);
      if (error) throw error;
    } else {
      await ensureBook(b);
      const { error } = await sb.from('user_books').upsert({ user_id: state.user.id, book_id: b.id, ...next }, { onConflict: 'user_id,book_id' });
      if (error) throw error;
    }
    await shelf(true);
    emit('SHELF');
    return next;
  }

  // Избранное, собранное до входа, переносится в аккаунт
  async function migrateLocalFavs() {
    const local = Store.favs();
    if (!local.length) return;
    for (const f of local) {
      try { await setShelf(f.source === 'local' ? { ...f, source: undefined } : f, { is_favorite: true }); } catch (e) { console.warn('Не перенеслось:', f.title, e.message); }
    }
    Store.clearFavs();
    toast('Избранное из браузера перенесено в аккаунт');
  }

  // Строка полки → объект книги для карточек сайта
  function shelfBook(r) {
    const local = bookById(r.book_id);
    if (local) return local;
    const b = r.books || {};
    return { id: b.id, source: b.source, title: b.title, author: b.author, year: b.year, color: b.color, cover: b.cover_url,
      genre: b.genre_id, lang: b.lang, formats: b.formats, free: b.is_free, rating: b.rating == null ? null : Number(b.rating), categories: [], apiLinks: [] };
  }

  // ---------- Отзывы ----------
  async function reviews(bookId) {
    const [list, stats] = await Promise.all([
      sb.from('reviews').select('id, user_id, rating, body, created_at, updated_at').eq('book_id', bookId).order('created_at', { ascending: false }).limit(50),
      sb.from('book_ratings').select('avg_rating, reviews_count').eq('book_id', bookId).maybeSingle()
    ]);
    if (list.error) throw list.error;
    const ids = [...new Set(list.data.map(r => r.user_id))];
    const names = {};
    if (ids.length) {
      const { data } = await sb.from('profiles').select('id, display_name').in('id', ids);
      (data || []).forEach(p => { names[p.id] = p.display_name; });
    }
    return {
      list: list.data.map(r => ({ ...r, name: names[r.user_id] || 'Читатель', mine: !!state.user && r.user_id === state.user.id })),
      avg: stats.data ? Number(stats.data.avg_rating) : null,
      count: stats.data ? stats.data.reviews_count : 0
    };
  }

  async function saveReview(b, rating, body, existingId) {
    if (existingId) {
      const { error } = await sb.from('reviews').update({ rating, body }).eq('id', existingId);
      if (error) throw error;
    } else {
      await ensureBook(b);
      const { error } = await sb.from('reviews').insert({ book_id: b.id, rating, body });
      if (error) throw error;
    }
  }

  async function deleteReview(id) {
    const { error } = await sb.from('reviews').delete().eq('id', id);
    if (error) throw error;
  }

  async function myReviews() {
    if (!state.user) return [];
    const { data, error } = await sb.from('reviews')
      .select('id, book_id, rating, body, updated_at, books(id, source, title, author, year, color, cover_url, genre_id, lang, formats, is_free, rating)')
      .eq('user_id', state.user.id).order('updated_at', { ascending: false });
    if (error) throw error;
    return data;
  }

  // ---------- Статистика ----------
  function trackView(bookId) {
    if (!sb || !bookById(bookId)) return;
    const key = 'polka:viewed:' + bookId;
    try { if (sessionStorage.getItem(key)) return; sessionStorage.setItem(key, '1'); } catch (e) { /* считаем как есть */ }
    sb.from('book_views').insert({ book_id: bookId }).then(({ error }) => { if (error) console.warn('Просмотр не записан:', error.message); });
  }

  async function popular(limit = 6) {
    if (!sb) return [];
    const { data, error } = await sb.rpc('popular_books', { p_days: 30, p_limit: limit });
    return error ? [] : data;
  }

  return {
    get enabled() { return !!sb; },
    get user() { return state.user; },
    get profile() { return state.profile; },
    get source() { return state.source; },
    ready,
    onAuth(fn) { listeners.push(fn); },
    signUp, signIn, signOut, resetPassword, updatePassword, updateName,
    shelf, shelfItem, setShelf, shelfBook,
    reviews, saveReview, deleteReview, myReviews,
    trackView, popular
  };
})();

// Запуск страницы после загрузки каталога и сессии
function boot(fn) {
  DB.ready.then(fn, fn);
}

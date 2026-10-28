// Страница аккаунта: вход, регистрация, восстановление пароля, моя полка и отзывы
const page = $('#account');
const params = new URLSearchParams(location.search);
// Куда вернуться после входа — только на страницу этого сайта
const nextPage = /^[a-z]+\.html(\?[^#]*)?$/.test(params.get('next') || '') ? params.get('next') : null;

const TABS = [
  ['favorite', 'Избранное'],
  ['want', 'Хочу прочитать'],
  ['reading', 'Читаю'],
  ['read', 'Прочитано'],
  ['reviews', 'Мои отзывы']
];
let authMode = 'login';
// Ссылка из письма «сбросить пароль» приходит с type=recovery в адресе
let recovery = /type=recovery/.test(location.hash);

function field(name, label, type, extra = '') {
  return '<label class="field"><span>' + label + '</span><input name="' + name + '" type="' + type + '" ' + extra + '></label>';
}

// ---------- База не подключена ----------
function renderSetup() {
  page.innerHTML = '<section class="auth-wrap"><div class="auth-card"><p class="eyebrow">Аккаунты</p><h1 class="auth-title">База данных не подключена</h1>' +
    '<p class="muted">Сайт работает без аккаунта: избранное хранится в этом браузере. Чтобы включить вход, полку и отзывы, подключите Supabase:</p>' +
    '<ol class="steps-list"><li>Создайте проект на <a href="https://supabase.com" target="_blank" rel="noopener">supabase.com</a>.</li>' +
    '<li>В SQL Editor по очереди выполните <code>database/01_schema.sql</code>, <code>02_security.sql</code> и <code>03_seed.sql</code>.</li>' +
    '<li>Скопируйте Project URL и anon key (Project Settings → API) в <code>js/config.js</code>.</li></ol>' +
    '<a class="btn btn-dark btn-sm" href="search.html?fav=1">Открыть избранное в браузере</a></div>' + perks() + '</section>';
}

function perks() {
  return '<aside class="auth-perks"><p class="eyebrow">Что даёт аккаунт</p><h2>Твоя полка на любом устройстве</h2><ul class="checklist">' +
    '<li>Избранное сохраняется в аккаунте, а не в одном браузере</li><li>Списки «Хочу прочитать», «Читаю» и «Прочитано»</li>' +
    '<li>Оценки и отзывы к книгам</li><li>Избранное, собранное до входа, перенесётся само</li></ul></aside>';
}

// ---------- Вход / регистрация ----------
function renderAuth(message) {
  const titles = { login: 'Вход', register: 'Регистрация', reset: 'Восстановление пароля' };
  let form;
  if (authMode === 'reset') {
    form = field('email', 'Email', 'email', 'required autocomplete="email"') +
      '<button class="btn btn-dark btn-block" type="submit">Прислать ссылку</button>' +
      '<p class="auth-switch"><button class="link-btn" type="button" data-mode="login">Вспомнил пароль — войти</button></p>';
  } else {
    form = (authMode === 'register' ? field('name', 'Как вас зовут', 'text', 'required maxlength="40" autocomplete="nickname"') : '') +
      field('email', 'Email', 'email', 'required autocomplete="email"') +
      field('password', 'Пароль', 'password', 'required minlength="6" autocomplete="' + (authMode === 'register' ? 'new-password' : 'current-password') + '"') +
      '<button class="btn btn-dark btn-block" type="submit">' + (authMode === 'register' ? 'Создать аккаунт' : 'Войти') + '</button>' +
      (authMode === 'login' ? '<p class="auth-switch"><button class="link-btn" type="button" data-mode="reset">Забыли пароль?</button></p>' : '');
  }
  page.innerHTML = '<section class="auth-wrap"><div class="auth-card"><p class="eyebrow">Аккаунт «Полки»</p><h1 class="auth-title">' + titles[authMode] + '</h1>' +
    (authMode !== 'reset' ? '<div class="segmented auth-tabs"><button type="button" data-mode="login" aria-pressed="' + (authMode === 'login') + '">Вход</button><button type="button" data-mode="register" aria-pressed="' + (authMode === 'register') + '">Регистрация</button></div>' : '<p class="muted">Пришлём на почту ссылку для нового пароля.</p>') +
    '<form id="auth-form" novalidate>' + form + '<p class="form-msg" id="auth-msg" role="alert"></p></form></div>' + perks() + '</section>';

  $$('[data-mode]', page).forEach(b => b.addEventListener('click', () => { authMode = b.dataset.mode; renderAuth(); }));
  if (message) showMsg(message, true);
  $('#auth-form').addEventListener('submit', onAuthSubmit);
  const first = $('#auth-form input');
  if (first) first.focus();
}

function showMsg(text, ok) {
  const m = $('#auth-msg') || $('#form-msg');
  if (!m) return;
  m.textContent = text;
  m.classList.toggle('ok', !!ok);
}

async function onAuthSubmit(e) {
  e.preventDefault();
  const f = e.target;
  const email = f.email.value.trim();
  if (!/^\S+@\S+\.\S+$/.test(email)) return showMsg('Проверьте адрес почты');
  if (f.password && f.password.value.length < 6) return showMsg('Пароль должен быть не короче 6 символов');
  if (f.name && !f.name.value.trim()) return showMsg('Напишите, как вас зовут');
  const btn = $('button[type=submit]', f);
  btn.disabled = true;
  showMsg('');
  try {
    if (authMode === 'login') {
      await DB.signIn(email, f.password.value);
      // дальше всё сделает DB.onAuth → afterLogin
    } else if (authMode === 'register') {
      const res = await DB.signUp(email, f.password.value, f.name.value.trim());
      if (res.needsConfirm) {
        authMode = 'login';
        renderAuth('Мы отправили письмо на ' + email + '. Перейдите по ссылке в нём, чтобы подтвердить адрес, и войдите.');
      }
    } else {
      await DB.resetPassword(email);
      showMsg('Если такой аккаунт есть, письмо со ссылкой уже в почте.', true);
    }
  } catch (err) { showMsg(err.message); }
  btn.disabled = false;
}

// ---------- Новый пароль (по ссылке из письма) ----------
function renderNewPassword() {
  page.innerHTML = '<section class="auth-wrap"><div class="auth-card"><p class="eyebrow">Восстановление</p><h1 class="auth-title">Новый пароль</h1>' +
    '<form id="pw-form">' + field('password', 'Новый пароль', 'password', 'required minlength="6" autocomplete="new-password"') +
    '<button class="btn btn-dark btn-block" type="submit">Сохранить пароль</button><p class="form-msg" id="form-msg" role="alert"></p></form></div></section>';
  $('#pw-form').addEventListener('submit', async e => {
    e.preventDefault();
    const pw = e.target.password.value;
    if (pw.length < 6) return showMsg('Пароль должен быть не короче 6 символов');
    try { await DB.updatePassword(pw); recovery = false; toast('Пароль изменён'); renderProfile(); }
    catch (err) { showMsg(err.message); }
  });
}

// ---------- Профиль ----------
async function renderProfile() {
  const name = DB.profile ? DB.profile.display_name : '';
  const tab = TABS.some(t => t[0] === location.hash.slice(1)) ? location.hash.slice(1) : 'favorite';
  page.innerHTML =
    '<section class="profile-head"><span class="avatar avatar--lg">' + esc(name.charAt(0).toUpperCase() || '?') + '</span>' +
      '<div class="profile-info" id="profile-info"><h1 class="profile-name">' + esc(name) + '</h1><p class="muted">' + esc(DB.user.email || '') + '</p>' +
      '<button class="link-btn" type="button" id="edit-name">Изменить имя</button></div>' +
      '<button class="btn btn-outline btn-sm profile-out" type="button" id="logout">Выйти</button></section>' +
    '<div class="facts profile-facts" id="profile-facts">' + TABS.map(t => '<div class="fact"><small>' + t[1] + '</small><b data-count="' + t[0] + '">…</b></div>').join('') + '</div>' +
    '<div class="tabs" role="tablist">' + TABS.map(t => '<button class="btn btn-outline" type="button" role="tab" data-tab="' + t[0] + '" aria-selected="' + (t[0] === tab) + '">' + t[1] + '</button>').join('') + '</div>' +
    '<div id="tab-body"><div class="spinner"></div></div>';

  $('#logout').addEventListener('click', async () => { await DB.signOut(); toast('Вы вышли из аккаунта'); });
  $('#edit-name').addEventListener('click', editName);
  $$('[data-tab]', page).forEach(b => b.addEventListener('click', () => {
    history.replaceState(null, '', '#' + b.dataset.tab);
    $$('[data-tab]', page).forEach(x => x.setAttribute('aria-selected', String(x === b)));
    renderTab(b.dataset.tab);
  }));

  try {
    const [shelf, reviews] = await Promise.all([DB.shelf(true), DB.myReviews()]);
    const counts = { favorite: shelf.filter(r => r.is_favorite).length, reviews: reviews.length };
    ['want', 'reading', 'read'].forEach(s => { counts[s] = shelf.filter(r => r.status === s).length; });
    $$('[data-count]', page).forEach(el => { el.textContent = counts[el.dataset.count]; });
    renderTab.data = { shelf, reviews };
    renderTab(tab);
  } catch (e) {
    $('#tab-body').innerHTML = '<div class="empty"><h3>Не удалось загрузить полку</h3><p>' + esc(e.message) + '</p></div>';
  }
}

const EMPTY = {
  favorite: ['В избранном пока пусто', 'Нажмите «В избранное» на странице книги.'],
  want: ['Список «Хочу прочитать» пуст', 'Отмечайте книги на их страницах — кнопка «Хочу прочитать».'],
  reading: ['Сейчас ничего не читаете', 'Отметьте книгу как «Читаю», чтобы не потерять её.'],
  read: ['Прочитанных пока нет', 'Отметьте книгу как «Прочитано» и оцените её.'],
  reviews: ['Вы ещё не писали отзывов', 'Оцените любую книгу на её странице — внизу есть блок «Отзывы читателей».']
};

function renderTab(tab) {
  const body = $('#tab-body');
  const { shelf, reviews } = renderTab.data || { shelf: [], reviews: [] };
  const empty = () => '<div class="empty"><h3>' + EMPTY[tab][0] + '</h3><p>' + EMPTY[tab][1] + '</p><p><a class="btn btn-dark btn-sm" href="search.html">Открыть каталог</a></p></div>';

  if (tab === 'reviews') {
    body.innerHTML = reviews.length ? '<div class="my-reviews">' + reviews.map(r => {
      const b = DB.shelfBook({ book_id: r.book_id, books: r.books });
      registry.set(b.id, b);
      return '<a class="my-review" href="' + bookUrl(b) + '">' + coverHTML(b) + '<div><h3>' + esc(b.title) + '</h3><p class="muted">' + esc(b.author) + '</p>' +
        '<p class="stars">' + '★★★★★'.slice(0, r.rating) + '<span class="stars-off">' + '★★★★★'.slice(r.rating) + '</span></p>' + (r.body ? '<p>' + esc(r.body) + '</p>' : '') + '</div></a>';
    }).join('') + '</div>' : empty();
    return;
  }
  const list = shelf.filter(r => (tab === 'favorite' ? r.is_favorite : r.status === tab)).map(DB.shelfBook);
  body.innerHTML = list.length ? '<div class="results-grid">' + list.map(b => cardHTML(b, 'grid')).join('') + '</div>' : empty();
}

function editName() {
  const box = $('#profile-info');
  const old = DB.profile.display_name;
  box.innerHTML = '<form class="name-form" id="name-form"><input name="name" maxlength="40" required value="' + esc(old) + '" aria-label="Имя">' +
    '<button class="btn btn-dark btn-sm" type="submit">Сохранить</button><button class="link-btn" type="button" id="name-cancel">Отмена</button></form>';
  const f = $('#name-form');
  f.name.focus();
  $('#name-cancel').addEventListener('click', renderProfile);
  f.addEventListener('submit', async e => {
    e.preventDefault();
    const v = f.name.value.trim();
    if (!v) return;
    try { await DB.updateName(v); toast('Имя сохранено'); renderProfile(); } catch (err) { toast('Не получилось: ' + err.message); }
  });
}

// ---------- Запуск ----------
function route() {
  if (!DB.enabled) return renderSetup();
  if (recovery) return renderNewPassword();
  if (DB.user) return renderProfile();
  renderAuth();
}

boot(() => {
  renderHeader('inner');
  renderFooter();
  DB.onAuth((user, event) => {
    if (event === 'PASSWORD_RECOVERY') { recovery = true; return route(); }
    if (event === 'SIGNED_IN' && nextPage) { location.href = nextPage; return; }
    if (event === 'SHELF' || event === 'PROFILE') return;
    route();
  });
  route();
});

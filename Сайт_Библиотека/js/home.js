// Главная страница
// Порядок рядов без базы. С базой он берётся из book_collections.position
const HOME_ROWS = {
  prog: ['clean-code', 'grokking', 'code-complete', 'pragmatic', 'refactoring', 'code-petzold'],
  popular: ['master-margarita', 'picnic', 'atomic-habits', 'abai-path', 'baskerville', 'little-prince'],
  short: ['old-man-sea', 'overcoat', 'metamorphosis', 'heart-of-dog', 'algernon', 'white-fang']
};

function rowIds(col) {
  const fromDb = BOOKS.filter(b => b.positions && b.positions[col] < 100).sort((a, b) => a.positions[col] - b.positions[col]).map(b => b.id);
  return fromDb.length ? fromDb : HOME_ROWS[col];
}

function renderRow(col, ids) {
  $('#row-' + col).innerHTML = ids.map(bookById).filter(Boolean).slice(0, 6).map(b => cardHTML(b, 'row')).join('');
}

boot(async () => {
  renderHeader('home');
  renderFooter();

  $('#genres').innerHTML = GENRES.filter(g => g.tile).map(g => {
    const [bg, fg] = COVER_COLORS[g.color] || COVER_COLORS.blue;
    return '<a class="genre-tile" href="search.html?genre=' + g.id + '" style="--bg-c:' + bg + ';--fg-c:' + fg + '">' + icon(g.icon) + '<span>' + esc(g.name) + '</span></a>';
  }).join('');

  Object.keys(HOME_ROWS).forEach(col => renderRow(col, rowIds(col)));

  // «Популярное»: сначала то, что чаще открывали за 30 дней, остальное — из подборки
  const top = (await DB.popular(6)).filter(r => r.views >= 3).map(r => r.book_id);
  if (top.length) renderRow('popular', [...new Set([...top, ...rowIds('popular')])]);
});

// ---------- «Подбери мне книгу» ----------
const TIME_OF = b => (b.pages <= 200 ? 'evening' : b.pages <= 500 ? 'week' : 'month');
const TIME_TEXT = { evening: 'на один вечер', week: 'на неделю', month: 'надолго' };
const MOOD_TEXT = { light: 'читается легко', think: 'есть над чем подумать', inspire: 'вдохновляет' };
const answers = { genre: 'fantasy', time: 'week', mood: 'think' };

$$('.q-group').forEach(group => {
  group.addEventListener('click', e => {
    const btn = e.target.closest('.q-opt');
    if (!btn) return;
    $$('.q-opt', group).forEach(b => b.setAttribute('aria-pressed', String(b === btn)));
    answers[group.dataset.q] = btn.dataset.v;
  });
});

function pickBooks({ genre, time, mood }) {
  const order = ['evening', 'week', 'month'];
  return BOOKS.filter(b => b.lang !== 'kk').map(b => {
    let s = 0;
    if (b.genre === genre) s += 10;
    const dt = Math.abs(order.indexOf(TIME_OF(b)) - order.indexOf(time));
    s += dt === 0 ? 4 : dt === 1 ? 1 : 0;
    if ((b.mood || []).includes(mood)) s += (b.mood[0] === mood ? 4 : 3);
    return { b, s: s + b.rating / 10 + Math.random() * 0.8 };
  }).sort((x, y) => y.s - x.s).slice(0, 3).map(x => x.b);
}

$('#picker-go').addEventListener('click', () => {
  const picks = pickBooks(answers);
  const box = $('#picker-result');
  box.innerHTML = '<h3>Вот что мы нашли</h3><div class="picker-books">' + picks.map(b => {
    const why = [b.genre === answers.genre ? genreName(b.genre) : '', TIME_TEXT[TIME_OF(b)], (b.mood || []).includes(answers.mood) ? MOOD_TEXT[answers.mood] : ''].filter(Boolean).join(' · ');
    return '<a class="pick" href="' + bookUrl(b) + '">' + coverHTML(b) + '<div><h4>' + esc(b.title) + '</h4><p>' + esc(b.author) + ' · ' + b.pages + ' стр.</p><p class="why">' + esc(why) + '</p></div></a>';
  }).join('') + '</div>';
  box.classList.add('show');
  $('#picker-go').textContent = 'Подобрать ещё раз';
});

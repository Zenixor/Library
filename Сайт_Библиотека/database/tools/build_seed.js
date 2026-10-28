// Генератор 03_seed.sql из js/config.js и js/books.js.
// Запуск из папки проекта: node database/tools/build_seed.js
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..', '..');
const ctx = {};
vm.createContext(ctx);
for (const f of ['config', 'books']) {
  vm.runInContext(fs.readFileSync(path.join(root, 'js', f + '.js'), 'utf8') +
    ';this.GENRES=GENRES;this.COLLECTIONS=COLLECTIONS;' + (f === 'books' ? 'this.BOOKS=BOOKS;' : ''), ctx);
}
const { GENRES, COLLECTIONS, BOOKS } = ctx;

// Порядок книг в рядах на главной
const ROW_ORDER = {
  prog: ['clean-code', 'grokking', 'code-complete', 'pragmatic', 'refactoring', 'code-petzold'],
  popular: ['master-margarita', 'picnic', 'atomic-habits', 'abai-path', 'baskerville', 'little-prince'],
  short: ['old-man-sea', 'overcoat', 'metamorphosis', 'heart-of-dog', 'algernon', 'white-fang']
};

const STORES = [
  ['litres', 'Литрес', 'https://www.litres.ru/search/?q={q}', false],
  ['meloman', 'Meloman', 'https://www.meloman.kz/catalogsearch/result/?q={q}', false],
  ['marwin', 'Marwin', 'https://www.marwin.kz/catalogsearch/result/?q={q}', false],
  ['wikisource', 'Викитеке', 'https://ru.wikisource.org/w/index.php?search={q}', true],
  ['gutenberg', 'Project Gutenberg', 'https://www.gutenberg.org/ebooks/search/?query={q}', true]
];

const q = v => (v === null || v === undefined || v === '' ? 'null' : "'" + String(v).replace(/'/g, "''") + "'");
const arr = a => (a && a.length ? 'array[' + a.map(q).join(', ') + ']' : "'{}'");
const num = v => (v === null || v === undefined ? 'null' : String(v));

const out = [];
out.push('-- Полка — начальные данные. Шаг 3. Запустить целиком один раз после 02_security.sql.');
out.push('-- Файл собран автоматически: node database/tools/build_seed.js (не редактировать руками).');
out.push('begin;', '');

out.push('insert into public.genres (id, name, icon, color, show_tile, sort) values');
out.push(GENRES.map((g, i) => `  (${q(g.id)}, ${q(g.name)}, ${q(g.icon)}, ${q(g.color)}, ${g.tile}, ${i + 1})`).join(',\n') + ';', '');

out.push('insert into public.stores (id, name, search_url, is_free) values');
out.push(STORES.map(s => `  (${q(s[0])}, ${q(s[1])}, ${q(s[2])}, ${s[3]})`).join(',\n') + ';', '');

out.push('insert into public.collections (id, title, sort) values');
out.push(Object.entries(COLLECTIONS).map(([id, t], i) => `  (${q(id)}, ${q(t)}, ${i + 1})`).join(',\n') + ';', '');

out.push('insert into public.books (id, title, subtitle, author, year, pages, lang, genre_id, color, formats, is_free, free_source, free_query, rating, popularity, mood, tags, description, summary, audience) values');
out.push(BOOKS.map(b => '  (' + [
  q(b.id), q(b.title), q(b.subtitle), q(b.author), num(b.year), num(b.pages), q(b.lang), q(b.genre), q(b.color),
  arr(b.formats), b.free ? 'true' : 'false', q(b.freeSource), q(b.freeQuery), num(b.rating), num(b.pop),
  arr(b.mood), arr(b.tags), q(b.desc), q(b.summary), arr(b.audience)
].join(', ') + ')').join(',\n') + ';', '');

const chapters = [];
BOOKS.forEach(b => (b.chapters || []).forEach((c, i) => chapters.push(`  (${q(b.id)}, ${i + 1}, ${q(c[0])}, ${q(c[1])})`)));
out.push('insert into public.chapters (book_id, position, title, about) values');
out.push(chapters.join(',\n') + ';', '');

const bc = [];
BOOKS.forEach(b => (b.collections || []).forEach(c => {
  const pos = (ROW_ORDER[c] || []).indexOf(b.id);
  bc.push(`  (${q(b.id)}, ${q(c)}, ${pos >= 0 ? pos + 1 : 100})`);
}));
Object.entries(ROW_ORDER).forEach(([c, ids]) => ids.forEach((id, i) => {
  const b = BOOKS.find(x => x.id === id);
  if (!(b.collections || []).includes(c)) bc.push(`  (${q(id)}, ${q(c)}, ${i + 1})`);
}));
out.push('insert into public.book_collections (book_id, collection_id, position) values');
out.push(bc.join(',\n') + ';', '');

// «Где взять»: те же правила, что и раньше были зашиты в сайт
const storeName = Object.fromEntries(STORES.map(s => [s[0], s[1]]));
const links = [];
BOOKS.forEach(b => {
  const L = (store, kind, note, pos) => links.push(`  (${q(b.id)}, ${q(store)}, ${q(kind)}, ${q(note)}, ${pos})`);
  if (b.formats.includes('electronic')) L('litres', 'buy', 'Электронная книга', 1);
  if (b.formats.includes('paper')) { L('meloman', 'buy', 'Бумажная книга · Казахстан', 2); L('marwin', 'buy', 'Бумажная книга · Казахстан', 3); }
  if (b.free && b.freeSource) {
    L(b.freeSource, 'read', 'Открытый доступ · ' + storeName[b.freeSource], 4);
    L(b.freeSource, 'download', 'Проверенный источник · ' + storeName[b.freeSource], 5);
  } else L('litres', 'read', 'Фрагмент или подписка в магазине', 4);
});
out.push('insert into public.book_links (book_id, store_id, kind, note, position) values');
out.push(links.join(',\n') + ';', '');

out.push('commit;', '');
fs.writeFileSync(path.join(__dirname, '..', '03_seed.sql'), out.join('\n'), 'utf8');
console.log('03_seed.sql: книг ' + BOOKS.length + ', глав ' + chapters.length + ', ссылок ' + links.length + ', связей с подборками ' + bc.length);

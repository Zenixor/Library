// Настройки сайта «Полка». Всё, что может понадобиться поменять, — здесь.

// База данных Supabase: Project Settings → API → Project URL и anon public key.
// anon-ключ публичный, его можно держать в коде — данные защищает RLS (database/02_security.sql).
// Пока поля пустые, сайт работает на js/books.js без аккаунтов и отзывов.
const SUPABASE = {
  url: 'https://uzpisjlnkawdxmdnovom.supabase.co',
  anonKey: 'sb_publishable_W8-ldb5CzGHcAMIm_19ARQ_DWqRRKZp'
};

const CONFIG = {
  // Ключ Google Books API (необязательно). Без ключа лимит запросов общий и иногда кончается —
  // тогда сайт сам переключается на Open Library.
  googleBooksKey: '',
  perPage: 8,
  apiResults: 24,
  telegram: 'https://t.me/',
  // Партнёрские коды можно дописать сюда — они добавятся к ссылкам в магазины.
  partner: { litres: '', meloman: '', marwin: '' }
};

const GENRES = [
  { id: 'fantasy', name: 'Фантастика', icon: 'star', color: 'navy', tile: true },
  { id: 'detective', name: 'Детектив', icon: 'search', color: 'black', tile: true },
  { id: 'it', name: 'IT', icon: 'code', color: 'blue', tile: true },
  { id: 'self', name: 'Саморазвитие', icon: 'trend', color: 'cream', tile: true },
  { id: 'kids', name: 'Детям', icon: 'smile', color: 'yellow', tile: true },
  { id: 'classic', name: 'Классика', icon: 'book', color: 'moss', tile: false }
];

const LANGS = { ru: 'Русский', en: 'English', kk: 'Қазақша' };
const FORMATS = { electronic: 'Электронная', paper: 'Бумажная' };

const COLLECTIONS = {
  prog: 'Для программистов',
  popular: 'Популярное',
  short: 'Короткие книги на вечер',
  itgd: 'IT и геймдев',
  new: 'Новинки'
};

// Цвета обложек: [фон, текст]
const COVER_COLORS = {
  blue: ['#2F4BFF', '#FFFFFF'],
  black: ['#16171B', '#FFFFFF'],
  yellow: ['#FFD84D', '#16171B'],
  orange: ['#E5562E', '#FFFFFF'],
  green: ['#1F6B3D', '#FFFFFF'],
  cream: ['#F1E2C2', '#16171B'],
  maroon: ['#5B1E2E', '#FFFFFF'],
  navy: ['#1E2A5E', '#FFFFFF'],
  moss: ['#3E5A40', '#FFFFFF']
};

// Магазины и легальные источники. Ссылки ведут на поиск по магазину —
// так они не ломаются, когда магазин меняет адреса страниц.
const STORES = {
  litres: { name: 'Литрес', url: q => 'https://www.litres.ru/search/?q=' + encodeURIComponent(q) + (CONFIG.partner.litres ? '&' + CONFIG.partner.litres : '') },
  meloman: { name: 'Meloman', url: q => 'https://www.meloman.kz/catalogsearch/result/?q=' + encodeURIComponent(q) + (CONFIG.partner.meloman ? '&' + CONFIG.partner.meloman : '') },
  marwin: { name: 'Marwin', url: q => 'https://www.marwin.kz/catalogsearch/result/?q=' + encodeURIComponent(q) + (CONFIG.partner.marwin ? '&' + CONFIG.partner.marwin : '') },
  wikisource: { name: 'Викитеке', url: q => 'https://ru.wikisource.org/w/index.php?search=' + encodeURIComponent(q) },
  gutenberg: { name: 'Project Gutenberg', url: q => 'https://www.gutenberg.org/ebooks/search/?query=' + encodeURIComponent(q) }
};

-- Полка — схема базы данных (Supabase / PostgreSQL)
-- Шаг 1. Запустить целиком в SQL Editor один раз.

-- ============ Каталог ============

-- Жанры: плитки на главной и фильтр «Жанр»
create table public.genres (
  id         text primary key check (id ~ '^[a-z]+$'),
  name       text not null unique,
  icon       text not null default 'book',
  color      text not null default 'blue',
  show_tile  boolean not null default true,
  sort       int not null default 0
);

-- Магазины и легальные источники. {q} в search_url заменяется на «название + автор»
create table public.stores (
  id            text primary key check (id ~ '^[a-z]+$'),
  name          text not null,
  search_url    text not null check (search_url like 'https://%{q}%'),
  partner_param text,                                   -- партнёрский код, например ref=123
  is_free       boolean not null default false          -- true — источник бесплатных книг
);

-- Книги. source = 'polka' — свой каталог; 'gb' / 'ol' — книги из Google Books / Open Library,
-- которые пользователи добавили в избранное или оценили (у них заполнены только основные поля)
create table public.books (
  id           text primary key check (id ~ '^[a-z0-9-]+$' or id ~ '^(gb|ol):[A-Za-z0-9_-]+$'),
  source       text not null default 'polka' check (source in ('polka', 'gb', 'ol')),
  title        text not null check (char_length(title) between 1 and 300),
  subtitle     text,
  author       text not null,
  year         int check (year between 1000 and 2100),
  pages        int check (pages > 0),
  lang         text,
  genre_id     text references public.genres (id),
  color        text not null default 'blue'
               check (color in ('blue', 'black', 'yellow', 'orange', 'green', 'cream', 'maroon', 'navy', 'moss')),
  cover_url    text,
  formats      text[] not null default '{paper}' check (formats <@ array['electronic', 'paper']),
  is_free      boolean not null default false,
  free_source  text references public.stores (id),
  free_query   text,
  rating       numeric(2, 1) check (rating between 0 and 5),   -- редакционный рейтинг
  popularity   int not null default 0,
  mood         text[] not null default '{}' check (mood <@ array['light', 'think', 'inspire']),
  tags         text[] not null default '{}',
  description  text,
  summary      text,                                           -- «Коротко за 1 минуту»
  audience     text[] not null default '{}',                   -- «Для кого и что узнаешь»
  created_at   timestamptz not null default now(),
  check (source <> 'polka' or id ~ '^[a-z0-9-]+$'),
  check (not is_free or source <> 'polka' or free_source is not null)
);
create index books_source_idx on public.books (source);
create index books_genre_idx on public.books (genre_id);

-- Содержание: главы книги по порядку
create table public.chapters (
  id        bigint generated always as identity primary key,
  book_id   text not null references public.books (id) on delete cascade,
  position  int not null check (position > 0),
  title     text not null,
  about     text,                                              -- одна строка «о чём глава»
  unique (book_id, position)
);

-- Подборки: «Для программистов», «Популярное» и т. д.
create table public.collections (
  id     text primary key check (id ~ '^[a-z]+$'),
  title  text not null unique,
  sort   int not null default 0
);

-- Книга ↔ подборка: «многие-ко-многим». position — порядок книги в ряду на главной
create table public.book_collections (
  book_id        text not null references public.books (id) on delete cascade,
  collection_id  text not null references public.collections (id) on delete cascade,
  position       int not null default 100,
  primary key (book_id, collection_id)
);

-- Блок «Где взять»: какие кнопки показать у книги. url = null → поиск по шаблону магазина
create table public.book_links (
  id        bigint generated always as identity primary key,
  book_id   text not null references public.books (id) on delete cascade,
  store_id  text not null references public.stores (id),
  kind      text not null check (kind in ('buy', 'read', 'download')),
  note      text not null default '',
  url       text check (url like 'https://%'),
  position  int not null default 0,
  unique (book_id, store_id, kind)
);

-- ============ Пользователи ============

-- Профиль: имя, которое видно у отзывов. Email хранится только в auth.users
create table public.profiles (
  id            uuid primary key references auth.users (id) on delete cascade,
  display_name  text not null check (char_length(display_name) between 1 and 40),
  created_at    timestamptz not null default now()
);

-- Полка пользователя: избранное и статус чтения
create table public.user_books (
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  book_id      text not null references public.books (id) on delete cascade,
  is_favorite  boolean not null default false,
  status       text check (status in ('want', 'reading', 'read')),
  added_at     timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  primary key (user_id, book_id),
  check (is_favorite or status is not null)                    -- пустых строк не держим
);
create index user_books_book_idx on public.user_books (book_id);

-- Отзывы: одна оценка от одного человека на книгу
create table public.reviews (
  id          bigint generated always as identity primary key,
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  book_id     text not null references public.books (id) on delete cascade,
  rating      smallint not null check (rating between 1 and 5),
  body        text not null default '' check (char_length(body) <= 2000),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (user_id, book_id)
);
create index reviews_book_idx on public.reviews (book_id, created_at desc);

-- Просмотры страниц книг — для статистики «что открывают чаще»
create table public.book_views (
  id         bigint generated always as identity primary key,
  book_id    text not null references public.books (id) on delete cascade,
  user_id    uuid default auth.uid() references auth.users (id) on delete set null,
  viewed_at  timestamptz not null default now()
);
create index book_views_book_time_idx on public.book_views (book_id, viewed_at desc);

-- ============ Автоматика ============

-- updated_at обновляется сам
create function public.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger user_books_touch before update on public.user_books
  for each row execute function public.touch_updated_at();
create trigger reviews_touch before update on public.reviews
  for each row execute function public.touch_updated_at();

-- При регистрации создаётся профиль. Имя берётся из формы, иначе — из email
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    left(coalesce(nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''), split_part(new.email, '@', 1), 'Читатель'), 40)
  );
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Книга из Google Books / Open Library сохраняется в books, когда её добавляют на полку или оценивают.
-- Функция пускает только id вида gb:… / ol:… и не может изменить книги своего каталога
create function public.ensure_external_book(
  p_id text, p_title text, p_author text,
  p_year int default null, p_cover text default null, p_color text default 'blue',
  p_lang text default null, p_genre text default null
) returns text
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then
    raise exception 'Нужно войти в аккаунт';
  end if;
  if p_id !~ '^(gb|ol):[A-Za-z0-9_-]{1,40}$' then
    raise exception 'Неверный id внешней книги: %', p_id;
  end if;
  insert into public.books (id, source, title, author, year, cover_url, color, lang, genre_id)
  values (
    p_id, split_part(p_id, ':', 1), left(p_title, 300), left(coalesce(nullif(p_author, ''), 'Автор не указан'), 200),
    case when p_year between 1000 and 2100 then p_year end,
    case when p_cover like 'https://%' then left(p_cover, 500) end,
    case when p_color in ('blue', 'black', 'yellow', 'orange', 'green', 'cream', 'maroon', 'navy', 'moss') then p_color else 'blue' end,
    left(p_lang, 5),
    (select g.id from public.genres g where g.id = p_genre)
  )
  on conflict (id) do nothing;
  return p_id;
end $$;

-- Самые открываемые книги каталога за последние p_days дней
create function public.popular_books(p_days int default 30, p_limit int default 6)
returns table (book_id text, views bigint)
language sql stable security definer set search_path = '' as $$
  select v.book_id, count(*) as views
  from public.book_views v
  join public.books b on b.id = v.book_id and b.source = 'polka'
  where v.viewed_at > now() - make_interval(days => least(greatest(p_days, 1), 365))
  group by v.book_id
  order by views desc, v.book_id
  limit least(greatest(p_limit, 1), 50);
$$;

-- Средняя оценка читателей по каждой книге
create view public.book_ratings with (security_invoker = true) as
select book_id, round(avg(rating), 1) as avg_rating, count(*) as reviews_count
from public.reviews
group by book_id;

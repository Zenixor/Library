-- Полка — проверочные запросы. Запускайте ПО ОДНОМУ: выделите SELECT и нажмите Run.

-- Запрос 1. Сколько чего в базе (ожидается: книг 30, глав 251, ссылок 121)
select
  (select count(*) from public.books where source = 'polka') as books,
  (select count(*) from public.chapters)                     as chapters,
  (select count(*) from public.book_links)                   as links,
  (select count(*) from public.book_collections)             as in_collections;

-- Запрос 2. Ряд «Для программистов» на главной (JOIN через book_collections), 6 строк
select bc.position, b.title, b.author, b.year
from public.book_collections bc
join public.books b on b.id = bc.book_id
where bc.collection_id = 'prog' and bc.position < 100
order by bc.position;

-- Запрос 3. Количество книг по жанрам (LEFT JOIN — жанр без книг покажет 0)
select g.name, count(b.id) as books
from public.genres g
left join public.books b on b.genre_id = g.id and b.source = 'polka'
group by g.id, g.name, g.sort
order by g.sort;

-- Запрос 4. Блок «Где взять» для «Чистого кода» — готовые ссылки
select s.name, l.kind, l.note,
       coalesce(l.url, replace(s.search_url, '{q}', b.title || ' ' || b.author)) as url
from public.book_links l
join public.stores s on s.id = l.store_id
join public.books b on b.id = l.book_id
where b.id = 'clean-code'
order by l.position;

-- Запрос 5. Бесплатные книги и где их читать
select b.title, b.author, s.name as source
from public.books b
join public.stores s on s.id = b.free_source
where b.is_free
order by b.title;

-- Запрос 6. Содержание книги по главам
select position, title, about
from public.chapters
where book_id = 'grokking'
order by position;

-- Запрос 7. Статистика: самые открываемые книги за 30 дней (функция)
select b.title, p.views
from public.popular_books(30, 10) p
join public.books b on b.id = p.book_id;

-- Запрос 8. Оценки читателей против редакционного рейтинга
select b.title, b.rating as editorial, r.avg_rating, r.reviews_count
from public.books b
join public.book_ratings r on r.book_id = b.id
order by r.reviews_count desc, b.title;

-- Запрос 9. Сколько у каждого пользователя книг на полке (LEFT JOIN — без книг тоже видно)
select p.display_name,
       count(ub.book_id) filter (where ub.is_favorite)        as favorites,
       count(ub.book_id) filter (where ub.status = 'want')    as want,
       count(ub.book_id) filter (where ub.status = 'reading') as reading,
       count(ub.book_id) filter (where ub.status = 'read')    as read
from public.profiles p
left join public.user_books ub on ub.user_id = p.id
group by p.id, p.display_name
order by p.display_name;

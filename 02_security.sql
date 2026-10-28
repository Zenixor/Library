-- Полка — права доступа (Row Level Security)
-- Шаг 2. Запустить целиком после 01_schema.sql.
--
-- Сайт подключается к базе публичным anon-ключом, его видно в коде страницы.
-- Поэтому защищают не ключ, а таблицы: RLS разрешает только то, что описано ниже.
--   каталог             — читать могут все, менять — только владелец проекта (Table Editor);
--   user_books, reviews — каждый видит и меняет только свои строки (отзывы читают все);
--   book_views          — можно только добавить просмотр, читать нельзя (статистика — через функцию).

alter table public.genres           enable row level security;
alter table public.stores           enable row level security;
alter table public.books            enable row level security;
alter table public.chapters         enable row level security;
alter table public.collections      enable row level security;
alter table public.book_collections enable row level security;
alter table public.book_links       enable row level security;
alter table public.profiles         enable row level security;
alter table public.user_books       enable row level security;
alter table public.reviews          enable row level security;
alter table public.book_views       enable row level security;

-- Сначала забираем всё, потом выдаём ровно то, что нужно
revoke all on all tables in schema public from anon, authenticated;
revoke all on all functions in schema public from public, anon, authenticated;

-- ---------- Каталог: только чтение ----------
grant select on public.genres, public.stores, public.books, public.chapters,
                public.collections, public.book_collections, public.book_links
  to anon, authenticated;

create policy "Каталог читают все" on public.genres           for select using (true);
create policy "Каталог читают все" on public.stores           for select using (true);
create policy "Каталог читают все" on public.books            for select using (true);
create policy "Каталог читают все" on public.chapters         for select using (true);
create policy "Каталог читают все" on public.collections      for select using (true);
create policy "Каталог читают все" on public.book_collections for select using (true);
create policy "Каталог читают все" on public.book_links       for select using (true);

-- ---------- Профили ----------
-- Имена видны всем (они подписывают отзывы), менять можно только своё
grant select on public.profiles to anon, authenticated;
grant update (display_name) on public.profiles to authenticated;

create policy "Профили видны всем" on public.profiles for select using (true);
create policy "Свой профиль меняет владелец" on public.profiles for update to authenticated
  using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

-- ---------- Полка пользователя ----------
grant select, insert, update, delete on public.user_books to authenticated;

create policy "Своя полка: чтение"    on public.user_books for select to authenticated using ((select auth.uid()) = user_id);
create policy "Своя полка: добавление" on public.user_books for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Своя полка: изменение"  on public.user_books for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Своя полка: удаление"   on public.user_books for delete to authenticated using ((select auth.uid()) = user_id);

-- ---------- Отзывы ----------
grant select on public.reviews to anon, authenticated;
grant insert (book_id, rating, body), update (rating, body), delete on public.reviews to authenticated;

create policy "Отзывы читают все"     on public.reviews for select using (true);
create policy "Свой отзыв: добавление" on public.reviews for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Свой отзыв: изменение"  on public.reviews for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Свой отзыв: удаление"   on public.reviews for delete to authenticated using ((select auth.uid()) = user_id);

grant select on public.book_ratings to anon, authenticated;

-- ---------- Просмотры ----------
-- Добавлять можно только просмотр книги из своего каталога и только от своего имени
grant insert (book_id) on public.book_views to anon, authenticated;

create policy "Просмотр книги каталога" on public.book_views for insert to anon, authenticated
  with check (
    (user_id is null or user_id = (select auth.uid()))
    and exists (select 1 from public.books b where b.id = book_id and b.source = 'polka')
  );

-- ---------- Функции ----------
grant execute on function public.popular_books(int, int) to anon, authenticated;
grant execute on function public.ensure_external_book(text, text, text, int, text, text, text, text) to authenticated;

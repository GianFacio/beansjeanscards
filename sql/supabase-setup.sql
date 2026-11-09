-- Card data is public to read; card changes and photo uploads are admin-only.
create schema if not exists store_private;

revoke all on schema store_private from public, anon, authenticated;
grant usage on schema store_private to authenticated;

create table if not exists store_private.admin_users (
    user_id uuid primary key references auth.users (id) on delete cascade
);

revoke all on table store_private.admin_users from public, anon, authenticated;

create or replace function store_private.is_store_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
    select exists (
        select 1
        from store_private.admin_users
        where user_id = (select auth.uid())
    );
$$;

revoke all on function store_private.is_store_admin() from public, anon, authenticated;
grant execute on function store_private.is_store_admin() to authenticated;

create or replace function public.is_store_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
    select store_private.is_store_admin();
$$;

revoke all on function public.is_store_admin() from public, anon, authenticated;
grant execute on function public.is_store_admin() to authenticated;

create table if not exists public.cards (
    id text primary key,
    name text not null,
    detail text not null,
    grade text not null check (grade = 'Raw' or grade ~ '^PSA (10|[1-9])$'),
    title text not null,
    photos jsonb not null default '[]'::jsonb check (
        jsonb_typeof(photos) = 'array' and jsonb_array_length(photos) > 0
    ),
    sales jsonb not null default '[]'::jsonb check (jsonb_typeof(sales) = 'array'),
    created_at timestamptz not null default now()
);

alter table public.cards
    drop constraint if exists cards_photos_check;
alter table public.cards
    add constraint cards_photos_check check (
        jsonb_typeof(photos) = 'array' and jsonb_array_length(photos) > 0
    );

alter table public.cards enable row level security;
revoke all on table public.cards from public, anon, authenticated;
grant select on table public.cards to anon, authenticated;
grant insert, update, delete on table public.cards to authenticated;

drop policy if exists "Cards are publicly readable" on public.cards;
create policy "Cards are publicly readable"
on public.cards for select
to anon, authenticated
using (true);

drop policy if exists "Store admins can insert cards" on public.cards;
create policy "Store admins can insert cards"
on public.cards for insert
to authenticated
with check ((select store_private.is_store_admin()));

drop policy if exists "Store admins can update cards" on public.cards;
create policy "Store admins can update cards"
on public.cards for update
to authenticated
using ((select store_private.is_store_admin()))
with check ((select store_private.is_store_admin()));

drop policy if exists "Store admins can delete cards" on public.cards;
create policy "Store admins can delete cards"
on public.cards for delete
to authenticated
using ((select store_private.is_store_admin()));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
    'card-photos',
    'card-photos',
    true,
    5242880,
    array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Store admins can upload card photos" on storage.objects;
create policy "Store admins can upload card photos"
on storage.objects for insert
to authenticated
with check (
    bucket_id = 'card-photos'
    and (select store_private.is_store_admin())
);

drop policy if exists "Store admins can update card photos" on storage.objects;
create policy "Store admins can update card photos"
on storage.objects for update
to authenticated
using (
    bucket_id = 'card-photos'
    and (select store_private.is_store_admin())
)
with check (
    bucket_id = 'card-photos'
    and (select store_private.is_store_admin())
);

drop policy if exists "Store admins can delete card photos" on storage.objects;
create policy "Store admins can delete card photos"
on storage.objects for delete
to authenticated
using (
    bucket_id = 'card-photos'
    and (select store_private.is_store_admin())
);

-- Replace this email before running the script to allowlist the admin user.
insert into store_private.admin_users (user_id)
select id
from auth.users
where lower(email) = lower('REPLACE_WITH_ADMIN_EMAIL')
on conflict (user_id) do nothing;

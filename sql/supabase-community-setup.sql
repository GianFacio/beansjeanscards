-- Community profiles and personal card collections.
-- Usernames are stored lowercase and the unique constraint is the final authority
-- when concurrent sign-ups or profile updates choose the same username.
-- Run supabase-setup.sql first, then run this script before enabling the community pages.
-- Existing installations can run supabase-community-card-fields.sql for the card form update.
-- Run supabase-community-favorites.sql afterwards to enable favorites.

create table if not exists public.community_profiles (
    id uuid primary key references auth.users (id) on delete cascade,
    username text not null unique
        check (username ~ '^[a-z0-9_]{3,24}$'),
    display_name text not null
        check (char_length(display_name) between 2 and 40),
    bio text not null default ''
        check (char_length(bio) <= 240),
    is_public boolean not null default true,
    collection_public boolean not null default false,
    is_founder boolean not null default false,
    avatar_path text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    check (collection_public = false or is_public),
    check (
        avatar_path is null
        or split_part(avatar_path, '/', 1) = id::text
    )
);

alter table public.community_profiles
    add column if not exists is_founder boolean not null default false;

create index if not exists community_profiles_public_name_idx
    on public.community_profiles (is_public, username);

-- Give accounts that already exist a public profile they can customize later.
insert into public.community_profiles (id, username, display_name)
select
    u.id,
    'collector_' || substr(replace(u.id::text, '-', ''), 1, 13),
    left(coalesce(nullif(trim(u.raw_user_meta_data ->> 'display_name'), ''), 'Collector'), 40)
from auth.users as u
on conflict (id) do nothing;

update public.community_profiles as p
set is_founder = exists (
    select 1
    from store_private.admin_users as admin
    where admin.user_id = p.id
);

alter table public.community_profiles
    alter column is_public set default true;

update public.community_profiles
set is_public = true,
    collection_public = false
where not is_public or collection_public;

alter table public.community_profiles enable row level security;
revoke all on table public.community_profiles from public, anon, authenticated;
revoke update (username, display_name, bio, is_public, collection_public, avatar_path)
    on table public.community_profiles from authenticated;
grant select on table public.community_profiles to anon, authenticated;
grant update (username, display_name, bio, avatar_path)
    on table public.community_profiles to authenticated;
revoke update (is_founder) on table public.community_profiles from authenticated;

drop policy if exists "Public community profiles are discoverable" on public.community_profiles;
drop policy if exists "Community profiles are publicly visible" on public.community_profiles;
create policy "Community profiles are publicly visible"
on public.community_profiles for select
to anon, authenticated
using (true);

drop policy if exists "Members can update their own community profile" on public.community_profiles;
create policy "Members can update their own community profile"
on public.community_profiles for update
to authenticated
using (id = (select auth.uid()))
with check (id = (select auth.uid()));

drop policy if exists "Store admins can update any community profile" on public.community_profiles;
create policy "Store admins can update any community profile"
on public.community_profiles for update
to authenticated
using ((select store_private.is_store_admin()))
with check ((select store_private.is_store_admin()));

create or replace function public.create_community_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
    requested_username text;
    requested_display_name text;
begin
    requested_username := lower(trim(coalesce(new.raw_user_meta_data ->> 'username', '')));
    requested_display_name := trim(coalesce(new.raw_user_meta_data ->> 'display_name', ''));

    insert into public.community_profiles (id, username, display_name)
    values (new.id, requested_username, requested_display_name);

    return new;
end;
$$;

revoke all on function public.create_community_profile() from public, anon, authenticated;

drop trigger if exists create_community_profile_after_signup on auth.users;
create trigger create_community_profile_after_signup
after insert on auth.users
for each row execute function public.create_community_profile();

drop function if exists public.search_community_profiles(text);
create function public.search_community_profiles(search_term text)
returns table (
    id uuid,
    username text,
    display_name text,
    bio text,
    avatar_path text,
    is_founder boolean
)
language sql
stable
security definer
set search_path = ''
as $$
    select p.id, p.username, p.display_name, p.bio, p.avatar_path, p.is_founder
    from public.community_profiles as p
    where (
          trim(coalesce(search_term, '')) = ''
          or (
              char_length(trim(search_term)) = 1
              and starts_with(lower(p.username), lower(trim(search_term)))
          )
          or (
              char_length(trim(search_term)) >= 2
              and strpos(lower(p.username), lower(trim(search_term))) > 0
          )
      )
    order by p.username
    limit 30;
$$;

revoke all on function public.search_community_profiles(text) from public, anon, authenticated;
grant execute on function public.search_community_profiles(text) to anon, authenticated;

create table if not exists public.community_cards (
    id uuid primary key default gen_random_uuid(),
    owner_id uuid not null references public.community_profiles (id) on delete cascade,
    name text not null check (char_length(trim(name)) between 1 and 120),
    detail text not null default '' check (char_length(detail) <= 80),
    grade text not null check (grade = 'Raw' or grade ~ '^PSA (10|[1-9])$'),
    title text check (title is null or char_length(trim(title)) between 1 and 120),
    rotation_enabled boolean,
    is_grail boolean not null default false,
    player text check (player is null or char_length(player) <= 80),
    card_set text check (card_set is null or char_length(card_set) <= 34),
    card_year text check (card_year is null or char_length(card_year) <= 9),
    photo_path text,
    back_photo_path text,
    source_store_card_id text references public.cards (id) on delete cascade,
    created_at timestamptz not null default now(),
    constraint community_cards_photo_source_check check (
        (
            (photo_path is not null or back_photo_path is not null)
            and (photo_path is null or split_part(photo_path, '/', 1) = owner_id::text)
            and (back_photo_path is null or split_part(back_photo_path, '/', 1) = owner_id::text)
        )
        or (
            photo_path is null
            and back_photo_path is null
            and source_store_card_id is not null
        )
    )
);

alter table public.community_cards
    add column if not exists source_store_card_id text references public.cards (id) on delete cascade;
alter table public.community_cards
    add column if not exists back_photo_path text;
alter table public.community_cards
    add column if not exists title text check (title is null or char_length(trim(title)) between 1 and 120);
alter table public.community_cards
    add column if not exists rotation_enabled boolean;
alter table public.community_cards
    add column if not exists is_grail boolean not null default false;
alter table public.community_cards
    add column if not exists player text check (player is null or char_length(player) <= 80);
alter table public.community_cards
    add column if not exists card_set text check (card_set is null or char_length(card_set) <= 34);
alter table public.community_cards
    add column if not exists card_year text check (card_year is null or char_length(card_year) <= 9);
alter table public.community_cards
    alter column photo_path drop not null;
alter table public.community_cards
    drop constraint if exists community_cards_photo_source_check;
alter table public.community_cards
    add constraint community_cards_photo_source_check check (
        (
            (photo_path is not null or back_photo_path is not null)
            and (photo_path is null or split_part(photo_path, '/', 1) = owner_id::text)
            and (back_photo_path is null or split_part(back_photo_path, '/', 1) = owner_id::text)
        )
        or (
            photo_path is null
            and back_photo_path is null
            and source_store_card_id is not null
        )
    );

create index if not exists community_cards_owner_created_idx
    on public.community_cards (owner_id, created_at desc);
create unique index if not exists community_cards_store_source_idx
    on public.community_cards (owner_id, source_store_card_id)
    where source_store_card_id is not null;

alter table public.community_cards enable row level security;
revoke all on table public.community_cards from public, anon, authenticated;
grant select on table public.community_cards to anon, authenticated;
grant delete on table public.community_cards to authenticated;
revoke insert, update on table public.community_cards from authenticated;
grant insert (owner_id, name, detail, grade, title, rotation_enabled, is_grail, player, card_set, card_year, photo_path, back_photo_path)
    on table public.community_cards to authenticated;
grant update (name, detail, grade, title, rotation_enabled, is_grail, player, card_set, card_year, photo_path, back_photo_path)
    on table public.community_cards to authenticated;

drop policy if exists "Members can view their own or public collections" on public.community_cards;
drop policy if exists "Members can view their own collection" on public.community_cards;
drop policy if exists "Community card collections are public" on public.community_cards;
drop policy if exists "Members can add cards to their own collection" on public.community_cards;
drop policy if exists "Members can update cards in their own collection" on public.community_cards;
drop policy if exists "Members can delete cards from their own collection" on public.community_cards;
drop policy if exists "Members and admins can manage their collections" on public.community_cards;
create policy "Community card collections are public"
on public.community_cards for select
to anon, authenticated
using (true);

create policy "Members and admins can manage their collections"
on public.community_cards for all
to authenticated
using (
   owner_id = (select auth.uid())
   or (select store_private.is_store_admin())
)
with check (
   owner_id = (select auth.uid())
   or (select store_private.is_store_admin())
);

-- Seed the existing public store catalog into the store admin's personal collection.
insert into public.community_cards (owner_id, name, detail, grade, source_store_card_id)
select admin.user_id, card.name, card.detail, card.grade, card.id
from store_private.admin_users as admin
cross join public.cards as card
where not exists (
    select 1
    from public.community_cards as existing
    where existing.owner_id = admin.user_id
      and existing.source_store_card_id = card.id
);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
    ('community-avatars', 'community-avatars', false, 5242880, array['image/jpeg', 'image/png', 'image/webp']),
    ('community-card-photos', 'community-card-photos', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Members can upload their own community avatars" on storage.objects;
create policy "Members can upload their own community avatars"
on storage.objects for insert
to authenticated
with check (
    bucket_id = 'community-avatars'
    and (
        (storage.foldername(name))[1] = (select auth.uid())::text
        or (select store_private.is_store_admin())
    )
);

drop policy if exists "Members can view permitted community avatars" on storage.objects;
drop policy if exists "Public community avatars are visible" on storage.objects;
create policy "Public community avatars are visible"
on storage.objects for select
to anon
using (
    bucket_id = 'community-avatars'
    and exists (
        select 1
        from public.community_profiles as p
        where p.avatar_path = name
          and p.is_public
    )
);

create policy "Members can view permitted community avatars"
on storage.objects for select
to authenticated
using (
    bucket_id = 'community-avatars'
    and (
        (select auth.uid())::text = (storage.foldername(name))[1]
        or (select store_private.is_store_admin())
        or exists (
            select 1
            from public.community_profiles as p
            where p.avatar_path = name
              and p.is_public
        )
    )
);

drop policy if exists "Members can delete their own community avatars" on storage.objects;
create policy "Members can delete their own community avatars"
on storage.objects for delete
to authenticated
using (
    bucket_id = 'community-avatars'
    and (
        (storage.foldername(name))[1] = (select auth.uid())::text
        or (select store_private.is_store_admin())
    )
);

drop policy if exists "Members can upload their own community card photos" on storage.objects;
create policy "Members can upload their own community card photos"
on storage.objects for insert
to authenticated
with check (
    bucket_id = 'community-card-photos'
    and (
        (storage.foldername(name))[1] = (select auth.uid())::text
        or (select store_private.is_store_admin())
    )
);

drop policy if exists "Members can view permitted community card photos" on storage.objects;
drop policy if exists "Public community card photos are visible" on storage.objects;
create policy "Public community card photos are visible"
on storage.objects for select
to anon
using (
    bucket_id = 'community-card-photos'
    and exists (
        select 1
        from public.community_cards as c
        where c.photo_path = name
           or c.back_photo_path = name
    )
);

create policy "Members can view permitted community card photos"
on storage.objects for select
to authenticated
using (
    bucket_id = 'community-card-photos'
    and (
        exists (
            select 1
            from public.community_cards as c
            where c.photo_path = name
               or c.back_photo_path = name
        )
        or
        (select auth.uid())::text = (storage.foldername(name))[1]
        or (select store_private.is_store_admin())
    )
);

drop policy if exists "Members can delete their own community card photos" on storage.objects;
create policy "Members can delete their own community card photos"
on storage.objects for delete
to authenticated
using (
    bucket_id = 'community-card-photos'
    and (
        (storage.foldername(name))[1] = (select auth.uid())::text
        or (select store_private.is_store_admin())
    )
);

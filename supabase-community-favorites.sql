-- Run after supabase-community-setup.sql to enable personal favorites.
-- Then run supabase-community-favorite-counts.sql to enable favorite counts.
create table if not exists public.community_favorites (
    user_id uuid not null references auth.users (id) on delete cascade,
    card_id uuid not null references public.community_cards (id) on delete cascade,
    created_at timestamptz not null default now(),
    primary key (user_id, card_id)
);

alter table public.community_favorites enable row level security;
revoke all on table public.community_favorites from public, anon, authenticated;
grant select, insert, delete on table public.community_favorites to authenticated;

drop policy if exists "Members manage their own favorites" on public.community_favorites;
create policy "Members manage their own favorites"
on public.community_favorites for all
to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

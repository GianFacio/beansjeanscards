-- Run in the Supabase SQL Editor. Likes are separate from favorites (bookmarks).
create table if not exists public.community_likes (
    user_id uuid not null references public.community_profiles (id) on delete cascade,
    card_id uuid not null references public.community_cards (id) on delete cascade,
    created_at timestamptz not null default now(),
    primary key (user_id, card_id)
);

create index if not exists community_likes_card_idx on public.community_likes (card_id);

alter table public.community_likes enable row level security;
revoke all on table public.community_likes from public, anon, authenticated;
grant select, insert, delete on table public.community_likes to authenticated;

drop policy if exists "Members manage their own likes" on public.community_likes;
create policy "Members manage their own likes"
on public.community_likes for all to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

create or replace function public.community_like_counts(requested_card_ids uuid[])
returns table (card_id uuid, like_count bigint)
language sql
stable
security definer
set search_path = ''
as $$
    select l.card_id, count(*)::bigint
    from public.community_likes as l
    where l.card_id = any (requested_card_ids)
    group by l.card_id;
$$;

revoke all on function public.community_like_counts(uuid[]) from public, anon;
grant execute on function public.community_like_counts(uuid[]) to authenticated;

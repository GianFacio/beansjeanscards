-- Run after supabase-community-setup.sql to enable following collectors.
-- Follower and following counts are public; the lists are private to each member.
-- A row is also the "started following you" notification, so unfollowing removes it.
create table if not exists public.community_follows (
    follower_id uuid not null references public.community_profiles (id) on delete cascade,
    followed_id uuid not null references public.community_profiles (id) on delete cascade,
    created_at timestamptz not null default now(),
    is_read boolean not null default false,
    primary key (follower_id, followed_id),
    constraint community_follows_not_self check (follower_id <> followed_id)
);

create index if not exists community_follows_followed_created_idx
    on public.community_follows (followed_id, created_at desc);

alter table public.community_follows enable row level security;
revoke all on table public.community_follows from public, anon, authenticated;
grant select on table public.community_follows to authenticated;
grant insert (follower_id, followed_id) on table public.community_follows to authenticated;
grant delete on table public.community_follows to authenticated;
grant update (is_read) on table public.community_follows to authenticated;

drop policy if exists "Members can view their own follows" on public.community_follows;
create policy "Members can view their own follows"
on public.community_follows for select to authenticated
using (
    follower_id = (select auth.uid())
    or followed_id = (select auth.uid())
);

drop policy if exists "Members can follow collectors" on public.community_follows;
create policy "Members can follow collectors"
on public.community_follows for insert to authenticated
with check (follower_id = (select auth.uid()));

drop policy if exists "Members can unfollow collectors" on public.community_follows;
create policy "Members can unfollow collectors"
on public.community_follows for delete to authenticated
using (follower_id = (select auth.uid()));

drop policy if exists "Members can mark their follower notifications" on public.community_follows;
create policy "Members can mark their follower notifications"
on public.community_follows for update to authenticated
using (followed_id = (select auth.uid()))
with check (followed_id = (select auth.uid()));

create or replace function public.community_follow_counts(requested_profile_ids uuid[])
returns table (profile_id uuid, follower_count bigint, following_count bigint)
language sql
stable
security definer
set search_path = ''
as $$
    select
        p.id,
        (select count(*) from public.community_follows as f where f.followed_id = p.id),
        (select count(*) from public.community_follows as f where f.follower_id = p.id)
    from public.community_profiles as p
    where p.id = any (requested_profile_ids);
$$;

revoke all on function public.community_follow_counts(uuid[]) from public, anon, authenticated;
grant execute on function public.community_follow_counts(uuid[]) to anon, authenticated;

-- Run after supabase-community-likes.sql to enable like notifications.
create table if not exists public.community_like_notifications (
    id uuid primary key default gen_random_uuid(),
    recipient_id uuid not null references public.community_profiles (id) on delete cascade,
    actor_id uuid not null references public.community_profiles (id) on delete cascade,
    card_id uuid not null references public.community_cards (id) on delete cascade,
    created_at timestamptz not null default now(),
    is_read boolean not null default false,
    foreign key (actor_id, card_id)
        references public.community_likes (user_id, card_id) on delete cascade
);

create index if not exists community_like_notifications_recipient_created_idx
    on public.community_like_notifications (recipient_id, created_at desc, id desc);
create index if not exists community_like_notifications_like_idx
    on public.community_like_notifications (actor_id, card_id);

alter table public.community_like_notifications enable row level security;
revoke all on table public.community_like_notifications from public, anon, authenticated;
grant select on table public.community_like_notifications to authenticated;
grant update (is_read) on table public.community_like_notifications to authenticated;

drop policy if exists "Members can view their own like notifications" on public.community_like_notifications;
create policy "Members can view their own like notifications"
on public.community_like_notifications for select to authenticated
using (recipient_id = (select auth.uid()));

drop policy if exists "Members can mark their own like notifications" on public.community_like_notifications;
create policy "Members can mark their own like notifications"
on public.community_like_notifications for update to authenticated
using (recipient_id = (select auth.uid()))
with check (recipient_id = (select auth.uid()));

create or replace function public.notify_community_card_like()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
    insert into public.community_like_notifications (recipient_id, actor_id, card_id, created_at)
    select c.owner_id, new.user_id, new.card_id, new.created_at
    from public.community_cards as c
    where c.id = new.card_id and c.owner_id <> new.user_id;
    return new;
end;
$$;

revoke all on function public.notify_community_card_like() from public, anon, authenticated;
drop trigger if exists notify_community_card_like on public.community_likes;
create trigger notify_community_card_like
after insert on public.community_likes
for each row execute function public.notify_community_card_like();

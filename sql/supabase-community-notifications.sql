-- Run after supabase-community-favorites.sql to enable favorite notifications.
create table if not exists public.community_favorite_notifications (
    id uuid primary key default gen_random_uuid(),
    recipient_id uuid not null references public.community_profiles (id) on delete cascade,
    actor_id uuid not null references public.community_profiles (id) on delete cascade,
    card_id uuid not null references public.community_cards (id) on delete cascade,
    created_at timestamptz not null default now(),
    is_read boolean not null default false,
    foreign key (actor_id, card_id)
        references public.community_favorites (user_id, card_id) on delete cascade
);

create index if not exists community_favorite_notifications_recipient_created_idx
    on public.community_favorite_notifications (recipient_id, created_at desc, id desc);
create index if not exists community_favorite_notifications_favorite_idx
    on public.community_favorite_notifications (actor_id, card_id);

alter table public.community_favorite_notifications enable row level security;
revoke all on table public.community_favorite_notifications from public, anon, authenticated;
grant select on table public.community_favorite_notifications to authenticated;
grant update (is_read) on table public.community_favorite_notifications to authenticated;

drop policy if exists "Members can view their own favorite notifications" on public.community_favorite_notifications;
create policy "Members can view their own favorite notifications"
on public.community_favorite_notifications for select to authenticated
using (recipient_id = (select auth.uid()));

drop policy if exists "Members can mark their own favorite notifications" on public.community_favorite_notifications;
create policy "Members can mark their own favorite notifications"
on public.community_favorite_notifications for update to authenticated
using (recipient_id = (select auth.uid()))
with check (recipient_id = (select auth.uid()));

create or replace function public.notify_community_card_favorite()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
    insert into public.community_favorite_notifications (recipient_id, actor_id, card_id, created_at)
    select c.owner_id, new.user_id, new.card_id, new.created_at
    from public.community_cards as c
    where c.id = new.card_id and c.owner_id <> new.user_id;
    return new;
end;
$$;

revoke all on function public.notify_community_card_favorite() from public, anon, authenticated;
drop trigger if exists notify_community_card_favorite on public.community_favorites;
create trigger notify_community_card_favorite
after insert on public.community_favorites
for each row execute function public.notify_community_card_favorite();

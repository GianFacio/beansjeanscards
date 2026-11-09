-- Run once in the Supabase SQL Editor to let members mark a card as a grail (gold border).
alter table public.community_cards
    add column if not exists is_grail boolean not null default false;

grant insert (is_grail) on table public.community_cards to authenticated;
grant update (is_grail) on table public.community_cards to authenticated;

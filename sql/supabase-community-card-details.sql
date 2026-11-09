-- Run once in the Supabase SQL Editor to split card details into player, set, and year.
-- New installations already receive these fields from supabase-community-setup.sql.
-- The detail column keeps the combined "Player · Set · Year" text shown on cards.
alter table public.community_cards
    add column if not exists player text check (player is null or char_length(player) <= 80);
alter table public.community_cards
    add column if not exists card_set text check (card_set is null or char_length(card_set) <= 34);
alter table public.community_cards
    add column if not exists card_year text check (card_year is null or char_length(card_year) <= 9);

grant insert (player, card_set, card_year) on table public.community_cards to authenticated;
grant update (player, card_set, card_year) on table public.community_cards to authenticated;

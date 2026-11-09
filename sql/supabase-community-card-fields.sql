-- Run once in the Supabase SQL Editor for an existing community installation.
-- New installations already receive these fields from supabase-community-setup.sql.
alter table public.community_cards
    add column if not exists title text check (title is null or char_length(trim(title)) between 1 and 120);
alter table public.community_cards
    add column if not exists rotation_enabled boolean;

grant insert (title, rotation_enabled) on table public.community_cards to authenticated;
grant update (title, rotation_enabled) on table public.community_cards to authenticated;

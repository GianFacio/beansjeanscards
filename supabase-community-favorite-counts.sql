-- Run after supabase-community-favorites.sql to enable aggregate favorite counts.
create index if not exists community_favorites_card_id_idx
    on public.community_favorites (card_id);

create or replace function public.community_favorite_counts(requested_card_ids uuid[])
returns table (card_id uuid, favorite_count bigint)
language sql
stable
security definer
set search_path = ''
as $$
    select f.card_id, count(*) as favorite_count
    from public.community_favorites as f
    where f.card_id = any (requested_card_ids)
    group by f.card_id;
$$;

revoke all on function public.community_favorite_counts(uuid[]) from public, anon, authenticated;
grant execute on function public.community_favorite_counts(uuid[]) to authenticated;

-- Run in the Supabase SQL Editor to let collector search start with one character.
-- One character matches usernames that start with it; two or more match anywhere in the username.
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

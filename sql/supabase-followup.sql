-- Allow the signed-in admin page to check its own admin allowlist status.
create or replace function public.is_store_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
    select store_private.is_store_admin();
$$;

revoke all on function public.is_store_admin() from public, anon, authenticated;
grant execute on function public.is_store_admin() to authenticated;

-- Prevent records without photos from breaking the public card gallery.
alter table public.cards
    drop constraint if exists cards_photos_check;
alter table public.cards
    add constraint cards_photos_check check (
        jsonb_typeof(photos) = 'array' and jsonb_array_length(photos) > 0
    );

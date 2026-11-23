-- Ideiglenes MUNKALAP-manager jogosultság Ferenc számára.
-- Más sémát és más alkalmazás adatait nem módosítja.

begin;

alter table munkalap.profiles
  add column if not exists access_expires_at timestamptz;

comment on column munkalap.profiles.access_expires_at is
  'A MUNKALAP-hozzáférés lejárata. NULL esetén nincs időbeli korlátozás.';

create or replace function munkalap_private.is_manager()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from munkalap.profiles
    where id = (select auth.uid())
      and role = 'manager'
      and (access_expires_at is null or access_expires_at > now())
  )
$$;

insert into munkalap.profiles (id, display_name, role, access_expires_at)
select
  id,
  'Ferenc',
  'manager',
  created_at + interval '1 month'
from auth.users
where lower(email) = lower('ferenc@gmail.com')
on conflict (id) do update
set display_name = excluded.display_name,
    role = excluded.role,
    access_expires_at = excluded.access_expires_at;

commit;

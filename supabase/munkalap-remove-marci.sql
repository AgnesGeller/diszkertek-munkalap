-- DÍSZKERTEK MUNKALAP – Marci hozzáférésének megszüntetése.
-- Kizárólag a MUNKALAP sémát és annak hozzáférési szabályát módosítja.
-- A korábbi munkalapok megmaradnak, a Kassza public sémájához nem nyúl.

begin;

do $$
begin
  if not exists (
    select 1
    from munkalap_private.module_identity
    where module_code = 'DISZKERTEK_MUNKALAP'
  ) then
    raise exception 'A MUNKALAP séma nincs telepítve. A művelet leállt.';
  end if;
end
$$;

-- Profil nélkül egy régi vagy megjegyzett munkamenet sem olvashat munkalapot.
drop policy if exists worksheets_read on munkalap.worksheets;
create policy worksheets_read
on munkalap.worksheets
for select
to authenticated
using (
  (select auth.uid()) is not null
  and exists (
    select 1
    from munkalap.profiles
    where id = (select auth.uid())
  )
  and (
    (select munkalap_private.is_manager())
    or user_id = (select auth.uid())
  )
);

delete from munkalap.profiles
where id = (
  select id
  from auth.users
  where lower(email) = 'marci@munkalap.diszkertek.hu'
);

commit;

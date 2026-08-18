-- ============================================================================
-- DÍSZKERTEK MUNKALAP – FELHASZNÁLÓI PROFILOK SZINKRONIZÁLÁSA
-- Célprojekt a Supabase Dashboardon: Kassza
-- Előfeltétel: a munkalap-schema.sql sikeresen lefutott.
-- Ez a fájl nem módosít public táblát és nem hoz létre Auth-felhasználót.
-- ============================================================================

begin;

do $$
begin
  if not exists (
    select 1
    from munkalap_private.module_identity
    where module_code = 'DISZKERTEK_MUNKALAP'
  ) then
    raise exception 'A MUNKALAP séma nincs telepítve. A szinkronizálás leállt.';
  end if;
end
$$;

insert into munkalap.profiles (id, display_name, role)
select
  id,
  case lower(email)
    when 'adam@munkalap.diszkertek.hu' then 'Ádám'
    when 'agi@munkalap.diszkertek.hu' then 'Ági'
    when 'attila@munkalap.diszkertek.hu' then 'Attila'
    when 'bendeguz@munkalap.diszkertek.hu' then 'Bendegúz'
    when 'gabor@munkalap.diszkertek.hu' then 'Gábor'
    when 'marci@munkalap.diszkertek.hu' then 'Marci'
    when 'mark@munkalap.diszkertek.hu' then 'Márk'
    when 'tamas@munkalap.diszkertek.hu' then 'Tamás'
  end,
  case
    when lower(email) in (
      'agi@munkalap.diszkertek.hu',
      'tamas@munkalap.diszkertek.hu'
    ) then 'manager'
    else 'worker'
  end
from auth.users
where lower(email) in (
  'adam@munkalap.diszkertek.hu',
  'agi@munkalap.diszkertek.hu',
  'attila@munkalap.diszkertek.hu',
  'bendeguz@munkalap.diszkertek.hu',
  'gabor@munkalap.diszkertek.hu',
  'marci@munkalap.diszkertek.hu',
  'mark@munkalap.diszkertek.hu',
  'tamas@munkalap.diszkertek.hu'
)
on conflict (id) do update
set display_name = excluded.display_name,
    role = excluded.role;

commit;


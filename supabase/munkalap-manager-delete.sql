-- DÍSZKERTEK MUNKALAP – kizárólag az Iroda egyedi törlési joga.
-- Cél: Kassza Supabase-projekt, munkalap séma.
-- A public (Kassza) sémát és annak tábláit nem módosítja.

begin;

drop policy if exists worksheets_delete_manager on munkalap.worksheets;
create policy worksheets_delete_manager
on munkalap.worksheets
for delete
to authenticated
using (
  (select auth.uid()) is not null
  and (select munkalap_private.is_manager())
);

grant delete on table munkalap.worksheets to authenticated;

commit;

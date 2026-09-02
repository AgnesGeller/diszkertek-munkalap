-- DÍSZKERTEK MUNKALAP – listák és irodai helyettesítés javítása.
-- Kizárólag a munkalap.worksheets szabályait módosítja.
-- A Kassza public sémájához és adataihoz nem nyúl.

begin;

-- Ugyanaz a sorrend határozza meg a szerkeszthető utolsó 10 munkalapot,
-- mint amelyben az alkalmazás a saját listát megjeleníti.
create index if not exists worksheets_user_work_date_idx
  on munkalap.worksheets (user_id, work_date desc, created_at desc, id desc);

create or replace function munkalap_private.is_recent_own(row_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from (
      select id
      from munkalap.worksheets
      where user_id = (select auth.uid())
      order by work_date desc, created_at desc, id desc
      limit 10
    ) recent
    where recent.id = row_id
  )
$$;

revoke all on function munkalap_private.is_recent_own(uuid) from public, anon;
grant execute on function munkalap_private.is_recent_own(uuid) to authenticated, service_role;

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

drop policy if exists worksheets_insert_own on munkalap.worksheets;
create policy worksheets_insert_own
on munkalap.worksheets
for insert
to authenticated
with check (
  (select auth.uid()) is not null
  and (
    (select munkalap_private.is_manager())
    or (
      user_id = (select auth.uid())
      and leader_name = (
        select display_name
        from munkalap.profiles
        where id = (select auth.uid())
      )
    )
  )
);

commit;

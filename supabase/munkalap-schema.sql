-- ============================================================================
-- DÍSZKERTEK MUNKALAP – ADATBÁZIS-SÉMA
-- Célprojekt a Supabase Dashboardon: Kassza
-- Engedélyezett sémák: munkalap, munkalap_private
-- TILOS módosítani: public.entries, public.profiles és minden Kassza-adat.
-- Ez a fájl nem töröl adatot, és nem hoz létre objektumot a public sémában.
-- ============================================================================

begin;

create schema if not exists munkalap;
create schema if not exists munkalap_private;

comment on schema munkalap is
  'A Díszkertek MUNKALAP alkalmazás elkülönített, API-n elérhető adatai.';
comment on schema munkalap_private is
  'A Díszkertek MUNKALAP nem publikus jogosultsági és belső objektumai.';

revoke all on schema munkalap from public, anon;
revoke all on schema munkalap_private from public, anon;
grant usage on schema munkalap to authenticated, service_role;
grant usage on schema munkalap_private to authenticated, service_role;

create table if not exists munkalap_private.module_identity (
  module_code text primary key check (module_code = 'DISZKERTEK_MUNKALAP'),
  installed_at timestamptz not null default now()
);

insert into munkalap_private.module_identity (module_code)
values ('DISZKERTEK_MUNKALAP')
on conflict (module_code) do nothing;

create table if not exists munkalap.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null unique,
  role text not null default 'worker' check (role in ('worker', 'manager')),
  created_at timestamptz not null default now()
);

create table if not exists munkalap.worksheets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete restrict,
  leader_name text not null,
  customer_name text not null,
  address text not null,
  work_date date not null,
  form_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists worksheets_user_created_idx
  on munkalap.worksheets (user_id, created_at desc, id desc);
create index if not exists worksheets_user_work_date_idx
  on munkalap.worksheets (user_id, work_date desc, created_at desc, id desc);
create index if not exists worksheets_date_idx
  on munkalap.worksheets (work_date desc);
create index if not exists worksheets_leader_idx
  on munkalap.worksheets (leader_name);
create index if not exists worksheets_customer_idx
  on munkalap.worksheets (lower(customer_name));
create index if not exists worksheets_address_idx
  on munkalap.worksheets (lower(address));

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
  )
$$;

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

create or replace function munkalap_private.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end
$$;

revoke all on function munkalap_private.is_manager() from public, anon;
revoke all on function munkalap_private.is_recent_own(uuid) from public, anon;
revoke all on function munkalap_private.touch_updated_at() from public, anon;
grant execute on function munkalap_private.is_manager() to authenticated, service_role;
grant execute on function munkalap_private.is_recent_own(uuid) to authenticated, service_role;

drop trigger if exists worksheets_touch_updated_at on munkalap.worksheets;
create trigger worksheets_touch_updated_at
before update on munkalap.worksheets
for each row execute function munkalap_private.touch_updated_at();

alter table munkalap.profiles enable row level security;
alter table munkalap.worksheets enable row level security;

drop policy if exists profiles_read on munkalap.profiles;
create policy profiles_read
on munkalap.profiles
for select
to authenticated
using (
  id = (select auth.uid())
  or (select munkalap_private.is_manager())
);

drop policy if exists worksheets_read on munkalap.worksheets;
create policy worksheets_read
on munkalap.worksheets
for select
to authenticated
using (
  (select auth.uid()) is not null
  and (
    (select munkalap_private.is_manager())
    or (
      user_id = (select auth.uid())
      and (select munkalap_private.is_recent_own(id))
    )
  )
);

drop policy if exists worksheets_insert_own on munkalap.worksheets;
create policy worksheets_insert_own
on munkalap.worksheets
for insert
to authenticated
with check (
  (select auth.uid()) is not null
  and user_id = (select auth.uid())
  and leader_name = (
    select display_name
    from munkalap.profiles
    where id = (select auth.uid())
  )
);

drop policy if exists worksheets_update on munkalap.worksheets;
create policy worksheets_update
on munkalap.worksheets
for update
to authenticated
using (
  (select auth.uid()) is not null
  and (
    (select munkalap_private.is_manager())
    or (
      user_id = (select auth.uid())
      and (select munkalap_private.is_recent_own(id))
    )
  )
)
with check (
  (select auth.uid()) is not null
  and (
    (select munkalap_private.is_manager())
    or (
      user_id = (select auth.uid())
      and (select munkalap_private.is_recent_own(id))
      and leader_name = (
        select display_name
        from munkalap.profiles
        where id = (select auth.uid())
      )
    )
  )
);

drop policy if exists worksheets_delete_manager on munkalap.worksheets;
create policy worksheets_delete_manager
on munkalap.worksheets
for delete
to authenticated
using (
  (select auth.uid()) is not null
  and (select munkalap_private.is_manager())
);

revoke all on all tables in schema munkalap from public, anon;
grant select on table munkalap.profiles to authenticated;
grant select, insert, update, delete on table munkalap.worksheets to authenticated;
grant all on table munkalap.profiles, munkalap.worksheets to service_role;

create or replace function munkalap.database_size()
returns bigint
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  if not (select munkalap_private.is_manager()) then
    raise exception 'Nincs jogosultság.';
  end if;

  return pg_catalog.pg_database_size(pg_catalog.current_database());
end
$$;

revoke all on function munkalap.database_size() from public, anon;
grant execute on function munkalap.database_size() to authenticated, service_role;

do $$
begin
  if not exists (
    select 1
    from pg_catalog.pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'munkalap'
      and tablename = 'worksheets'
  ) then
    alter publication supabase_realtime add table munkalap.worksheets;
  end if;
end
$$;

commit;

-- ============================================================================
-- DÍSZKERTEK MUNKALAP – KÖZPONTI ÜGYFÉLNYILVÁNTARTÁS
-- Kizárólag a munkalap és munkalap_private sémákat módosítja.
-- A Kassza public sémájához és adataihoz nem nyúl.
-- A fájl újrafuttatható, meglévő munkalapot nem töröl.
-- ============================================================================

begin;

create table if not exists munkalap.customers (
  id uuid primary key default gen_random_uuid(),
  full_name text not null check (btrim(full_name) <> ''),
  normalized_name text generated always as (lower(btrim(full_name))) stored,
  active boolean not null default true,
  review_status text not null default 'pending'
    check (review_status in ('pending', 'approved')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (normalized_name)
);

create table if not exists munkalap.customer_locations (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references munkalap.customers(id) on delete cascade,
  label text,
  address text not null check (btrim(address) <> ''),
  normalized_address text generated always as (lower(btrim(address))) stored,
  active boolean not null default true,
  review_status text not null default 'pending'
    check (review_status in ('pending', 'approved')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (customer_id, normalized_address)
);

create table if not exists munkalap.customer_details (
  customer_id uuid primary key references munkalap.customers(id) on delete cascade,
  customer_type text,
  contact_name text,
  email text,
  phone text,
  tax_number text,
  billing_mode text not null default 'per_job'
    check (billing_mode in ('flat_monthly', 'monthly_grouped', 'per_job', 'manual')),
  monthly_flat_fee numeric(14,2) check (monthly_flat_fee is null or monthly_flat_fee >= 0),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists munkalap.customer_contacts (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references munkalap.customers(id) on delete cascade,
  contact_name text,
  email text,
  phone text,
  notes text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table munkalap.worksheets
  add column if not exists customer_id uuid references munkalap.customers(id) on delete restrict,
  add column if not exists location_id uuid references munkalap.customer_locations(id) on delete restrict;

create index if not exists customers_name_idx
  on munkalap.customers (normalized_name);
create index if not exists customer_locations_customer_idx
  on munkalap.customer_locations (customer_id, active, normalized_address);
create index if not exists customer_contacts_customer_id_idx
  on munkalap.customer_contacts (customer_id);
create index if not exists customers_created_by_idx
  on munkalap.customers (created_by);
create index if not exists customer_locations_created_by_idx
  on munkalap.customer_locations (created_by);
create index if not exists worksheets_customer_id_idx
  on munkalap.worksheets (customer_id, work_date desc);
create index if not exists worksheets_location_id_idx
  on munkalap.worksheets (location_id, work_date desc);

drop trigger if exists customers_touch_updated_at on munkalap.customers;
create trigger customers_touch_updated_at
before update on munkalap.customers
for each row execute function munkalap_private.touch_updated_at();

drop trigger if exists customer_locations_touch_updated_at on munkalap.customer_locations;
create trigger customer_locations_touch_updated_at
before update on munkalap.customer_locations
for each row execute function munkalap_private.touch_updated_at();

drop trigger if exists customer_details_touch_updated_at on munkalap.customer_details;
create trigger customer_details_touch_updated_at
before update on munkalap.customer_details
for each row execute function munkalap_private.touch_updated_at();

drop trigger if exists customer_contacts_touch_updated_at on munkalap.customer_contacts;
create trigger customer_contacts_touch_updated_at
before update on munkalap.customer_contacts
for each row execute function munkalap_private.touch_updated_at();

alter table munkalap.customers enable row level security;
alter table munkalap.customer_locations enable row level security;
alter table munkalap.customer_details enable row level security;
alter table munkalap.customer_contacts enable row level security;

drop policy if exists customers_read on munkalap.customers;
create policy customers_read on munkalap.customers
for select to authenticated
using (
  (active and review_status = 'approved')
  or (select munkalap_private.is_manager())
);

drop policy if exists customers_manage on munkalap.customers;
create policy customers_manage on munkalap.customers
for all to authenticated
using ((select munkalap_private.is_manager()))
with check ((select munkalap_private.is_manager()));

drop policy if exists customer_locations_read on munkalap.customer_locations;
create policy customer_locations_read on munkalap.customer_locations
for select to authenticated
using (
  (
    active and review_status = 'approved'
    and exists (
      select 1 from munkalap.customers c
      where c.id = customer_id and c.active and c.review_status = 'approved'
    )
  )
  or (select munkalap_private.is_manager())
);

drop policy if exists customer_locations_manage on munkalap.customer_locations;
create policy customer_locations_manage on munkalap.customer_locations
for all to authenticated
using ((select munkalap_private.is_manager()))
with check ((select munkalap_private.is_manager()));

drop policy if exists customer_details_manage on munkalap.customer_details;
create policy customer_details_manage on munkalap.customer_details
for all to authenticated
using ((select munkalap_private.is_manager()))
with check ((select munkalap_private.is_manager()));

drop policy if exists customer_contacts_manage on munkalap.customer_contacts;
create policy customer_contacts_manage on munkalap.customer_contacts
for all to authenticated
using ((select munkalap_private.is_manager()))
with check ((select munkalap_private.is_manager()));

revoke all on table munkalap.customers, munkalap.customer_locations,
  munkalap.customer_details, munkalap.customer_contacts from public, anon;
grant select on table munkalap.customers, munkalap.customer_locations to authenticated;
grant insert, update, delete on table munkalap.customers, munkalap.customer_locations to authenticated;
grant select, insert, update, delete on table munkalap.customer_details,
  munkalap.customer_contacts to authenticated;
grant all on table munkalap.customers, munkalap.customer_locations,
  munkalap.customer_details, munkalap.customer_contacts to service_role;

create or replace function munkalap.register_customer_suggestion(
  proposed_name text,
  proposed_address text
)
returns table (customer_id uuid, location_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  saved_customer_id uuid;
  saved_location_id uuid;
begin
  if current_user_id is null or not exists (
    select 1 from munkalap.profiles where id = current_user_id
  ) then
    raise exception 'Nincs jogosultság.';
  end if;
  if btrim(coalesce(proposed_name, '')) = '' or btrim(coalesce(proposed_address, '')) = '' then
    raise exception 'Az ügyfél neve és a cím kötelező.';
  end if;

  proposed_name := regexp_replace(btrim(proposed_name), '[[:space:]]+', ' ', 'g');
  proposed_name := regexp_replace(proposed_name, ' zoli$', ' Zoltán', 'i');

  select c.id into saved_customer_id
  from munkalap.customers c
  where c.normalized_name = lower(proposed_name);

  if saved_customer_id is null then
    insert into munkalap.customers (full_name, review_status, created_by)
    values (btrim(proposed_name), 'pending', current_user_id)
    on conflict do nothing
    returning id into saved_customer_id;
    if saved_customer_id is null then
      select c.id into saved_customer_id from munkalap.customers c
      where c.normalized_name = lower(proposed_name);
    end if;
  end if;

  select l.id into saved_location_id
  from munkalap.customer_locations l
  where l.customer_id = saved_customer_id
    and l.normalized_address = lower(btrim(proposed_address));

  if saved_location_id is null then
    insert into munkalap.customer_locations
      (customer_id, address, review_status, created_by)
    values (saved_customer_id, btrim(proposed_address), 'pending', current_user_id)
    on conflict do nothing
    returning id into saved_location_id;
    if saved_location_id is null then
      select l.id into saved_location_id from munkalap.customer_locations l
      where l.customer_id = saved_customer_id
        and l.normalized_address = lower(btrim(proposed_address));
    end if;
  end if;

  return query select saved_customer_id, saved_location_id;
end
$$;

revoke all on function munkalap.register_customer_suggestion(text, text) from public, anon;
grant execute on function munkalap.register_customer_suggestion(text, text)
  to authenticated, service_role;

create or replace function munkalap.save_customer(
  saved_customer_id uuid,
  saved_full_name text,
  saved_active boolean,
  saved_review_status text,
  saved_customer_type text,
  saved_contact_name text,
  saved_email text,
  saved_phone text,
  saved_tax_number text,
  saved_billing_mode text,
  saved_monthly_flat_fee numeric,
  saved_notes text,
  saved_locations jsonb,
  removed_location_ids uuid[] default '{}'::uuid[]
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  result_id uuid;
  location_record jsonb;
  location_id_value uuid;
begin
  if not (select munkalap_private.is_manager()) then
    raise exception 'Nincs jogosultság.';
  end if;
  if btrim(coalesce(saved_full_name, '')) = '' then
    raise exception 'A teljes név kötelező.';
  end if;

  saved_full_name := regexp_replace(btrim(saved_full_name), '[[:space:]]+', ' ', 'g');
  saved_full_name := regexp_replace(saved_full_name, ' zoli$', ' Zoltán', 'i');

  if saved_customer_id is null then
    insert into munkalap.customers (full_name, active, review_status, created_by)
    values (btrim(saved_full_name), saved_active, saved_review_status, (select auth.uid()))
    returning id into result_id;
  else
    update munkalap.customers
    set full_name = btrim(saved_full_name), active = saved_active,
        review_status = saved_review_status
    where id = saved_customer_id
    returning id into result_id;
    if result_id is null then raise exception 'Az ügyfél nem található.'; end if;
  end if;

  insert into munkalap.customer_details (
    customer_id, customer_type, contact_name, email, phone, tax_number,
    billing_mode, monthly_flat_fee, notes
  ) values (
    result_id, nullif(btrim(saved_customer_type), ''), nullif(btrim(saved_contact_name), ''),
    nullif(btrim(saved_email), ''), nullif(btrim(saved_phone), ''),
    nullif(btrim(saved_tax_number), ''), saved_billing_mode, saved_monthly_flat_fee,
    nullif(btrim(saved_notes), '')
  )
  on conflict (customer_id) do update set
    customer_type = excluded.customer_type,
    contact_name = excluded.contact_name,
    email = excluded.email,
    phone = excluded.phone,
    tax_number = excluded.tax_number,
    billing_mode = excluded.billing_mode,
    monthly_flat_fee = excluded.monthly_flat_fee,
    notes = excluded.notes;

  for location_record in select value from jsonb_array_elements(coalesce(saved_locations, '[]'::jsonb))
  loop
    if btrim(coalesce(location_record->>'address', '')) = '' then continue; end if;
    location_id_value := nullif(location_record->>'id', '')::uuid;
    if location_id_value is null then
      insert into munkalap.customer_locations
        (customer_id, label, address, active, review_status, created_by)
      values (
        result_id, nullif(btrim(location_record->>'label'), ''),
        btrim(location_record->>'address'),
        coalesce((location_record->>'active')::boolean, true),
        coalesce(nullif(location_record->>'reviewStatus', ''), saved_review_status),
        (select auth.uid())
      )
      on conflict (customer_id, normalized_address) do update set
        label = excluded.label, active = excluded.active,
        review_status = excluded.review_status;
    else
      update munkalap.customer_locations
      set label = nullif(btrim(location_record->>'label'), ''),
          address = btrim(location_record->>'address'),
          active = coalesce((location_record->>'active')::boolean, true),
          review_status = coalesce(nullif(location_record->>'reviewStatus', ''), saved_review_status)
      where id = location_id_value and customer_id = result_id;
    end if;
  end loop;

  update munkalap.customer_locations
  set active = false
  where customer_id = result_id and id = any(coalesce(removed_location_ids, '{}'::uuid[]));

  return result_id;
end
$$;

revoke all on function munkalap.save_customer(uuid, text, boolean, text, text, text, text, text, text, text, numeric, text, jsonb, uuid[]) from public, anon;
grant execute on function munkalap.save_customer(uuid, text, boolean, text, text, text, text, text, text, text, numeric, text, jsonb, uuid[])
  to authenticated, service_role;

-- A régi munkalapokon szereplő ügyfelek nem vesznek el. Ellenőrzésre váróként
-- kerülnek be, így az Iroda javíthatja/összevonhatja őket, mielőtt megjelennek
-- a dolgozói keresőben.
insert into munkalap.customers (full_name, review_status)
select min(btrim(w.customer_name)), 'pending'
from munkalap.worksheets w
where btrim(coalesce(w.customer_name, '')) <> ''
group by lower(btrim(w.customer_name))
on conflict (normalized_name) do nothing;

insert into munkalap.customer_locations (customer_id, address, review_status)
select c.id, min(btrim(w.address)), 'pending'
from munkalap.worksheets w
join munkalap.customers c
  on c.normalized_name = lower(btrim(w.customer_name))
where btrim(coalesce(w.address, '')) <> ''
group by c.id, lower(btrim(w.address))
on conflict (customer_id, normalized_address) do nothing;

update munkalap.worksheets w
set customer_id = c.id,
    location_id = (
      select l.id
      from munkalap.customer_locations l
      where l.customer_id = c.id
        and l.normalized_address = lower(btrim(w.address))
      limit 1
    )
from munkalap.customers c
where c.normalized_name = lower(btrim(w.customer_name))
  and (w.customer_id is null or w.location_id is null);

commit;

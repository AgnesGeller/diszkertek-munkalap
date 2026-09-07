-- DÍSZKERTEK – Kifizetett munkalap-elszámolások biztonságos Kassza-kapcsolata.
-- A fájl előkészítés; éles futtatása külön történik.

begin;

alter table public.entries
  add column if not exists source_type text,
  add column if not exists source_id uuid;

alter table public.entries
  drop constraint if exists entries_source_pair_check;
alter table public.entries
  add constraint entries_source_pair_check check (
    (source_type is null and source_id is null)
    or
    (source_type = 'munkalap_settlement' and source_id is not null)
  );

create unique index if not exists entries_munkalap_settlement_source_idx
  on public.entries(source_id)
  where source_type = 'munkalap_settlement';

create or replace function munkalap_private.sync_paid_settlement_cash_entry()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  cash_user_id uuid;
  cash_leader_name text;
  cash_address text;
  previous_sync_setting text := current_setting('munkalap.cash_sync', true);
begin
  if tg_op = 'DELETE' then
    perform set_config('munkalap.cash_sync', 'on', true);
    delete from public.entries
    where source_type = 'munkalap_settlement'
      and source_id = old.id;
    perform set_config('munkalap.cash_sync', coalesce(previous_sync_setting, ''), true);
    return old;
  end if;

  if new.status <> 'paid' then
    perform set_config('munkalap.cash_sync', 'on', true);
    delete from public.entries
    where source_type = 'munkalap_settlement'
      and source_id = new.id;
    perform set_config('munkalap.cash_sync', coalesce(previous_sync_setting, ''), true);
    return new;
  end if;

  if round(new.total) <= 0 then
    raise exception using
      errcode = '22023',
      message = 'Nulla forintos elszámolás nem állítható Kifizetve állapotúra.';
  end if;

  select cash_profile.id, cash_profile.display_name
  into cash_user_id, cash_leader_name
  from munkalap.profiles worksheet_profile
  join public.profiles cash_profile
    on lower(btrim(cash_profile.display_name)) = lower(btrim(worksheet_profile.display_name))
   and cash_profile.role = 'manager'
  where worksheet_profile.id = coalesce(auth.uid(), new.created_by)
    and worksheet_profile.role = 'manager'
  limit 1;

  if cash_user_id is null then
    raise exception using
      errcode = '23503',
      message = 'A vezetőhöz nem található megfelelő Kassza-fiók.';
  end if;

  select string_agg(distinct nullif(btrim(source.value->>'address'), ''), ' · ')
  into cash_address
  from jsonb_array_elements(new.source_snapshots) as source(value);

  perform set_config('munkalap.cash_sync', 'on', true);

  insert into public.entries (
    user_id, leader_name, direction, category, transfer_type, designation,
    receipt, entry_date, amount, partner, address, note, source_type, source_id
  ) values (
    cash_user_id,
    cash_leader_name,
    'income',
    'Ügyfélbevétel',
    '',
    'Elszámolás – ' || new.customer_name,
    '',
    current_date,
    round(new.total)::bigint,
    new.customer_name,
    coalesce(cash_address, ''),
    'Kapcsolt munkalap-elszámolás',
    'munkalap_settlement',
    new.id
  )
  on conflict (source_id) where source_type = 'munkalap_settlement'
  do update set
    direction = excluded.direction,
    category = excluded.category,
    transfer_type = excluded.transfer_type,
    designation = excluded.designation,
    receipt = excluded.receipt,
    amount = excluded.amount,
    partner = excluded.partner,
    address = excluded.address,
    note = excluded.note,
    updated_at = now();

  perform set_config('munkalap.cash_sync', coalesce(previous_sync_setting, ''), true);
  return new;
exception
  when others then
    perform set_config('munkalap.cash_sync', coalesce(previous_sync_setting, ''), true);
    raise;
end;
$$;

revoke all on function munkalap_private.sync_paid_settlement_cash_entry() from public, anon, authenticated;

drop trigger if exists billing_settlements_cash_sync on munkalap.billing_settlements;
create trigger billing_settlements_cash_sync
after insert or update of status, total, customer_name, source_snapshots
or delete on munkalap.billing_settlements
for each row execute function munkalap_private.sync_paid_settlement_cash_entry();

create or replace function munkalap_private.protect_linked_cash_entry()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if current_setting('munkalap.cash_sync', true) is distinct from 'on'
    and (
      (tg_op <> 'INSERT' and old.source_type = 'munkalap_settlement')
      or
      (tg_op <> 'DELETE' and new.source_type = 'munkalap_settlement')
    ) then
    raise exception using
      errcode = '42501',
      message = 'Ezt a Kassza-bevételt a kapcsolt elszámolás kezeli. A módosítást az Irodában végezd.';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

revoke all on function munkalap_private.protect_linked_cash_entry() from public, anon, authenticated;

drop trigger if exists entries_protect_munkalap_settlement on public.entries;
create trigger entries_protect_munkalap_settlement
before insert or update or delete on public.entries
for each row execute function munkalap_private.protect_linked_cash_entry();

create or replace function munkalap.billing_cash_links()
returns table (
  settlement_id uuid,
  cash_entry_id uuid,
  cash_entry_date date,
  cash_amount bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  select entry.source_id, entry.id, entry.entry_date, entry.amount
  from public.entries entry
  where entry.source_type = 'munkalap_settlement'
    and auth.uid() is not null
    and munkalap_private.is_manager()
$$;

revoke all on function munkalap.billing_cash_links() from public, anon;
grant execute on function munkalap.billing_cash_links() to authenticated;

commit;

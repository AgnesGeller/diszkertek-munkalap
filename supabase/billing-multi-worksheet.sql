-- Több munkalapos elszámolások. Kizárólag a munkalap sémát érinti.
begin;

create table if not exists munkalap.billing_settlements (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references munkalap.customers(id) on delete set null,
  customer_name text not null check (length(btrim(customer_name)) between 1 and 300),
  period_start date not null,
  period_end date not null,
  source_snapshots jsonb not null default '[]'::jsonb
    check (jsonb_typeof(source_snapshots)='array' and jsonb_array_length(source_snapshots) between 1 and 100),
  items jsonb not null default '[]'::jsonb
    check (jsonb_typeof(items)='array' and jsonb_array_length(items)<=500),
  notes text not null default '' check(length(notes)<=5000),
  status text not null default 'draft' check(status in ('draft','ready','sent','paid')),
  discount_type text not null default 'none' check(discount_type in ('none','amount','percent')),
  discount_value numeric(16,2) not null default 0 check(discount_value>=0),
  subtotal numeric(16,2) not null default 0,
  total numeric(16,2) not null default 0,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check(period_end>=period_start)
);

create table if not exists munkalap.billing_settlement_worksheets (
  settlement_id uuid not null references munkalap.billing_settlements(id) on delete cascade,
  worksheet_id uuid not null references munkalap.worksheets(id) on delete restrict,
  primary key(settlement_id,worksheet_id),
  unique(worksheet_id)
);

alter table munkalap.billing_settlements enable row level security;
alter table munkalap.billing_settlement_worksheets enable row level security;
revoke all on munkalap.billing_settlements,munkalap.billing_settlement_worksheets from public,anon,authenticated;
grant select,insert,update,delete on munkalap.billing_settlements,munkalap.billing_settlement_worksheets to authenticated;

drop policy if exists billing_settlements_manager on munkalap.billing_settlements;
create policy billing_settlements_manager on munkalap.billing_settlements
  for all to authenticated using ((select munkalap_private.is_manager()))
  with check ((select munkalap_private.is_manager()));
drop policy if exists billing_settlement_worksheets_manager on munkalap.billing_settlement_worksheets;
create policy billing_settlement_worksheets_manager on munkalap.billing_settlement_worksheets
  for all to authenticated using ((select munkalap_private.is_manager()))
  with check ((select munkalap_private.is_manager()));

create or replace function munkalap_private.validate_billing_settlement() returns trigger
language plpgsql security invoker set search_path='' as $$
declare item jsonb; q numeric; p numeric; d numeric; amount numeric:=0; discount_amount numeric:=0;
begin
  for item in select value from jsonb_array_elements(new.items) loop
    if jsonb_typeof(item)<>'object' or coalesce(length(btrim(item->>'label')),0) not between 1 and 500
      or coalesce(item->>'quantity','') !~ '^\d+(\.\d{1,3})?$'
      or coalesce(item->>'unitPrice','') !~ '^\d+(\.\d{1,2})?$'
      or coalesce(item->>'divisor','') not in ('1','60')
      or coalesce(item->>'reviewed','') not in ('true','false') then
      raise exception 'Hibás elszámolási tétel.';
    end if;
    q:=(item->>'quantity')::numeric; p:=(item->>'unitPrice')::numeric; d:=(item->>'divisor')::numeric;
    if q<0 or q>1000000 or p<0 or p>100000000 then raise exception 'Túl nagy vagy negatív összeg.'; end if;
    if new.status<>'draft' and not (item->>'reviewed')::boolean then raise exception 'Minden tétel árát ellenőrizni kell.'; end if;
    amount:=amount+q*p/d;
  end loop;
  if new.status<>'draft' and jsonb_array_length(new.items)=0 then raise exception 'Üres elszámolás nem véglegesíthető.'; end if;
  if new.discount_type='percent' and new.discount_value>100 then raise exception 'A kedvezmény legfeljebb 100 százalék lehet.'; end if;
  discount_amount:=case new.discount_type when 'percent' then amount*new.discount_value/100 when 'amount' then new.discount_value else 0 end;
  new.subtotal:=round(amount,2); new.total:=round(greatest(0,amount-discount_amount),2); new.updated_at:=clock_timestamp();
  return new;
end $$;
revoke all on function munkalap_private.validate_billing_settlement() from public,anon;
drop trigger if exists billing_settlements_validate on munkalap.billing_settlements;
create trigger billing_settlements_validate before insert or update on munkalap.billing_settlements
for each row execute function munkalap_private.validate_billing_settlement();

do $$
declare old_row record; new_id uuid;
begin
  if to_regclass('munkalap.billing_drafts') is not null then
    for old_row in select * from munkalap.billing_drafts loop
      if not exists(select 1 from munkalap.billing_settlement_worksheets where worksheet_id=old_row.worksheet_id) then
        insert into munkalap.billing_settlements(customer_id,customer_name,period_start,period_end,source_snapshots,items,notes,status)
        values(null,coalesce(nullif(old_row.source_snapshot->>'customer',''),'Ismeretlen ügyfél'),
          (old_row.source_snapshot->>'date')::date,(old_row.source_snapshot->>'date')::date,
          jsonb_build_array(old_row.source_snapshot),old_row.items,old_row.notes,old_row.status)
        returning id into new_id;
        insert into munkalap.billing_settlement_worksheets(settlement_id,worksheet_id) values(new_id,old_row.worksheet_id);
      end if;
    end loop;
  end if;
end $$;

create index if not exists billing_settlements_period_idx on munkalap.billing_settlements(period_start,period_end);
create index if not exists billing_settlements_customer_idx on munkalap.billing_settlements(customer_id);
create index if not exists billing_settlements_created_by_idx on munkalap.billing_settlements(created_by);
commit;

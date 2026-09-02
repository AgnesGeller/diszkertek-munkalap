-- MUNKALAP: kizárólag irodai árlista és munkalaponkénti elszámolási piszkozatok.
begin;
create table munkalap.billing_prices (
  code text primary key,
  label text not null check(length(btrim(label)) between 1 and 200),
  unit text not null,
  unit_price numeric(12,2) not null check(unit_price >= 0 and unit_price <= 100000000),
  confirmed boolean not null default false,
  updated_at timestamptz not null default now()
);
create table munkalap.billing_drafts (
  worksheet_id uuid primary key references munkalap.worksheets(id) on delete restrict,
  source_snapshot jsonb not null check(jsonb_typeof(source_snapshot)='object'),
  items jsonb not null default '[]'::jsonb check(jsonb_typeof(items)='array' and jsonb_array_length(items)<=200),
  notes text not null default '' check(length(notes)<=5000),
  status text not null default 'draft' check(status in ('draft','ready')),
  total numeric(16,2) not null default 0,
  updated_at timestamptz not null default now()
);
alter table munkalap.billing_prices enable row level security;
alter table munkalap.billing_drafts enable row level security;
revoke all on munkalap.billing_prices,munkalap.billing_drafts from public,anon,authenticated;
grant select,update on munkalap.billing_prices to authenticated;
grant select,insert,update on munkalap.billing_drafts to authenticated;
create policy billing_prices_read on munkalap.billing_prices for select to authenticated using ((select munkalap_private.is_manager()));
create policy billing_prices_edit on munkalap.billing_prices for update to authenticated using ((select munkalap_private.is_manager())) with check ((select munkalap_private.is_manager()));
create policy billing_drafts_read on munkalap.billing_drafts for select to authenticated using ((select munkalap_private.is_manager()));
create policy billing_drafts_add on munkalap.billing_drafts for insert to authenticated with check ((select munkalap_private.is_manager()));
create policy billing_drafts_edit on munkalap.billing_drafts for update to authenticated using ((select munkalap_private.is_manager())) with check ((select munkalap_private.is_manager()));
create trigger billing_prices_touch before update on munkalap.billing_prices for each row execute function munkalap_private.touch_updated_at();
create function munkalap_private.validate_billing_draft() returns trigger
language plpgsql security invoker set search_path='' as $$
declare item jsonb; q numeric; p numeric; d numeric; amount numeric:=0;
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
    if new.status='ready' and not (item->>'reviewed')::boolean then raise exception 'Minden tétel árát ellenőrizni kell.'; end if;
    amount:=amount+q*p/d;
  end loop;
  if new.status='ready' and jsonb_array_length(new.items)=0 then raise exception 'Üres elszámolás nem véglegesíthető.'; end if;
  new.total:=round(amount,2);
  new.updated_at:=clock_timestamp();
  return new;
end $$;
revoke all on function munkalap_private.validate_billing_draft() from public,anon;
create trigger billing_drafts_validate before insert or update on munkalap.billing_drafts for each row execute function munkalap_private.validate_billing_draft();
commit;

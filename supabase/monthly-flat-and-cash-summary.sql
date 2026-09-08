-- Havi átalányok és összesített Kassza-kapcsolat.
-- A Kassza tábláit nem módosítja; kizárólag vezetői összesítést olvas belőlük.

begin;

alter table munkalap.customer_details
  add column if not exists flat_fee_start_month date default date_trunc('month', current_date)::date;

update munkalap.customer_details
set flat_fee_start_month = date '2026-08-01'
where billing_mode = 'flat_monthly'
  and monthly_flat_fee is not null;

alter table munkalap.customer_details
  drop constraint if exists customer_details_flat_fee_start_month_check;
alter table munkalap.customer_details
  add constraint customer_details_flat_fee_start_month_check
  check (flat_fee_start_month is null or flat_fee_start_month = date_trunc('month', flat_fee_start_month)::date);

create or replace function munkalap_private.set_flat_fee_start_month() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if new.billing_mode = 'flat_monthly' then
    if tg_op = 'INSERT' then
      new.flat_fee_start_month := coalesce(new.flat_fee_start_month, date_trunc('month', current_date)::date);
    elsif old.billing_mode is distinct from 'flat_monthly' then
      new.flat_fee_start_month := date_trunc('month', current_date)::date;
    end if;
  elsif new.billing_mode <> 'flat_monthly' then
    new.flat_fee_start_month := null;
  end if;
  return new;
end;
$$;
revoke all on function munkalap_private.set_flat_fee_start_month() from public, anon;
drop trigger if exists customer_details_flat_fee_start_month on munkalap.customer_details;
create trigger customer_details_flat_fee_start_month
before insert or update of billing_mode on munkalap.customer_details
for each row execute function munkalap_private.set_flat_fee_start_month();

alter table munkalap.billing_settlements
  add column if not exists settlement_kind text not null default 'worksheets',
  add column if not exists billing_month date;

alter table munkalap.billing_settlements
  drop constraint if exists billing_settlements_settlement_kind_check;
alter table munkalap.billing_settlements
  add constraint billing_settlements_settlement_kind_check
  check (settlement_kind in ('worksheets', 'flat_monthly'));
alter table munkalap.billing_settlements
  drop constraint if exists billing_settlements_billing_month_check;
alter table munkalap.billing_settlements
  add constraint billing_settlements_billing_month_check check (
    (settlement_kind = 'worksheets' and billing_month is null)
    or
    (settlement_kind = 'flat_monthly' and customer_id is not null
      and billing_month = date_trunc('month', billing_month)::date)
  );

alter table munkalap.billing_settlements
  drop constraint if exists billing_settlements_source_snapshots_check;
alter table munkalap.billing_settlements
  add constraint billing_settlements_source_snapshots_check
  check (jsonb_typeof(source_snapshots) = 'array' and jsonb_array_length(source_snapshots) between 0 and 100);

create unique index if not exists billing_settlements_flat_customer_month_idx
  on munkalap.billing_settlements(customer_id, billing_month)
  where settlement_kind = 'flat_monthly';

create or replace function munkalap.generate_monthly_flat_settlements(
  p_month date default null
) returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  target_month date := coalesce(date_trunc('month', p_month)::date,
    (date_trunc('month', current_date) - interval '1 month')::date);
  inserted_count integer;
begin
  if not munkalap_private.is_manager() then
    raise exception 'Nincs jogosultság havi átalány létrehozására.' using errcode = '42501';
  end if;
  if (p_month is not null and p_month <> target_month)
    or target_month >= date_trunc('month', current_date)::date then
    raise exception 'Csak lezárt hónaphoz hozható létre havi átalány.';
  end if;

  insert into munkalap.billing_settlements (
    customer_id, customer_name, period_start, period_end, source_snapshots, items,
    notes, status, discount_type, discount_value, settlement_kind, billing_month
  )
  select
    customer.id,
    customer.full_name,
    month_start,
    (month_start + interval '1 month - 1 day')::date,
    '[]'::jsonb,
    jsonb_build_array(jsonb_build_object(
      'label', 'Havi átalány – ' || to_char(month_start, 'YYYY.MM'),
      'quantity', '1',
      'unit', 'hónap',
      'unitPrice', detail.monthly_flat_fee::text,
      'divisor', 1,
      'reviewed', true,
      'sourceDate', month_start::text,
      'lineType', 'flat_monthly'
    )),
    '', 'draft', 'none', 0, 'flat_monthly', month_start
  from munkalap.customers customer
  join munkalap.customer_details detail on detail.customer_id = customer.id
  cross join lateral generate_series(
    case when p_month is null then detail.flat_fee_start_month else target_month end,
    target_month,
    interval '1 month'
  ) generated(month_start)
  where customer.active
    and detail.billing_mode = 'flat_monthly'
    and detail.monthly_flat_fee is not null
    and detail.flat_fee_start_month <= month_start
  on conflict (customer_id, billing_month) where settlement_kind = 'flat_monthly' do nothing;

  get diagnostics inserted_count = row_count;
  return inserted_count;
end;
$$;
revoke all on function munkalap.generate_monthly_flat_settlements(date) from public, anon;
grant execute on function munkalap.generate_monthly_flat_settlements(date) to authenticated;

-- Első, idempotens feltöltés: a korábban rögzített kezdőhónaptól pótolja a
-- lezárt havi átalányokat. Később ugyanezt a fenti vezetői függvény végzi.
insert into munkalap.billing_settlements (
  customer_id, customer_name, period_start, period_end, source_snapshots, items,
  notes, status, discount_type, discount_value, settlement_kind, billing_month
)
select
  customer.id,
  customer.full_name,
  month_start,
  (month_start + interval '1 month - 1 day')::date,
  '[]'::jsonb,
  jsonb_build_array(jsonb_build_object(
    'label', 'Havi átalány – ' || to_char(month_start, 'YYYY.MM'),
    'quantity', '1', 'unit', 'hónap', 'unitPrice', detail.monthly_flat_fee::text,
    'divisor', 1, 'reviewed', true, 'sourceDate', month_start::text,
    'lineType', 'flat_monthly'
  )),
  '', 'draft', 'none', 0, 'flat_monthly', month_start
from munkalap.customers customer
join munkalap.customer_details detail on detail.customer_id = customer.id
cross join lateral generate_series(
  detail.flat_fee_start_month,
  (date_trunc('month', current_date) - interval '1 month')::date,
  interval '1 month'
) generated(month_start)
where customer.active
  and detail.billing_mode = 'flat_monthly'
  and detail.monthly_flat_fee is not null
on conflict (customer_id, billing_month) where settlement_kind = 'flat_monthly' do nothing;

create or replace function munkalap.financial_summary(p_from date, p_to date) returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare result jsonb;
begin
  if auth.uid() is null or not munkalap_private.is_manager() then
    raise exception 'Nincs jogosultság pénzügyi összesítés megtekintésére.' using errcode = '42501';
  end if;
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 3660 then
    raise exception 'Hibás vagy túl hosszú időszak.';
  end if;

  select jsonb_build_object(
    'cash_income', coalesce(sum(entry.amount) filter (
      where entry.direction = 'income'
        and coalesce(entry.category, '') <> 'Pénzátvétel – munkatárstól'
    ), 0),
    'cash_expense', coalesce(sum(entry.amount) filter (
      where entry.direction = 'expense'
        and btrim(coalesce(entry.category, '')) in (
          'Működési költség',
          'Ügyfélkiadás',
          'Egyéb kiadás'
        )
    ), 0)
  ) into result
  from public.entries entry
  where entry.entry_date between p_from and p_to;

  return result;
end;
$$;
revoke all on function munkalap.financial_summary(date, date) from public, anon;
grant execute on function munkalap.financial_summary(date, date) to authenticated;

create or replace function munkalap.save_billing_settlement(
  p_settlement_id uuid,
  p_expected_updated_at timestamptz,
  p_customer_id uuid,
  p_customer_name text,
  p_period_start date,
  p_period_end date,
  p_source_snapshots jsonb,
  p_items jsonb,
  p_notes text,
  p_status text,
  p_discount_type text,
  p_discount_value numeric,
  p_worksheet_ids uuid[]
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  saved munkalap.billing_settlements%rowtype;
  other_settlement uuid;
  requested_count integer;
  saved_kind text := 'worksheets';
begin
  if not munkalap_private.is_manager() then
    raise exception 'Nincs jogosultság elszámolás mentésére.' using errcode = '42501';
  end if;

  requested_count := coalesce(array_length(p_worksheet_ids, 1), 0);
  if p_settlement_id is not null then
    select * into saved
    from munkalap.billing_settlements
    where id = p_settlement_id
    for update;
    if not found then raise exception 'Az elszámolás már nem található.'; end if;
    if p_expected_updated_at is null or saved.updated_at <> p_expected_updated_at then
      raise exception 'Az elszámolást közben más módosította. Nyisd meg újra.' using errcode = '40001';
    end if;
    saved_kind := saved.settlement_kind;
  end if;

  if saved_kind = 'flat_monthly' then
    if requested_count <> 0 then raise exception 'A havi átalányhoz nem kapcsolható közvetlenül munkalap.'; end if;
  elsif requested_count < 1 or requested_count > 100 then
    raise exception 'Legalább egy, legfeljebb száz munkalap választható.';
  end if;
  if (select count(distinct worksheet_id) from unnest(coalesce(p_worksheet_ids, '{}'::uuid[])) as worksheet_id) <> requested_count then
    raise exception 'Egy munkalap csak egyszer szerepelhet az elszámolásban.';
  end if;
  if exists (
    select 1 from unnest(coalesce(p_worksheet_ids, '{}'::uuid[])) as requested(worksheet_id)
    left join munkalap.worksheets worksheet on worksheet.id = requested.worksheet_id
    where worksheet.id is null
  ) then raise exception 'A kijelölt munkalapok valamelyike már nem található.'; end if;

  for other_settlement in
    select distinct link.settlement_id from munkalap.billing_settlement_worksheets link
    where link.worksheet_id = any(coalesce(p_worksheet_ids, '{}'::uuid[]))
      and link.settlement_id is distinct from p_settlement_id
  loop
    if exists (
      select 1 from munkalap.billing_settlement_worksheets link
      where link.settlement_id = other_settlement
        and not (link.worksheet_id = any(coalesce(p_worksheet_ids, '{}'::uuid[])))
    ) then raise exception 'Egy korábbi elszámolás teljes munkalapcsoportját ki kell jelölni az összevonáshoz.'; end if;
  end loop;

  if p_settlement_id is null then
    insert into munkalap.billing_settlements (
      customer_id, customer_name, period_start, period_end, source_snapshots,
      items, notes, status, discount_type, discount_value
    ) values (
      p_customer_id, p_customer_name, p_period_start, p_period_end, p_source_snapshots,
      p_items, p_notes, p_status, p_discount_type, p_discount_value
    ) returning * into saved;
  else
    update munkalap.billing_settlements set
      customer_id = p_customer_id, customer_name = p_customer_name,
      period_start = p_period_start, period_end = p_period_end,
      source_snapshots = p_source_snapshots, items = p_items, notes = p_notes,
      status = p_status, discount_type = p_discount_type, discount_value = p_discount_value
    where id = p_settlement_id returning * into saved;
    delete from munkalap.billing_settlement_worksheets where settlement_id = p_settlement_id;
  end if;

  delete from munkalap.billing_settlements settlement
  where settlement.id <> saved.id and exists (
    select 1 from munkalap.billing_settlement_worksheets link
    where link.settlement_id = settlement.id
      and link.worksheet_id = any(coalesce(p_worksheet_ids, '{}'::uuid[]))
  );
  insert into munkalap.billing_settlement_worksheets(settlement_id, worksheet_id)
  select saved.id, requested.worksheet_id
  from unnest(coalesce(p_worksheet_ids, '{}'::uuid[])) as requested(worksheet_id);

  return to_jsonb(saved) || jsonb_build_object('worksheet_ids', to_jsonb(coalesce(p_worksheet_ids, '{}'::uuid[])));
end;
$$;
revoke all on function munkalap.save_billing_settlement(
  uuid, timestamptz, uuid, text, date, date, jsonb, jsonb, text, text, text, numeric, uuid[]
) from public, anon;
grant execute on function munkalap.save_billing_settlement(
  uuid, timestamptz, uuid, text, date, date, jsonb, jsonb, text, text, text, numeric, uuid[]
) to authenticated;

commit;

-- Havi fix kiadások automatikus, duplikációmentes rögzítése a Kasszában.
-- A bejegyzések Tamás vezetői kasszájába kerülnek.

begin;

create table if not exists munkalap_private.recurring_cash_expenses (
  code text primary key check (code ~ '^[a-z0-9_]+$'),
  designation text not null check (length(btrim(designation)) between 1 and 200),
  category text not null default 'Működési költség',
  note text not null default '',
  amount bigint not null check (amount > 0),
  start_month date not null check (start_month = date_trunc('month', start_month)::date),
  end_month date check (end_month is null or end_month = date_trunc('month', end_month)::date),
  active boolean not null default true,
  updated_at timestamptz not null default now(),
  check (end_month is null or end_month >= start_month)
);

create table if not exists munkalap_private.recurring_cash_expense_entries (
  expense_code text not null references munkalap_private.recurring_cash_expenses(code) on delete restrict,
  expense_month date not null check (expense_month = date_trunc('month', expense_month)::date),
  entry_id uuid not null unique references public.entries(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (expense_code, expense_month)
);

revoke all on munkalap_private.recurring_cash_expenses,
  munkalap_private.recurring_cash_expense_entries from public, anon, authenticated;

insert into munkalap_private.recurring_cash_expenses
  (code, designation, category, note, amount, start_month, active)
values
  ('rent', 'Bérleti díj', 'Működési költség', '', 500000, date '2026-08-01', true),
  ('zsolti_costs', 'Költségek Zsolti felé', 'Működési költség', '', 400000, date '2026-08-01', true),
  ('edina_office', 'Költségeim Edina felé', 'Működési költség', 'Irodai költségek', 290000, date '2026-08-01', true),
  ('chatgpt_twice', 'Chat GPT 2x', 'Működési költség', 'Irodai kiadás', 20000, date '2026-08-01', true)
on conflict (code) do nothing;

create or replace function munkalap_private.generate_recurring_cash_expenses_internal(
  p_through_month date
) returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  recurring record;
  month_start date;
  owner_id uuid;
  new_entry_id uuid;
  created_count integer := 0;
begin
  select profile.id into owner_id
  from public.profiles profile
  where profile.display_name = 'Tamás' and profile.role = 'manager'
  limit 1;
  if owner_id is null then
    raise exception 'Tamás vezetői Kassza-profilja nem található.';
  end if;

  for recurring in
    select * from munkalap_private.recurring_cash_expenses
    where active and start_month <= p_through_month
    order by code
    for update
  loop
    for month_start in
      select generated::date from generate_series(
        recurring.start_month,
        least(coalesce(recurring.end_month, p_through_month), p_through_month),
        interval '1 month'
      ) generated
    loop
      if exists (
        select 1 from munkalap_private.recurring_cash_expense_entries link
        where link.expense_code = recurring.code and link.expense_month = month_start
      ) then
        continue;
      end if;

      insert into public.entries (
        user_id, leader_name, direction, category, transfer_type, designation,
        receipt, entry_date, amount, partner, address, note
      ) values (
        owner_id, 'Tamás', 'expense', recurring.category, '', recurring.designation,
        '', month_start, recurring.amount, '', '', recurring.note
      ) returning id into new_entry_id;

      insert into munkalap_private.recurring_cash_expense_entries
        (expense_code, expense_month, entry_id)
      values (recurring.code, month_start, new_entry_id);
      created_count := created_count + 1;
    end loop;
  end loop;
  return created_count;
end;
$$;
revoke all on function munkalap_private.generate_recurring_cash_expenses_internal(date)
  from public, anon, authenticated;

create or replace function munkalap.generate_recurring_cash_expenses(
  p_through_month date default date_trunc('month', current_date)::date
) returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare target_month date := date_trunc('month', p_through_month)::date;
begin
  if auth.uid() is null or not munkalap_private.is_manager() then
    raise exception 'Nincs jogosultság a havi fix kiadások rögzítésére.' using errcode = '42501';
  end if;
  if p_through_month is null or p_through_month <> target_month
    or target_month > date_trunc('month', current_date)::date then
    raise exception 'Hibás havi időszak.';
  end if;
  return munkalap_private.generate_recurring_cash_expenses_internal(target_month);
end;
$$;
revoke all on function munkalap.generate_recurring_cash_expenses(date) from public, anon;
grant execute on function munkalap.generate_recurring_cash_expenses(date) to authenticated;

create or replace function munkalap.list_recurring_cash_expenses()
returns table (
  code text,
  designation text,
  category text,
  note text,
  amount bigint,
  start_month date,
  end_month date,
  active boolean,
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not munkalap_private.is_manager() then
    raise exception 'Nincs jogosultság a havi fix kiadások megtekintésére.' using errcode = '42501';
  end if;
  return query
  select expense.code, expense.designation, expense.category, expense.note,
    expense.amount, expense.start_month, expense.end_month, expense.active, expense.updated_at
  from munkalap_private.recurring_cash_expenses expense
  order by expense.active desc, lower(expense.designation), expense.code;
end;
$$;
revoke all on function munkalap.list_recurring_cash_expenses() from public, anon;
grant execute on function munkalap.list_recurring_cash_expenses() to authenticated;

create or replace function munkalap.save_recurring_cash_expense(
  p_code text,
  p_expected_updated_at timestamptz,
  p_designation text,
  p_category text,
  p_note text,
  p_amount bigint,
  p_start_month date,
  p_end_month date,
  p_active boolean
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  saved munkalap_private.recurring_cash_expenses%rowtype;
  saved_code text := lower(btrim(coalesce(nullif(p_code, ''), 'custom_' || replace(gen_random_uuid()::text, '-', '_'))));
begin
  if auth.uid() is null or not munkalap_private.is_manager() then
    raise exception 'Nincs jogosultság a havi fix kiadás mentésére.' using errcode = '42501';
  end if;
  if saved_code !~ '^[a-z0-9_]+$'
    or length(btrim(coalesce(p_designation, ''))) not between 1 and 200
    or p_category not in ('Működési költség', 'Ügyfélkiadás', 'Egyéb kiadás')
    or p_amount is null or p_amount <= 0
    or p_start_month is null or p_start_month <> date_trunc('month', p_start_month)::date
    or (p_end_month is not null and (p_end_month <> date_trunc('month', p_end_month)::date or p_end_month < p_start_month)) then
    raise exception 'Ellenőrizd a havi fix kiadás adatait.' using errcode = '22023';
  end if;

  select * into saved
  from munkalap_private.recurring_cash_expenses expense
  where expense.code = saved_code
  for update;

  if found then
    if p_expected_updated_at is null or saved.updated_at <> p_expected_updated_at then
      raise exception 'A havi fix kiadást közben más módosította. Frissítsd a listát.' using errcode = '40001';
    end if;
    update munkalap_private.recurring_cash_expenses expense set
      designation = btrim(p_designation), category = p_category,
      note = btrim(coalesce(p_note, '')), amount = p_amount,
      start_month = case when not saved.active and p_active
        then greatest(p_start_month, date_trunc('month', current_date)::date)
        else p_start_month end,
      end_month = p_end_month, active = coalesce(p_active, true), updated_at = clock_timestamp()
    where expense.code = saved_code
    returning * into saved;
  else
    insert into munkalap_private.recurring_cash_expenses
      (code, designation, category, note, amount, start_month, end_month, active)
    values
      (saved_code, btrim(p_designation), p_category, btrim(coalesce(p_note, '')),
       p_amount, p_start_month, p_end_month, coalesce(p_active, true))
    returning * into saved;
  end if;

  return to_jsonb(saved);
end;
$$;
revoke all on function munkalap.save_recurring_cash_expense(text, timestamptz, text, text, text, bigint, date, date, boolean) from public, anon;
grant execute on function munkalap.save_recurring_cash_expense(text, timestamptz, text, text, text, bigint, date, date, boolean) to authenticated;

create or replace function munkalap.delete_recurring_cash_expense(p_code text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not munkalap_private.is_manager() then
    raise exception 'Nincs jogosultság a havi fix kiadás törlésére.' using errcode = '42501';
  end if;
  delete from munkalap_private.recurring_cash_expense_entries link where link.expense_code = p_code;
  delete from munkalap_private.recurring_cash_expenses expense where expense.code = p_code;
  return found;
end;
$$;
revoke all on function munkalap.delete_recurring_cash_expense(text) from public, anon;
grant execute on function munkalap.delete_recurring_cash_expense(text) to authenticated;

-- Első, idempotens feltöltés 2026 augusztusától az aktuális hónapig.
select munkalap_private.generate_recurring_cash_expenses_internal(
  date_trunc('month', current_date)::date
);

commit;

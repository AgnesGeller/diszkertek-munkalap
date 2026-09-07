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
on conflict (code) do update set
  designation = excluded.designation,
  category = excluded.category,
  note = excluded.note,
  amount = excluded.amount,
  start_month = excluded.start_month,
  active = excluded.active,
  updated_at = now();

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

-- Első, idempotens feltöltés 2026 augusztusától az aktuális hónapig.
select munkalap_private.generate_recurring_cash_expenses_internal(
  date_trunc('month', current_date)::date
);

commit;

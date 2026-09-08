-- A havi átalányok és havi fix kiadások kivezetése.
-- A normál munkalapokat, elszámolásokat és kézzel rögzített Kassza-tételeket nem érinti.

begin;

-- A korábbi átalányos ügyfelek munkalapjai továbbra is havi csoportban elszámolhatók.
update munkalap.customer_details
set billing_mode = 'monthly_grouped',
    monthly_flat_fee = null,
    flat_fee_start_month = null
where billing_mode = 'flat_monthly'
   or monthly_flat_fee is not null
   or flat_fee_start_month is not null;

-- Csak az automatikus fix kiadások kapcsolótáblával igazolt Kassza-sorai törlődnek.
select set_config('munkalap.recurring_sync', 'on', true);
delete from public.entries entry
using munkalap_private.recurring_cash_expense_entries link
where entry.id = link.entry_id;

delete from munkalap_private.recurring_cash_expense_entries;
delete from munkalap_private.recurring_cash_expenses;

-- Csak a munkalaphoz nem kapcsolódó, automatikus átalány-piszkozatok törlődnek.
delete from munkalap.billing_settlements settlement
where settlement.settlement_kind = 'flat_monthly'
  and settlement.status = 'draft'
  and not exists (
    select 1
    from munkalap.billing_settlement_worksheets link
    where link.settlement_id = settlement.id
  );

drop function if exists munkalap.generate_monthly_flat_settlements(date);
drop function if exists munkalap.generate_recurring_cash_expenses(date);
drop function if exists munkalap.list_recurring_cash_expenses();
drop function if exists munkalap.save_recurring_cash_expense(text,timestamptz,text,text,text,bigint,date,date,boolean);
drop function if exists munkalap.delete_recurring_cash_expense(text);

-- A Kassza havi-fix kezelőpontjai is megszűnnek; más Kassza-funkciót nem érint.
drop function if exists public.delete_recurring_cash_expense(text);
drop function if exists public.generate_recurring_cash_expenses_for_cash();
drop function if exists public.list_recurring_cash_expenses();
drop function if exists public.save_recurring_cash_expense(text,text,text,text,bigint,date,boolean);
drop function if exists munkalap_private.generate_recurring_cash_expenses_internal(date);

-- A közös Kassza-védelem továbbra is védi a munkalap-elszámolásból létrejött bevételeket.
create or replace function munkalap_private.protect_linked_cash_entry()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (
    current_setting('munkalap.cash_sync', true) is distinct from 'on'
    and (
      (tg_op <> 'INSERT' and old.source_type = 'munkalap_settlement')
      or (tg_op <> 'DELETE' and new.source_type = 'munkalap_settlement')
    )
  ) then
    raise exception using
      errcode = '42501',
      message = 'Ezt a Kassza-tételt az automatikus kapcsolat kezeli. A módosítást a Munkalap elszámolásánál végezd.';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

drop table if exists munkalap_private.recurring_cash_expense_entries;
drop table if exists munkalap_private.recurring_cash_expenses;

commit;

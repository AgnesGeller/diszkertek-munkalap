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

commit;

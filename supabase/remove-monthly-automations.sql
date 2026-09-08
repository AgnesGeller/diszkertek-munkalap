-- A havi átalányok és havi fix kiadások kivezetése.
-- A meglévő ügyfél-, elszámolás- és Kassza-adatokat nem módosítja.

begin;

-- Az ügyfélmentés új végpontja már nem kér havi átalányt. A régi belső
-- megvalósítás a korábban eltárolt értéket változatlanul hagyja.
alter function munkalap.save_customer(
  uuid, text, boolean, text, text, text, text, text, text, text, numeric, text, jsonb, uuid[]
) rename to save_customer_legacy_flat_fee;

revoke all on function munkalap.save_customer_legacy_flat_fee(
  uuid, text, boolean, text, text, text, text, text, text, text, numeric, text, jsonb, uuid[]
) from public, anon, authenticated;

create function munkalap.save_customer(
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
  saved_notes text,
  saved_locations jsonb,
  removed_location_ids uuid[] default '{}'::uuid[]
) returns uuid
language sql
security definer
set search_path = ''
as $$
  select munkalap.save_customer_legacy_flat_fee(
    saved_customer_id, saved_full_name, saved_active, saved_review_status,
    saved_customer_type, saved_contact_name, saved_email, saved_phone,
    saved_tax_number, saved_billing_mode,
    (select detail.monthly_flat_fee
       from munkalap.customer_details detail
      where detail.customer_id = saved_customer_id),
    saved_notes, saved_locations, removed_location_ids
  );
$$;

revoke all on function munkalap.save_customer(
  uuid, text, boolean, text, text, text, text, text, text, text, text, jsonb, uuid[]
) from public, anon;
grant execute on function munkalap.save_customer(
  uuid, text, boolean, text, text, text, text, text, text, text, text, jsonb, uuid[]
) to authenticated, service_role;

drop function if exists munkalap.generate_monthly_flat_settlements(date);
drop function if exists munkalap.generate_recurring_cash_expenses(date);
drop function if exists munkalap.list_recurring_cash_expenses();
drop function if exists munkalap.save_recurring_cash_expense(text,timestamptz,text,text,text,bigint,date,date,boolean);
drop function if exists munkalap.delete_recurring_cash_expense(text);

commit;

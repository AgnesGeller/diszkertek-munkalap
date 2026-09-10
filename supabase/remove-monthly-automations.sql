-- A havi átalányok és havi fix kiadások kivezetése.
-- A meglévő ügyfél-, elszámolás- és Kassza-adatokat nem módosítja.

begin;

-- Az ügyfélmentés véglegesen az átalányparaméter nélküli aláírást használja.
drop function if exists munkalap.save_customer(
  uuid, text, boolean, text, text, text, text, text, text, text, numeric, text, jsonb, uuid[]
);

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
  saved_notes text,
  saved_locations jsonb,
  removed_location_ids uuid[] default '{}'::uuid[]
) returns uuid
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
    billing_mode, notes
  ) values (
    result_id, nullif(btrim(saved_customer_type), ''), nullif(btrim(saved_contact_name), ''),
    nullif(btrim(saved_email), ''), nullif(btrim(saved_phone), ''),
    nullif(btrim(saved_tax_number), ''), saved_billing_mode,
    nullif(btrim(saved_notes), '')
  )
  on conflict (customer_id) do update set
    customer_type = excluded.customer_type,
    contact_name = excluded.contact_name,
    email = excluded.email,
    phone = excluded.phone,
    tax_number = excluded.tax_number,
    billing_mode = excluded.billing_mode,
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

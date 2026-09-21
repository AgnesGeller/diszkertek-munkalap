-- A korábban javított ügyfélnevek visszamenőleges szinkronizálása.
-- Kizárólag a munkalap és munkalap_private sémát érinti.

begin;

create or replace function munkalap_private.sync_customer_name()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  update munkalap.worksheets
  set customer_name = new.full_name,
      form_data = jsonb_set(coalesce(form_data, '{}'::jsonb), '{customerName}', to_jsonb(new.full_name), true)
  where customer_id = new.id
    and (customer_name is distinct from new.full_name
      or form_data ->> 'customerName' is distinct from new.full_name);

  update munkalap.billing_settlements
  set customer_name = new.full_name
  where customer_id = new.id and customer_name is distinct from new.full_name;

  return new;
end
$$;

revoke all on function munkalap_private.sync_customer_name() from public, anon;

update munkalap.worksheets worksheet
set customer_name = customer.full_name,
    form_data = jsonb_set(coalesce(worksheet.form_data, '{}'::jsonb), '{customerName}', to_jsonb(customer.full_name), true)
from munkalap.customers customer
where worksheet.customer_id = customer.id
  and (worksheet.customer_name is distinct from customer.full_name
    or worksheet.form_data ->> 'customerName' is distinct from customer.full_name);

update munkalap.billing_settlements settlement
set customer_name = customer.full_name
from munkalap.customers customer
where settlement.customer_id = customer.id
  and settlement.customer_name is distinct from customer.full_name;

commit;

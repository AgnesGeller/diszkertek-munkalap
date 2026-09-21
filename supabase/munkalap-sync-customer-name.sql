-- A javított ügyfélnév megjelenítése a kapcsolódó munkalapokon és elszámolásokban.
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
  set customer_name = new.full_name
  where customer_id = new.id and customer_name is distinct from new.full_name;

  update munkalap.billing_settlements
  set customer_name = new.full_name
  where customer_id = new.id and customer_name is distinct from new.full_name;

  return new;
end
$$;

revoke all on function munkalap_private.sync_customer_name() from public, anon;

drop trigger if exists customers_sync_name on munkalap.customers;
create trigger customers_sync_name
after update of full_name on munkalap.customers
for each row
when (old.full_name is distinct from new.full_name)
execute function munkalap_private.sync_customer_name();

commit;

-- Irodai ügyféltörlés. Kizárólag a munkalap és munkalap_private sémát érinti.
-- A már munkalaphoz vagy elszámoláshoz használt ügyfél biztonságból nem törölhető.

begin;

create or replace function munkalap.delete_customer_as_manager(p_customer_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null or not (select munkalap_private.is_manager()) then
    raise exception 'Nincs jogosultság az ügyfél törléséhez.';
  end if;

  if not exists (select 1 from munkalap.customers where id = p_customer_id) then
    raise exception 'Az ügyfél nem található.';
  end if;

  if exists (select 1 from munkalap.worksheets where customer_id = p_customer_id)
     or exists (select 1 from munkalap.billing_settlements where customer_id = p_customer_id) then
    raise exception 'Ehhez az ügyfélhez már munkalap vagy elszámolás tartozik. Törlés helyett állítsd inaktívra.';
  end if;

  delete from munkalap.referrer_payouts
  where referrer_id in (
    select id from munkalap.customer_referrers where customer_id = p_customer_id
  );
  delete from munkalap.customer_referrers where customer_id = p_customer_id;
  delete from munkalap.customers where id = p_customer_id;

  return p_customer_id;
end
$$;

revoke all on function munkalap.delete_customer_as_manager(uuid) from public, anon;
grant execute on function munkalap.delete_customer_as_manager(uuid) to authenticated, service_role;

commit;

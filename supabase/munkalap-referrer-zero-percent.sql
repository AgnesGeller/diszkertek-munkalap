-- A név akkor is nyilvántartható, ha az ajánló nem kap jutalékot.
begin;

alter table munkalap.customer_referrers
  drop constraint customer_referrers_percentage_check;
alter table munkalap.customer_referrers
  add constraint customer_referrers_percentage_check
  check (percentage >= 0 and percentage <= 100);

create or replace function munkalap.save_customer_with_referrers(
  saved_customer_id uuid, saved_full_name text, saved_active boolean,
  saved_review_status text, saved_customer_type text, saved_contact_name text,
  saved_email text, saved_phone text, saved_tax_number text,
  saved_billing_mode text, saved_notes text, saved_locations jsonb,
  removed_location_ids uuid[], saved_referrers jsonb
) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  result_id uuid;
  referrer jsonb;
  referrer_id uuid;
  retained_ids uuid[] := '{}'::uuid[];
  total_percentage numeric := 0;
  name_value text;
  percentage_value numeric;
  start_value date;
begin
  if not (select munkalap_private.is_manager()) then
    raise exception 'Nincs jogosultság.';
  end if;
  if jsonb_typeof(saved_referrers) is distinct from 'array' then
    raise exception 'Az ajánlók listája hibás.';
  end if;
  if jsonb_array_length(saved_referrers) > 30 then
    raise exception 'Túl sok ajánló szerepel az ügyfélnél.';
  end if;
  for referrer in select value from jsonb_array_elements(saved_referrers)
  loop
    name_value := regexp_replace(btrim(coalesce(referrer->>'fullName', '')), '[[:space:]]+', ' ', 'g');
    percentage_value := (referrer->>'percentage')::numeric;
    start_value := (referrer->>'startsOn')::date;
    if length(name_value) not between 2 and 160 or percentage_value is null
       or percentage_value < 0 or percentage_value > 100
       or percentage_value <> round(percentage_value, 2) or start_value is null then
      raise exception 'Ellenőrizd az ajánló nevét, százalékát és kezdő dátumát.';
    end if;
    total_percentage := total_percentage + percentage_value;
  end loop;
  if total_percentage > 100 then
    raise exception 'Az ajánlók százalékainak összege nem lehet több 100-nál.';
  end if;

  result_id := munkalap.save_customer(
    saved_customer_id, saved_full_name, saved_active, saved_review_status,
    saved_customer_type, saved_contact_name, saved_email, saved_phone,
    saved_tax_number, saved_billing_mode, saved_notes, saved_locations,
    removed_location_ids
  );

  for referrer in select value from jsonb_array_elements(saved_referrers)
  loop
    referrer_id := nullif(referrer->>'id', '')::uuid;
    name_value := regexp_replace(btrim(referrer->>'fullName'), '[[:space:]]+', ' ', 'g');
    percentage_value := (referrer->>'percentage')::numeric;
    start_value := (referrer->>'startsOn')::date;
    if referrer_id is null then
      insert into munkalap.customer_referrers(customer_id, full_name, percentage, starts_on)
      values (result_id, name_value, percentage_value, start_value)
      returning id into referrer_id;
    else
      update munkalap.customer_referrers
      set full_name = name_value, percentage = percentage_value,
          starts_on = start_value, active = true, updated_at = now()
      where id = referrer_id and customer_id = result_id;
      if not found then raise exception 'Az ajánló nem tartozik ehhez az ügyfélhez.'; end if;
    end if;
    retained_ids := array_append(retained_ids, referrer_id);
  end loop;
  update munkalap.customer_referrers
  set active = false, updated_at = now()
  where customer_id = result_id and active and not (id = any(retained_ids));
  return result_id;
end
$$;

revoke all on function munkalap.save_customer_with_referrers(
  uuid, text, boolean, text, text, text, text, text, text, text, text, jsonb, uuid[], jsonb
) from public, anon;
grant execute on function munkalap.save_customer_with_referrers(
  uuid, text, boolean, text, text, text, text, text, text, text, text, jsonb, uuid[], jsonb
) to authenticated, service_role;

commit;

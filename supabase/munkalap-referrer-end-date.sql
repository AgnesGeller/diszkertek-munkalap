-- Az ajánló törlése lezárja a jutalék időszakát, az előzményt nem törli.
begin;

alter table munkalap.customer_referrers add column ends_on date;

update munkalap.customer_referrers
set ends_on = ((updated_at at time zone 'Europe/Budapest')::date + 1)
where not active and ends_on is null;

create function munkalap_private.close_referrer_period()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.active and not new.active then
    new.ends_on := (clock_timestamp() at time zone 'Europe/Budapest')::date + 1;
  elsif new.active then
    new.ends_on := null;
  end if;
  return new;
end
$$;

create trigger close_referrer_period
before update of active on munkalap.customer_referrers
for each row execute function munkalap_private.close_referrer_period();

revoke all on function munkalap_private.close_referrer_period() from public, anon;

commit;

-- MUNKALAP elszámolási állapotok. A Kassza public sémáját nem érinti.
begin;
alter table munkalap.billing_drafts drop constraint if exists billing_drafts_status_check;
alter table munkalap.billing_drafts add constraint billing_drafts_status_check
  check (status in ('draft','ready','sent','paid'));
create or replace function munkalap_private.validate_billing_draft() returns trigger
language plpgsql security invoker set search_path='' as $$
declare item jsonb; q numeric; p numeric; d numeric; amount numeric:=0;
begin
  for item in select value from jsonb_array_elements(new.items) loop
    if jsonb_typeof(item)<>'object' or coalesce(length(btrim(item->>'label')),0) not between 1 and 500
      or coalesce(item->>'quantity','') !~ '^\d+(\.\d{1,3})?$'
      or coalesce(item->>'unitPrice','') !~ '^\d+(\.\d{1,2})?$'
      or coalesce(item->>'divisor','') not in ('1','60')
      or coalesce(item->>'reviewed','') not in ('true','false') then
      raise exception 'Hibás elszámolási tétel.';
    end if;
    q:=(item->>'quantity')::numeric; p:=(item->>'unitPrice')::numeric; d:=(item->>'divisor')::numeric;
    if q<0 or q>1000000 or p<0 or p>100000000 then raise exception 'Túl nagy vagy negatív összeg.'; end if;
    if new.status<>'draft' and not (item->>'reviewed')::boolean then raise exception 'Minden tétel árát ellenőrizni kell.'; end if;
    amount:=amount+q*p/d;
  end loop;
  if new.status<>'draft' and jsonb_array_length(new.items)=0 then raise exception 'Üres elszámolás nem véglegesíthető.'; end if;
  new.total:=round(amount,2); new.updated_at:=clock_timestamp(); return new;
end $$;
revoke all on function munkalap_private.validate_billing_draft() from public,anon;
commit;

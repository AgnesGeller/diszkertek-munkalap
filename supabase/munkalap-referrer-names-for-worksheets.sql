-- A dolgozó kizárólag az aktív, jóváhagyott ügyfelek ajánlóinak nevét látja.
-- Jutalékszázalékhoz és kifizetéshez nincs hozzáférése.
begin;

create or replace function munkalap.list_customer_referrer_names()
returns table(customer_id uuid, names text)
language sql
stable
security definer
set search_path = ''
as $$
  select r.customer_id, string_agg(r.full_name, ', ' order by r.created_at, r.id)
  from munkalap.customer_referrers r
  join munkalap.customers c on c.id = r.customer_id
  where (select auth.uid()) is not null
    and c.active and c.review_status = 'approved' and r.active
  group by r.customer_id;
$$;

revoke all on function munkalap.list_customer_referrer_names() from public, anon;
grant execute on function munkalap.list_customer_referrer_names() to authenticated, service_role;

commit;

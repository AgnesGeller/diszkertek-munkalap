-- Ügyfél eltávolítása az aktív nyilvántartásból a történeti kapcsolatok megőrzésével.
-- Kizárólag a munkalap és munkalap_private sémát érinti.

begin;

alter table munkalap.customers
add column if not exists archived_at timestamptz;

create index if not exists customers_archived_at_idx
on munkalap.customers(archived_at);

create or replace function munkalap.delete_customer_as_manager(p_customer_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null or not (select munkalap_private.is_manager()) then
    raise exception 'Nincs jogosultság az ügyfél eltávolításához.';
  end if;

  update munkalap.customers
  set active = false, archived_at = now()
  where id = p_customer_id and archived_at is null;

  if not found then
    raise exception 'Az ügyfél nem található, vagy már el lett távolítva.';
  end if;

  return p_customer_id;
end
$$;

revoke all on function munkalap.delete_customer_as_manager(uuid) from public, anon;
grant execute on function munkalap.delete_customer_as_manager(uuid) to authenticated, service_role;

commit;

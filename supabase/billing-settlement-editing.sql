-- Mentett elszámolások munkalapjainak atomikus hozzáadása, kivétele és összevonása.
-- Kizárólag a munkalap és munkalap_private sémát érinti.

begin;

create or replace function munkalap.save_billing_settlement(
  p_settlement_id uuid,
  p_expected_updated_at timestamptz,
  p_customer_id uuid,
  p_customer_name text,
  p_period_start date,
  p_period_end date,
  p_source_snapshots jsonb,
  p_items jsonb,
  p_notes text,
  p_status text,
  p_discount_type text,
  p_discount_value numeric,
  p_worksheet_ids uuid[]
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  saved munkalap.billing_settlements%rowtype;
  other_settlement uuid;
  requested_count integer;
begin
  if not munkalap_private.is_manager() then
    raise exception 'Nincs jogosultság elszámolás mentésére.' using errcode = '42501';
  end if;

  requested_count := coalesce(array_length(p_worksheet_ids, 1), 0);
  if requested_count < 1 or requested_count > 100 then
    raise exception 'Legalább egy, legfeljebb száz munkalap választható.';
  end if;
  if (select count(distinct worksheet_id) from unnest(p_worksheet_ids) as worksheet_id) <> requested_count then
    raise exception 'Egy munkalap csak egyszer szerepelhet az elszámolásban.';
  end if;
  if exists (
    select 1
    from unnest(p_worksheet_ids) as requested(worksheet_id)
    left join munkalap.worksheets worksheet on worksheet.id = requested.worksheet_id
    where worksheet.id is null
  ) then
    raise exception 'A kijelölt munkalapok valamelyike már nem található.';
  end if;

  if p_settlement_id is not null then
    select * into saved
    from munkalap.billing_settlements
    where id = p_settlement_id
    for update;
    if not found then
      raise exception 'Az elszámolás már nem található.';
    end if;
    if p_expected_updated_at is null or saved.updated_at <> p_expected_updated_at then
      raise exception 'Az elszámolást közben más módosította. Nyisd meg újra.' using errcode = '40001';
    end if;
  end if;

  for other_settlement in
    select distinct link.settlement_id
    from munkalap.billing_settlement_worksheets link
    where link.worksheet_id = any(p_worksheet_ids)
      and link.settlement_id is distinct from p_settlement_id
  loop
    if exists (
      select 1
      from munkalap.billing_settlement_worksheets link
      where link.settlement_id = other_settlement
        and not (link.worksheet_id = any(p_worksheet_ids))
    ) then
      raise exception 'Egy korábbi elszámolás teljes munkalapcsoportját ki kell jelölni az összevonáshoz.';
    end if;
  end loop;

  if p_settlement_id is null then
    insert into munkalap.billing_settlements (
      customer_id, customer_name, period_start, period_end, source_snapshots,
      items, notes, status, discount_type, discount_value
    ) values (
      p_customer_id, p_customer_name, p_period_start, p_period_end, p_source_snapshots,
      p_items, p_notes, p_status, p_discount_type, p_discount_value
    ) returning * into saved;
  else
    update munkalap.billing_settlements set
      customer_id = p_customer_id,
      customer_name = p_customer_name,
      period_start = p_period_start,
      period_end = p_period_end,
      source_snapshots = p_source_snapshots,
      items = p_items,
      notes = p_notes,
      status = p_status,
      discount_type = p_discount_type,
      discount_value = p_discount_value
    where id = p_settlement_id
    returning * into saved;

    delete from munkalap.billing_settlement_worksheets
    where settlement_id = p_settlement_id;
  end if;

  delete from munkalap.billing_settlements settlement
  where settlement.id <> saved.id
    and exists (
      select 1
      from munkalap.billing_settlement_worksheets link
      where link.settlement_id = settlement.id
        and link.worksheet_id = any(p_worksheet_ids)
    );

  insert into munkalap.billing_settlement_worksheets (settlement_id, worksheet_id)
  select saved.id, requested.worksheet_id
  from unnest(p_worksheet_ids) as requested(worksheet_id);

  return to_jsonb(saved) || jsonb_build_object('worksheet_ids', to_jsonb(p_worksheet_ids));
end;
$$;

revoke all on function munkalap.save_billing_settlement(
  uuid, timestamptz, uuid, text, date, date, jsonb, jsonb, text, text, text, numeric, uuid[]
) from public, anon;
grant execute on function munkalap.save_billing_settlement(
  uuid, timestamptz, uuid, text, date, date, jsonb, jsonb, text, text, text, numeric, uuid[]
) to authenticated;

commit;

-- DÍSZKERTEK MUNKALAP – biztonságos irodai munkalaptörlés.
-- Kizárólag a munkalap és munkalap_private sémát érinti; a Kassza tábláihoz nem nyúl.
-- Egyetlen munkalaphoz tartozó elszámolást együtt töröl.
-- Több munkalapos elszámolásból csak a végleg törölt munkalap tételei kerülnek ki.
-- Az elszámolás szerkesztőjének „Munkalap kivétele” funkciója ettől független:
-- az csak az elszámolás kapcsolatát bontja, a kitöltött munkalapot nem törli.

begin;

create or replace function munkalap.delete_worksheet_as_manager(p_worksheet_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  linked record;
  worksheet_count integer;
  deleted_id uuid;
  adjusted_settlement boolean := false;
begin
  if auth.uid() is null or not munkalap_private.is_manager() then
    raise exception using errcode = '42501', message = 'A törléshez irodai jogosultság szükséges.';
  end if;

  perform 1
  from munkalap.worksheets
  where id = p_worksheet_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'A munkalap nem található, vagy már törölték.';
  end if;

  for linked in
    select link.settlement_id
    from munkalap.billing_settlement_worksheets link
    where link.worksheet_id = p_worksheet_id
  loop
    select count(*) into worksheet_count
    from munkalap.billing_settlement_worksheets
    where settlement_id = linked.settlement_id;

    if worksheet_count = 1 then
      delete from munkalap.billing_settlements
      where id = linked.settlement_id;
    else
      update munkalap.billing_settlements settlement
      set
        source_snapshots = coalesce((
          select jsonb_agg(source.value order by source.ordinality)
          from jsonb_array_elements(settlement.source_snapshots) with ordinality as source(value, ordinality)
          where source.value->>'worksheetId' is distinct from p_worksheet_id::text
        ), '[]'::jsonb),
        items = coalesce((
          select jsonb_agg(item.value order by item.ordinality)
          from jsonb_array_elements(settlement.items) with ordinality as item(value, ordinality)
          where item.value->>'sourceWorksheetId' is distinct from p_worksheet_id::text
        ), '[]'::jsonb),
        period_start = (
          select min(worksheet.work_date)
          from munkalap.billing_settlement_worksheets remaining
          join munkalap.worksheets worksheet on worksheet.id = remaining.worksheet_id
          where remaining.settlement_id = linked.settlement_id
            and remaining.worksheet_id <> p_worksheet_id
        ),
        period_end = (
          select max(worksheet.work_date)
          from munkalap.billing_settlement_worksheets remaining
          join munkalap.worksheets worksheet on worksheet.id = remaining.worksheet_id
          where remaining.settlement_id = linked.settlement_id
            and remaining.worksheet_id <> p_worksheet_id
        ),
        status = 'draft'
      where settlement.id = linked.settlement_id;

      delete from munkalap.billing_settlement_worksheets
      where settlement_id = linked.settlement_id
        and worksheet_id = p_worksheet_id;

      adjusted_settlement := true;
    end if;
  end loop;

  delete from munkalap.billing_drafts
  where worksheet_id = p_worksheet_id;

  delete from munkalap.worksheets
  where id = p_worksheet_id
  returning id into deleted_id;

  return jsonb_build_object(
    'id', deleted_id,
    'settlement_adjusted', adjusted_settlement
  );
end;
$$;

revoke all on function munkalap.delete_worksheet_as_manager(uuid) from public, anon;
grant execute on function munkalap.delete_worksheet_as_manager(uuid) to authenticated;

commit;

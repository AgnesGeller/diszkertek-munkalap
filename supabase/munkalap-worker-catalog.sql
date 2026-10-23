-- Ár nélküli, dolgozói tételkatalógus és 90 napos használati gyakoriság.
-- Kizárólag a munkalap és munkalap_private sémák objektumait használja.
begin;

create or replace function munkalap.worker_catalog()
returns table (
  code text,
  label text,
  unit text,
  usage_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null or not exists (
    select 1
    from munkalap.profiles profile
    where profile.id = (select auth.uid())
  ) then
    raise exception 'Nincs jogosultság a munkalap tételkatalógusához.'
      using errcode = '42501';
  end if;

  return query
  select
    price.code,
    price.label,
    price.unit,
    (
      select count(*)::bigint
      from munkalap.worksheets worksheet
      where worksheet.work_date >= current_date - 89
        and (
          nullif(btrim(worksheet.form_data ->> price.code), '') is not null
          or exists (
            select 1
            from jsonb_array_elements(
              case
                when jsonb_typeof(worksheet.form_data -> 'catalogItems') = 'array'
                  then worksheet.form_data -> 'catalogItems'
                else '[]'::jsonb
              end
            ) selected_item
            where selected_item ->> 'code' = price.code
              and nullif(btrim(selected_item ->> 'quantity'), '') is not null
          )
        )
    ) as usage_count
  from munkalap.billing_prices price
  where price.active
    and price.code not in (
      'labor',
      'extra_earth_freight',
      'maintenance_21',
      'maintenance_22',
      'construction_19',
      'construction_20',
      'construction_21',
      'construction_22'
    )
  order by usage_count desc, price.label;
end
$$;

comment on function munkalap.worker_catalog() is
  'Ár nélküli tételkatalógus jogosult Munkalap-felhasználóknak, 90 napos használati gyakorisággal.';

revoke all on function munkalap.worker_catalog() from public, anon, authenticated;
grant execute on function munkalap.worker_catalog() to authenticated, service_role;

commit;

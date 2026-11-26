begin;

create table munkalap.procurement_materials (
  id uuid primary key default gen_random_uuid(),
  workbook_key text unique,
  name text not null check (length(btrim(name)) between 1 and 240),
  unit text not null default '' check (length(unit) <= 80),
  category text not null default '' check (length(category) <= 100),
  usage_count integer not null default 0 check (usage_count >= 0),
  unit_weight numeric(12,3) check (unit_weight > 0),
  pallet_quantity numeric(12,3) check (pallet_quantity > 0),
  pallet_tare numeric(12,3) check (pallet_tare >= 0),
  pallet_fee numeric(12,2) check (pallet_fee >= 0),
  is_palletized boolean not null default false,
  list_price numeric(12,2) check (list_price >= 0),
  discount_pct numeric(5,2) check (discount_pct between 0 and 100),
  purchase_price numeric(12,2) check (purchase_price >= 0),
  sale_price numeric(12,2) check (sale_price >= 0),
  accessory_price numeric(12,2) check (accessory_price >= 0),
  accessory_name text not null default '' check (length(accessory_name) <= 240),
  supplier text not null default '' check (length(supplier) <= 240),
  supplier_location text not null default '' check (length(supplier_location) <= 500),
  notes text not null default '' check (length(notes) <= 2000),
  updated_at timestamptz not null default now(),
  check (is_palletized or (pallet_quantity is null and pallet_tare is null and pallet_fee is null))
);

alter table munkalap.procurement_materials enable row level security;
revoke all on munkalap.procurement_materials from public, anon, authenticated;
grant select, insert, update on munkalap.procurement_materials to authenticated;
create policy procurement_materials_managers
  on munkalap.procurement_materials for all to authenticated
  using ((select munkalap_private.is_manager()))
  with check ((select munkalap_private.is_manager()));
create trigger procurement_materials_touch before update on munkalap.procurement_materials
  for each row execute function munkalap_private.touch_updated_at();

commit;

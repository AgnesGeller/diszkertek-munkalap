begin;

alter table munkalap.procurement_materials
  add column order_supplier text not null default '' check (length(order_supplier) <= 240),
  add column supplier_contact_address text not null default '' check (length(supplier_contact_address) <= 500),
  add column supplier_phone text not null default '' check (length(supplier_phone) <= 50),
  add column supplier_contact_url text not null default '' check (length(supplier_contact_url) <= 500),
  add column order_note text not null default '' check (length(order_note) <= 500),
  add column purchase_reference text not null default '' check (length(purchase_reference) <= 500);

commit;

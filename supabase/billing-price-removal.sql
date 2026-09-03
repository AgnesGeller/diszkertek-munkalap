-- A törlés csak az aktív árlistából távolít el; a mentett elszámolások megmaradnak.
alter table munkalap.billing_prices add column if not exists active boolean not null default true;

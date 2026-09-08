-- Az elszámolások és a Kassza biztonságos szétválasztása.
-- A Kassza pénzügyi adatai ezután kizárólag kézi bevétel- és kiadásrögzítésből származnak.
-- Korábbi pénzügyi sort nem töröl, a védelmi infrastruktúrát nem gyengíti.

begin;

drop trigger if exists billing_settlements_cash_sync on munkalap.billing_settlements;

commit;

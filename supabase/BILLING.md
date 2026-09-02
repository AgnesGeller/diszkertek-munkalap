# Irodai költségvetés – első ütem

- Az `office_billing_drafts_and_prices` migráció az élő adatbázisban telepítve.
- Új környezetben a `billing-setup.sql`, majd a `billing-catalog.sql` futtatandó; a séma létrehozását nem kell megismételni.
- A katalógus kizárólag 1 Ft-os, nem egyeztetett induló árakat tartalmaz. Valós árak csak az adatbázisban tárolhatók, a repositoryban nem.
- Árakat és elszámolást kizárólag a `munkalap_private.is_manager()` által igazolt irodai felhasználók olvashatnak/módosíthatnak. A dolgozói munkalapok nem tartalmaznak árat.
- Munkalaponként egy mentett elszámolás, rögzített egységárakkal és munkalap-pillanatképpel. A munkalap törlése mentett elszámolás mellett tiltott.
- Az optimista zárolás megakadályozza, hogy két irodai mentés észrevétlenül felülírja egymást.
- A munkaidő személypercben tárolódik: létszám × (távozás − érkezés). Az óradíjhoz 60-as osztó tartozik. Hibás/éjszakába nyúló időszak kézi ellenőrzésre vár; nem feltételezünk másnapi távozást.
- A végösszeget az adatbázis újraszámolja, két tizedesre kerekítve. Nincs áfa-hozzáadás. A böngésző egész számú részösszegekkel számol, csak a végén kerekít.
- Átalányos ügyfeleknél is teljes óradíjas érték készül. A havi átalány külön összehasonlító adat, nem adódik hozzá automatikusan és nem ismétlődik helyszínenként.
- Állapotok ebben az ütemben: Piszkozat, Ellenőrizve. Ez még nem havi elszámolás, számla vagy e-mail-küldés; nem jelent fizetést.

## Ellenőrzés

`node tests/billing-math.test.cjs`

`billing-security-test.sql`: integrációs teszt üres elszámolású munkalappal; minden tesztmódosítás rollbackkel zárul. Ági/Tamás olvasás, dolgozói/anon tiltás, szerveroldali számítás és ellenőrizetlen árak tesztje.

A projekt Supabase-ellenőrzője nem jelzett új figyelmeztetést a két billing táblára. A már meglévő, közös projektben jelzett Auth- és `public.is_manager` figyelmeztetések nem részei ennek a változtatásnak; más alkalmazás jogosultságait itt nem módosítjuk. [Supabase jogosultsági figyelmeztetések](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable).

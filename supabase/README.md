# MUNKALAP adatbázis-beállítás

A MUNKALAP a meglévő `Kassza` Supabase-projektet használja, de a Kassza
alkalmazástól elkülönített adatbázissémákban működik:

- `munkalap`: kizárólag a MUNKALAP API-n elérhető táblái;
- `munkalap_private`: kizárólag a MUNKALAP nem publikus biztonsági objektumai;
- `public`: a meglévő Kassza táblái, amelyeket a MUNKALAP telepítése nem módosít.

## Biztonságos telepítési sorrend

1. A Supabase Dashboardon nyisd meg a `Kassza` projektet.
2. Ellenőrizd még egyszer, hogy felül a projekt neve `Kassza`.
3. Nyisd meg az **SQL Editor** oldalt, majd egy üres lekérdezést.
4. Futtasd egyszer a `munkalap-schema.sql` teljes tartalmát.
5. Az **Integrations > Data API** beállításában az **Exposed schemas** listához
   add hozzá kizárólag a `munkalap` sémát. A `munkalap_private` sémát tilos
   hozzáadni.
6. Az **Authentication > Users** oldalon hozd létre a MUNKALAP nyolc
   felhasználóját saját, legalább hatjegyű PIN-kóddal:
   - `adam@munkalap.diszkertek.hu`
   - `agi@munkalap.diszkertek.hu`
   - `attila@munkalap.diszkertek.hu`
   - `bendeguz@munkalap.diszkertek.hu`
   - `gabor@munkalap.diszkertek.hu`
   - `marci@munkalap.diszkertek.hu`
   - `mark@munkalap.diszkertek.hu`
   - `tamas@munkalap.diszkertek.hu`
7. Ezután futtasd egyszer a `munkalap-sync-users.sql` teljes tartalmát.
8. A Kassza projekt **Integrations > Data API** oldaláról másold a Project URL-t
   és Publishable key-t a `supabase-config.js` fájlba. `service_role` kulcsot
   tilos a böngészős alkalmazásba vagy GitHubra írni.

Ági és Tamás `manager`, a többi név `worker` jogosultságot kap. Új MUNKALAP
felhasználó felvételekor a névlistát és a `munkalap-sync-users.sql` leképezését
is frissíteni kell, majd a szinkronizálást ismét le kell futtatni.

## Adatvédelem

- A dolgozó csak a saját legutóbbi 10 munkalapját tudja lekérni és módosítani.
- Ági és Tamás minden MUNKALAP-rekordot lát és szerkeszt.
- A MUNKALAP nem kap jogosultságot a `public.entries` vagy `public.profiles`
  táblákhoz.
- A telefonos alkalmazás nem kap törlési jogosultságot a munkalapokhoz.
- A `munkalap_private` séma nem kerülhet az Exposed schemas listába.
- A felhasználói profilokat kézi szinkronizálás készíti; nincs az egész projektre
  ható Auth-trigger.


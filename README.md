# Díszkertek napi munkalap – önálló alkalmazás

Telefonra telepíthető PWA a Canva munkalap mezői alapján.

## Projektelkülönítés

- Önálló helyi és GitHub-projekt: `AgnesGeller/diszkertek-munkalap`.
- A Supabase `Kassza` projekt technikai hátterét használja.
- Kizárólag a `munkalap` és `munkalap_private` adatbázissémákhoz tartozik.
- A Kassza alkalmazás `public` tábláit nem olvassa és nem módosítja.

Az adatbázis biztonságos beállítása: [`supabase/README.md`](supabase/README.md).

## Indítás helyben

```powershell
python -m http.server 8765
```

Helyi, adatbázist és e-mailt nem használó bemutató:
`http://localhost:8765/?bemutato=1` – PIN: `123456`.

## Éles használat

Önálló GitHub Pages alkalmazás. Androidon a böngésző telepítési gombja,
iPhone-on a Safari **Megosztás > Főképernyőhöz adás** menüpontja telepíti.

Az elküldés az aktivált FormSubmit végponton keresztül az
`info@diszkertek.hu` címre történik. Az e-mail csak a ténylegesen kitöltött
mezőket tartalmazza. Ha a közvetlen küldés nem sikerül, a telefon
levelezőalkalmazásával is elküldhető a már előkészített levél.

A dolgozók csak a saját legutóbbi 10 munkalapjukat látják és szerkesztik. Ági
és Tamás az IRODA nézetben minden munkalapot szűrhet, szerkeszthet, Excelbe
menthet vagy PDF-ként nyomtathat.

Az alkalmazás újranyitáskor nem tölti vissza az előző munkalap kitöltött
mezőit. Minden mező üres, csak az aktuális dátum jelenik meg. A böngésző saját
név-, ügyfél- és címjavaslatai használhatók.

A projekt nem használ Netlify-t. A statikus alkalmazást a GitHub Pages
szolgálja ki, az e-mail-küldés közvetlenül a FormSubmit végpontjára történik.

Az e-mail tárgya: `CSOPORTVEZETŐ NEVE - ÉÉÉÉ.HH.NN - MUNKALAP`.

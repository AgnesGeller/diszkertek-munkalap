# Díszkertek napi munkalap - önálló alkalmazás

Telefonra telepíthető PWA a Canva munkalap mezői alapján.

## Indítás helyben

```powershell
python -m http.server 8080
```

Ezután: `http://localhost:8080`

## Éles használat

Önálló GitHub Pages alkalmazás. Androidon a böngésző telepítési gombja, iPhone-on a Safari Megosztás > Főképernyőhöz adás menüpontja telepíti. A telepítéskor a Díszkertek logó és a „Munkalap” név jelenik meg.

Az elküldés az aktivált FormSubmit végponton keresztül az `info@diszkertek.hu` címre történik. Az e-mail csak a ténylegesen kitöltött mezőket tartalmazza.

Az alkalmazás nem tárolja és nem tölti vissza az előző munkalapot. Újranyitáskor minden mező üres, csak az aktuális dátum jelenik meg. A böngésző saját név-, ügyfél- és címjavaslatai használhatók.

A projekt nem használ Netlify-t. A statikus alkalmazást a GitHub Pages szolgálja ki, az e-mail-küldés közvetlenül a FormSubmit végpontjára történik.

A letöltött `index.html` fájl közvetlen megnyitása automatikusan átirányít a működő GitHub Pages alkalmazásra, mert a FormSubmit `file://` oldalról nem enged e-mailt küldeni.

A fejléc, a lábléc, a böngészőikon és a telepített alkalmazás ikonja a Canva munkalapból kinyert eredeti Díszkertek-logót használja.

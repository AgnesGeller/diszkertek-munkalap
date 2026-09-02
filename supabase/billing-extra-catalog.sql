-- Kiegészítő katalógus. Az éles árak kizárólag a védett adatbázisban vannak.
insert into munkalap.billing_prices(code,label,unit,unit_price,confirmed) values
('extra_manure_50','Marhatrágya 50 liter','zsák',1,false),
('extra_soil_load_1','Termőföld ömlesztett – 1 m³/fuvar','fuvar',1,false),
('extra_soil_load_2','Termőföld ömlesztett – 2 m³/fuvar','fuvar',1,false),
('extra_soil_load_3','Termőföld ömlesztett – 3 m³/fuvar','fuvar',1,false),
('extra_red_pine_mulch','Vörös fenyőkéreg (mulcs), ömlesztett','m³',1,false),
('extra_lavender_k2','Levendula New Garden K2','db',1,false),
('extra_fixing_pin','Leszúró tüske','db',1,false),
('extra_irrigation_start','Öntözőrendszer tavaszi indítása','db',1,false),
('extra_excavator','Forgókotró','nap',1,false),
('extra_earth_freight','Földelszállítás fuvardíja','fuvar',1,false),
('extra_plants','Növények – egyedi árral','db',1,false),
('extra_mulch','Mulcs – egyedi árral','m³',1,false)
on conflict(code) do nothing;

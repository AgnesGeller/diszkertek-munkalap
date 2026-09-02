-- Integrációs teszt: minden módosítás visszagörgetve marad.
begin;
select set_config('billing.test_worksheet',(select id::text from munkalap.worksheets where id not in(select worksheet_id from munkalap.billing_drafts) limit 1),true);
select set_config('billing.test_worker',(select id::text from munkalap.profiles where role='worker' limit 1),true);
select set_config('request.jwt.claim.sub',(select id::text from munkalap.profiles where display_name='Ági' and role='manager'),true);
set local role authenticated;
do $$
declare n integer;
begin
 if (select count(*) from munkalap.billing_prices)=0 then raise exception 'Manager nem lát árakat'; end if;
 insert into munkalap.billing_drafts(worksheet_id,source_snapshot,items,total)
 values(current_setting('billing.test_worksheet')::uuid,'{}','[{"label":"4 fő 8 óra","quantity":"1920","unitPrice":"1234","divisor":60,"reviewed":true}]',999);
 if (select total from munkalap.billing_drafts where worksheet_id=current_setting('billing.test_worksheet')::uuid)<>39488 then raise exception 'Hibás végösszeg'; end if;
 update munkalap.billing_drafts set items='[{"label":"1 fő 1 perc","quantity":"1","unitPrice":"1234","divisor":60,"reviewed":true}]',status='ready' where worksheet_id=current_setting('billing.test_worksheet')::uuid;
 if (select total from munkalap.billing_drafts where worksheet_id=current_setting('billing.test_worksheet')::uuid)<>20.57 then raise exception 'Hibás percdíj'; end if;
 begin
   update munkalap.billing_drafts set items='[{"label":"Nem egyeztetett ár","quantity":"1","unitPrice":"1","divisor":1,"reviewed":false}]' where worksheet_id=current_setting('billing.test_worksheet')::uuid;
   raise exception 'Az ellenőrizetlen ár átment';
 exception when raise_exception then if sqlerrm<>'Minden tétel árát ellenőrizni kell.' then raise; end if; end;
 update munkalap.billing_prices set unit_price=2 where code='labor';get diagnostics n=row_count;if n<>1 then raise exception 'Ár nem módosítható';end if;
end $$;
reset role;
select set_config('request.jwt.claim.sub',(select id::text from munkalap.profiles where display_name='Tamás' and role='manager'),true);
set local role authenticated;
do $$ begin if (select count(*) from munkalap.billing_drafts where worksheet_id=current_setting('billing.test_worksheet')::uuid)<>1 then raise exception 'Tamás nem látja Ági elszámolását'; end if;end $$;
select set_config('request.jwt.claim.sub',current_setting('billing.test_worker'),true);
do $$
declare n integer;
begin
 if exists(select 1 from munkalap.billing_prices) or exists(select 1 from munkalap.billing_drafts) then raise exception 'Dolgozó látja az árakat';end if;
 update munkalap.billing_prices set unit_price=3 where code='labor';get diagnostics n=row_count;if n<>0 then raise exception 'Dolgozó árat módosított';end if;
 update munkalap.billing_drafts set notes='tiltott';get diagnostics n=row_count;if n<>0 then raise exception 'Dolgozó elszámolást módosított';end if;
 begin insert into munkalap.billing_drafts(worksheet_id,source_snapshot) values(current_setting('billing.test_worksheet')::uuid,'{}');raise exception 'Dolgozó létrehozhat elszámolást';exception when insufficient_privilege then null;end;
end $$;
reset role;
set local role anon;
do $$ begin
 begin perform * from munkalap.billing_prices;raise exception 'Anon árakat lát';exception when insufficient_privilege then null;end;
 begin perform * from munkalap.billing_drafts;raise exception 'Anon elszámolást lát';exception when insufficient_privilege then null;end;
end $$;
rollback;
select 'PASS: Ági/Tamás hozzáférés, dolgozó/anon tiltás, szerveroldali percdíj és ellenőrzés; tesztadat nem maradt.' as result;

(function(root){
  'use strict';
  const customItemCodes=['maintenance_21','maintenance_22','construction_19','construction_20','construction_21','construction_22'];
  function decimal(value,places,max) {
    const text=String(value??'').trim().replace(',','.');
    if(!new RegExp('^\\d+(?:\\.\\d{1,'+places+'})?$').test(text)||Number(text)>max) throw new Error('Érvénytelen mennyiség vagy egységár.');
    return text;
  }
  function scaled(value,places){const [a,b='']=value.split('.');return BigInt(a)*10n**BigInt(places)+BigInt(b.padEnd(places,'0'));}
  function total(items){
    let sum=0n;
    for(const item of items){
      const q=decimal(item.quantity,3,1000000),p=decimal(item.unitPrice,2,100000000);
      if(![1,60].includes(Number(item.divisor))) throw new Error('Érvénytelen díjegység.');
      sum+=scaled(q,3)*scaled(p,2)*(60n/BigInt(item.divisor));
    }
    const cents=(sum+30000n)/60000n;
    if(cents>100000000000000n) throw new Error('Túl nagy végösszeg.');
    return Number(cents)/100;
  }
  function minutes(value){
    const m=/^(\d{2}):(\d{2})$/.exec(String(value||''));
    if(!m||Number(m[1])>23||Number(m[2])>59) return null;
    return Number(m[1])*60+Number(m[2]);
  }
  function build(item,prices){
    const data=item.data||{},result=[];const labor=prices.find(p=>p.code==='labor');
    if(!labor) throw new Error('A munkadíj hiányzik az árlistából.');
    for(let i=1;i<=3;i++){
      const size=data['team_'+i+'_size'],from=data['team_'+i+'_arrival'],to=data['team_'+i+'_departure'];
      if(!size&&!from&&!to) continue;
      const a=minutes(from),b=minutes(to),n=Number(size);
      const valid=/^\d+$/.test(String(size))&&n>0&&n<=1000&&a!==null&&b!==null&&b>a;
      result.push({label:valid?`Csapat ${i}: ${size} fő, ${from}–${to} (${b-a} perc/fő)`:`Csapat ${i}: hiányos vagy hibás munkaidő, ellenőrizendő`,quantity:String(valid?n*(b-a):0),unit:'főperc',unitPrice:String(labor.active===false?0:labor.unit_price),divisor:60,reviewed:valid&&labor.confirmed&&labor.active!==false,sourceCode:'team_'+i});
    }
    const customCodesInUse=new Set();
    for(const code of customItemCodes){
      const label=String(data[code]||'').trim(),quantityText=String(data[code+'_quantity']||'').trim(),unit=String(data[code+'_unit']||'').trim(),priceText=String(data[code+'_price']||'').trim();
      if(!label&&!quantityText&&!unit&&!priceText) continue;
      customCodesInUse.add(code);
      let quantity=quantityText?'0':'1',unitPrice='0';
      if(quantityText)try{quantity=decimal(quantityText,3,1000000);}catch(_){}
      if(priceText)try{unitPrice=decimal(priceText,2,100000000);}catch(_){}
      result.push({label:label||'Egyéb tétel',quantity,unit:unit||'tétel',unitPrice,divisor:1,reviewed:false,sourceCode:code});
    }
    const catalogItems=Array.isArray(data.catalogItems)?data.catalogItems:[];
    for(const selected of catalogItems){
      const code=String(selected?.code||'').trim(),quantityText=String(selected?.quantity||'').trim();
      if(!code||!quantityText||String(data[code]||'').trim())continue;
      const price=prices.find(item=>item.code===code),label=price?.label||String(selected?.label||'Tétel').trim()||'Tétel',unit=price?.unit||String(selected?.unit||'tétel').trim()||'tétel';
      let quantity='0',numeric=true;try{quantity=decimal(quantityText,3,1000000);}catch(_){numeric=false;}
      result.push({label:label+(price?.active===false?' – kézi árazás szükséges':''),quantity,unit,unitPrice:String(price&&price.active!==false?price.unit_price:0),divisor:1,reviewed:Boolean(numeric&&price?.confirmed&&price.active!==false),sourceCode:code});
    }
    for(const price of prices){
      if(price.code==='labor') continue;
      if(customCodesInUse.has(price.code)) continue;
      const value=String(data[price.code]||'').trim();if(!value) continue;
      let quantity='1',numeric=true;try{quantity=decimal(value,3,1000000);}catch(_){numeric=false;}
      result.push({label:price.label+(numeric?'':': '+value)+(price.active===false?' – kézi árazás szükséges':''),quantity,unit:price.unit,unitPrice:String(price.active===false?0:price.unit_price),divisor:1,reviewed:numeric&&price.confirmed&&price.active!==false,sourceCode:price.code});
    }
    const earth=Number(String(data.construction_3||'').replace(',','.'));
    const freight=prices.find(p=>p.code==='extra_earth_freight');
    if(earth>0&&Number.isFinite(earth)&&freight){
      result.push({label:freight.label,quantity:'1',unit:freight.unit,unitPrice:String(freight.active===false?0:freight.unit_price),divisor:1,reviewed:false,sourceCode:freight.code});
    }
    for(const key of ['subcontractor','rental1','rental2','rental3']){
      if(data[key]) result.push({label:(key==='subcontractor'?'Alvállalkozó: ':'Gépbérlés: ')+data[key],quantity:'1',unit:'tétel',unitPrice:'0',divisor:1,reviewed:false,sourceCode:key});
    }
    return result;
  }
  function hasLowValueItem(items){return (items||[]).some(item=>{try{const value=total([item]);return value>0&&value<1000;}catch(_){return false;}});}
  function hasUnpricedCustomItem(items){return (items||[]).some(item=>customItemCodes.includes(item.sourceCode)&&!(Number(item.unitPrice)>0));}
  function needsItemReview(items){return hasLowValueItem(items)||hasUnpricedCustomItem(items);}
  function catalogMatches(prices,query){
    const normalize=value=>String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
    const needle=normalize(query);
    if(needle.length<3)return [];
    return (prices||[]).filter(price=>price.active!==false&&normalize(price.label).includes(needle));
  }
  const api={decimal,total,minutes,build,hasLowValueItem,hasUnpricedCustomItem,needsItemReview,catalogMatches};
  if(typeof module==='object'&&module.exports) module.exports=api;else root.BillingMath=api;
})(typeof window==='undefined'?globalThis:window);


// ===================== Panels: creator, clothes, garage, guns, settings =====================
let shopCtx=null;
const el=(tag,cls,txt)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(txt!==undefined)e.textContent=txt;return e};
function panel(title,sub,tabs,onTab,foot){
  $('pTitle').textContent=title;$('pSub').textContent=sub||'';const pt=$('pTabs');pt.innerHTML='';pt.hidden=!tabs;
  if(tabs)tabs.forEach((t,i)=>{const b=el('button','tab'+(i?'':' on'),t);b.type='button';b.onclick=()=>{[...pt.children].forEach(c=>c.classList.remove('on'));b.classList.add('on');onTab(t)};pt.append(b)});
  $('pFoot').hidden=!foot;$('panel').hidden=false;onTab(tabs?tabs[0]:null);
}
function closePanel(){$('panel').hidden=true;shopCtx=null}
function stepRow(label,opts,get,set,priceOf){
  const r=el('div','row'),lab=el('div','lab');lab.append(el('span','',label));const pr=el('b','');lab.append(pr);r.append(lab);
  const st=el('div','step'),a=el('button','','◀'),v=el('span',''),b=el('button','','▶');a.type=b.type='button';st.append(a,v,b);r.append(st);
  const upd=()=>{v.textContent=opts[get()];pr.textContent=priceOf?priceOf(get()):''};
  a.onclick=()=>{set((get()-1+opts.length)%opts.length);upd();sfx.click()};b.onclick=()=>{set((get()+1)%opts.length);upd();sfx.click()};upd();return r;
}
function swRow(label,colors,get,set,price){
  const r=el('div','row'),lab=el('div','lab');lab.append(el('span','',label));if(price)lab.append(el('b','',price));r.append(lab);
  const sw=el('div','sw');colors.forEach((c,i)=>{const b=el('button',get()===i?'on':'');b.type='button';b.style.background=c;b.setAttribute('aria-label','Color '+(i+1));b.onclick=()=>{set(i);[...sw.children].forEach(x=>x.classList.remove('on'));b.classList.add('on');sfx.click()};sw.append(b)});r.append(sw);return r;
}
function segRow(label,opts,get,set){const r=el('div','row');r.append(el('div','lab',label));const s=el('div','seg');
  opts.forEach(([v,t])=>{const b=el('button',get()===v?'on':'',t);b.type='button';b.onclick=()=>{set(v);[...s.children].forEach(x=>x.classList.remove('on'));b.classList.add('on');sfx.click()};s.append(b)});r.append(s);return r}
function setCost(cost,label){const c=$('pCost');c.textContent=cost?label+' '+fmt(cost):label||'';c.className=cost>save.money?'no':'';$('pOk').disabled=cost>save.money}

// Character creator / clothing store
function openCreator(free,after){
  const orig=JSON.parse(JSON.stringify(save.char||DEF_CHAR)),cfg=JSON.parse(JSON.stringify(orig));shopCtx={kind:'char'};state='shop';
  const cost=()=>free?0:Object.keys(cfg).filter(k=>cfg[k]!==orig[k]).length*60;
  const rebuild=()=>{save.char=cfg;buildPlayer();player.model.g.position.set(player.x,player.y,player.z);player.model.g.rotation.y=player.a;animPerson(player.model,0,'walk',0);setCost(cost(),free?'Free':'Total')};
  const bodyOf=k=>{const B=$('pBody');B.innerHTML='';
    const S=(lab,key)=>B.append(stepRow(lab,OPTS[key],()=>cfg[key],v=>{cfg[key]=v;rebuild()}));
    const W=(lab,key,list)=>B.append(swRow(lab,list,()=>cfg[key],v=>{cfg[key]=v;rebuild()}));
    if(CHARS.ready){const f=cfg.frame===1,fixed=t=>B.append(el('p','fine',t));
      if(k==='Body'){S('Body type','frame');if(!f)W('Skin tone','skin',SKIN);else fixed('This body has a fixed skin tone and outfit.')}
      if(k==='Hair'){if(!f){S('Style','hair');W('Color','hairColor',HAIRC);S('Facial hair','beard')}else fixed('This body has a fixed hairstyle.')}
      if(k==='Head'){S('Hat','hat');W('Hat color','hatColor',CLOTH);S('Eyewear','glasses')}
      if(k==='Top'){if(!f){S('Outfit','orig');W('Top color','topColor',CLOTH)}S('Chain','chain')}
      if(k==='Legs'){if(!f){W('Pants color','legsColor',CLOTH);W('Shoes color','shoesColor',CLOTH)}else fixed('This body has a fixed outfit.')}
      return}
    if(k==='Body'){S('Body type','frame');W('Skin tone','skin',SKIN);S('Build','build')}
    if(k==='Hair'){S('Style','hair');W('Color','hairColor',HAIRC)}
    if(k==='Head'){S('Hat','hat');W('Hat color','hatColor',CLOTH);S('Eyewear','glasses')}
    if(k==='Top'){S('Style','top');W('Color','topColor',CLOTH);S('Chain','chain')}
    if(k==='Legs'){S('Style','legs');W('Color','legsColor',CLOTH);W('Shoes','shoesColor',CLOTH)}
  };
  panel(free?'Create your character':'Threadz',free?'Pick a look. You can change it later at any Threadz store.':'Each change costs $60',['Body','Hair','Head','Top','Legs'],bodyOf,true);
  $('pOk').textContent=free?'Start':'Buy';$('pNo').hidden=free;
  $('pOk').onclick=()=>{const c=cost();if(c>save.money)return;save.money-=c;save.char=cfg;persist();closePanel();state='play';if(c)toast('Looking sharp. -'+fmt(c),'cash',1.6);if(after)after()};
  $('pNo').onclick=()=>{save.char=orig;buildPlayer();closePanel();state='play'};
  rebuild();
}
// Mod garage
function priceDiff(o,s){let p=0;if(s.color!==o.color)p+=200;if(s.finish!==o.finish)p+=FINISH[s.finish].p||100;if(s.rim!==o.rim)p+=RIMS[s.rim]||100;if(s.rimColor!==o.rimColor)p+=150;
  if(s.spoiler!==o.spoiler)p+=SPOILERS[s.spoiler]||100;if(s.neon!==o.neon)p+=s.neon==='Off'?0:800;if(s.tint!==o.tint)p+=[0,150,300][s.tint];if(s.low!==o.low)p+=s.low?500:0;
  for(let l=o.engine+1;l<=s.engine;l++)p+=[0,1500,3500,7000][l];for(let l=o.armor+1;l<=s.armor;l++)p+=[0,1200,2800,6000][l];if(s.nitro&&!o.nitro)p+=2500;return p}
function openGarage(car){
  const orig=Object.assign({},DEF_SPEC,car.spec||{color:'#'+car.m.paint.color.clone().convertLinearToSRGB().getHexString()}),s=Object.assign({},orig);
  shopCtx={kind:'garage',car};state='shop';car.v=0;car.vel={x:0,z:0};
  const upd=()=>{applyMods(car,s);setCost(priceDiff(orig,s),'Total')};
  const names=o=>Object.keys(o);
  const bodyOf=k=>{const B=$('pBody');B.innerHTML='';
    const S=(lab,key,list,price)=>{const idx=()=>list.indexOf(s[key]);B.append(stepRow(lab,list,idx,v=>{s[key]=list[v];upd()},i=>price?price(list[i]):''))};
    if(k==='Paint'){B.append(swRow('Color',PAINT,()=>PAINT.indexOf(s.color),v=>{s.color=PAINT[v];upd()},'$200'));S('Finish','finish',names(FINISH),v=>FINISH[v].p?fmt(FINISH[v].p):'')}
    if(k==='Wheels'){S('Rims','rim',names(RIMS),v=>RIMS[v]?fmt(RIMS[v]):'');B.append(swRow('Rim color',PAINT,()=>PAINT.indexOf(s.rimColor),v=>{s.rimColor=PAINT[v];upd()},'$150'))}
    if(k==='Body'){S('Spoiler','spoiler',names(SPOILERS),v=>SPOILERS[v]?fmt(SPOILERS[v]):'');B.append(segRow('Suspension',[[false,'Stock'],[true,'Lowered $500']],()=>s.low,v=>{s.low=v;upd()}))}
    if(k==='Lights'){S('Neon underglow','neon',names(NEON),v=>v==='Off'?'':'$800');B.append(segRow('Window tint',[[0,'Stock'],[1,'Light $150'],[2,'Limo $300']],()=>s.tint,v=>{s.tint=v;upd()}))}
    if(k==='Performance'){
      B.append(segRow('Engine',[[0,'Stock'],[1,'Street'],[2,'Sport'],[3,'Race']],()=>s.engine,v=>{if(v<orig.engine)return;s.engine=v;upd()}));
      B.append(segRow('Armor',[[0,'None'],[1,'20%'],[2,'40%'],[3,'60%']],()=>s.armor,v=>{if(v<orig.armor)return;s.armor=v;upd()}));
      B.append(segRow('Nitrous',[[false,'None'],[true,'Install $2,500']],()=>s.nitro,v=>{if(orig.nitro&&!v)return;s.nitro=v;upd()}));
      B.append(el('p','fine','Engine levels: $1,500 / $3,500 / $7,000. Armor: $1,200 / $2,800 / $6,000. Hold N or NITRO to boost.'));
    }
    if(k==='Repair'){const it=el('div','item'),cost=Math.round((car.t.hp-car.health)*6);it.append(el('div','nm','Full repair'),el('div','ds',car.health>=car.t.hp?'This car is in perfect shape.':'Body damage '+Math.round((1-car.health/car.t.hp)*100)+'%'));
      const a=el('div','acts'),b=el('button','buy',cost?fmt(cost):'—');b.type='button';b.disabled=!cost||cost>save.money;b.onclick=()=>{save.money-=cost;car.health=car.t.hp;toast('Repaired','cash',1.2);sfx.pickup();bodyOf('Repair')};a.append(b);it.append(a);B.append(it)}
  };
  panel('Torque Kings Customs','Modding your '+CT[car.tn].name.toLowerCase()+'. It becomes your personal car.',['Paint','Wheels','Body','Lights','Performance','Repair'],bodyOf,true);
  $('pOk').textContent='Buy';$('pNo').hidden=false;
  $('pOk').onclick=()=>{const c=priceDiff(orig,s);if(c>save.money)return;save.money-=c;applyMods(car,s);for(const v of vehicles)if(v!==car)v.mine=false;car.mine=true;save.car={tn:car.tn,spec:s};persist();closePanel();state='play';toast(c?'Nice ride. -'+fmt(c):'Saved as your car','cash',1.8)};
  const had=!!car.spec;$('pNo').onclick=()=>{applyMods(car,orig);if(!had){car.spec=null;car.st=carStats(car)}closePanel();state='play'};
  upd();
}
// Gun shop
function openGuns(){
  shopCtx={kind:'guns'};state='shop';
  const render=()=>{const B=$('pBody');B.innerHTML='';
    for(const id of WORDER){if(id==='fist')continue;const w=WEAP[id],has=save.weapons[id]!==undefined;const it=el('div','item');
      it.append(el('div','nm',w.name),el('div','ds',(has?'Owned · '+(save.weapons[id]||0)+' rds':'Not owned')+(w.mag?` · mag ${w.mag} · reload ${w.reload}s`:'')+(w.auto?' · full-auto':'')+(w.scope?' · scoped':'')));const a=el('div','acts');
      const b=el('button','buy',has?'Ammo +'+w.pack+' · '+fmt(w.ammoPrice):'Buy · '+fmt(w.price));b.type='button';const cost=has?w.ammoPrice:w.price;b.disabled=cost>save.money;
      b.onclick=()=>{save.money-=cost;save.weapons[id]=(save.weapons[id]||0)+w.pack;if(!has){player.weapon=id;showGun()}sfx.pickup();persist();render()};a.append(b);it.append(a);B.append(it)}
    const it=el('div','item');it.append(el('div','nm','Body armor'),el('div','ds','Absorbs 70% of incoming damage · now '+Math.round(player.armor)+'%'));const a=el('div','acts'),b=el('button','buy','Buy · $250');b.type='button';b.disabled=save.money<250||player.armor>=100;b.onclick=()=>{save.money-=250;player.armor=100;sfx.pickup();render()};a.append(b);it.append(a);B.append(it);
    $('pCost').textContent=fmt(save.money);$('pCost').className='';
  };
  panel('Ammo Depot','Hardware for the discerning citizen.',null,render,true);$('pOk').textContent='Done';$('pOk').disabled=false;$('pNo').hidden=true;
  $('pOk').onclick=()=>{closePanel();state='play';persist()};
}
function openShop(sh){if(sh.type==='garage')openGarage(player.car);else if(sh.type==='clothes')openCreator(false);else if(sh.type==='dealer')openDealer(sh);else openGuns()}
const FOR_SALE=[['sports',6000],['muscle',4500],['gt',15000],['super',30000],['suv',3500]];
function openDealer(sh){
  shopCtx={kind:'dealer'};state='shop';let color=PAINT[1];
  const render=()=>{const B=$('pBody');B.innerHTML='';
    B.append(swRow('Factory color',PAINT,()=>PAINT.indexOf(color),v=>{color=PAINT[v]}));
    for(const[tn,price]of FOR_SALE){const t=CT[tn],it=el('div','item');it.append(el('div','nm',t.name),el('div','ds',`Top speed ${Math.round(t.max*3.6)} km/h · 0–100 in ${(27.8/t.acc*1.15).toFixed(1)}s · grip ${t.grip.toFixed(1)}`));
      const a=el('div','acts'),b=el('button','buy',fmt(price));b.type='button';b.disabled=price>save.money;
      b.onclick=()=>{save.money-=price;for(const v of vehicles)if(v.mine){v.mine=false}const c=addVehicle(tn,sh.x+2,sh.z-3.4,PI/2,'civ','none');c.driver=false;c.mine=true;const spec=Object.assign({},DEF_SPEC,{color});applyMods(c,spec);save.car={tn,spec};persist();sfx.pickup();closePanel();state='play';toast('Your new '+t.name.toLowerCase()+' is parked out front','cash',2.6)};
      a.append(b);it.append(a);B.append(it)}
    $('pCost').textContent=fmt(save.money);$('pCost').className=''};
  panel('Paloma Motorsport','Bought cars become your personal car and are saved.',null,render,true);$('pOk').textContent='Leave';$('pOk').disabled=false;$('pNo').hidden=true;$('pOk').onclick=()=>{closePanel();state='play'};
}
// Settings & controls (from title or pause)
function openSettings(back){
  const S=save.settings;
  const render=()=>{const B=$('pBody');B.innerHTML='';
    B.append(segRow('Graphics',[['auto','Auto'],['low','Low'],['medium','Medium'],['high','High']],()=>S.quality,v=>{S.quality=v;if(v==='auto')qName=null;applyQuality();persist()}));
    B.append(segRow('Draw distance',[['near','Near'],['medium','Medium'],['far','Far']],()=>S.draw,v=>{S.draw=v;applyQuality();persist()}));
    const sl=(lab,key,min,max,stepv,on)=>{const r=el('div','row');r.append(el('div','lab',lab));const i=el('input');i.type='range';i.min=min;i.max=max;i.step=stepv;i.value=S[key];i.id='set-'+key;i.oninput=()=>{S[key]=+i.value;if(on)on();persist()};r.append(i);B.append(r)};
    sl('Camera sensitivity','sens',.3,2.2,.05);
    B.append(segRow('Invert look',[[false,'Off'],[true,'On']],()=>S.invert,v=>{S.invert=v;persist()}));
    sl('Sound volume','vol',0,1,.05,()=>{if(master)master.gain.value=S.vol});
    sl('Radio volume','music',0,1,.05);
    B.append(segRow('Show FPS',[[false,'Off'],[true,'On']],()=>S.fps,v=>{S.fps=v;$('fps').hidden=!v;persist()}));
    if(coarse)B.append(segRow('Touch buttons',[[.85,'Small'],[1,'Medium'],[1.2,'Large']],()=>S.btn,v=>{S.btn=v;document.documentElement.style.setProperty('--bs',64*v+'px');persist()}));
    const rr=el('div','row');rr.append(el('div','lab','Progress'));const rb=el('button','fbtn no','Reset progress');rb.type='button';rr.append(rb);B.append(rr);
    rb.onclick=()=>{const cf=el('div','confirm');cf.append(el('div','','Erase your money, weapons, car and character? This cannot be undone.'));const row=el('div','seg');const y=el('button','','Erase everything'),n=el('button','on','Keep my progress');y.type=n.type='button';
      y.onclick=()=>{try{localStorage.removeItem('hch2')}catch(e){}location.reload()};n.onclick=()=>cf.remove();row.append(y,n);cf.append(row);rr.append(cf);rb.remove()};
  };
  panel('Settings','Saved on this device.',null,render,true);$('pOk').textContent='Back';$('pOk').disabled=false;$('pNo').hidden=true;$('pCost').textContent='';
  $('pOk').onclick=()=>{closePanel();back()};
}
function openHelp(back){
  const render=()=>{const B=$('pBody');B.innerHTML='';const k=el('div','keys');
    const rows=coarse?[['STICK','move / steer and throttle'],['DRAG','look around (right side)'],['FIRE','shoot · auto-aims'],['ENTER','car / shop'],['WEAPON','switch weapon'],['JUMP · BRAKE','on foot · in car'],['RUN · NITRO','on foot · in car'],['SCOPE','sniper zoom'],['DUCK','crouch · slide while running'],['TAP AMMO','reload'],['MAP · RADIO','on foot · in car']]
      :[['W A S D','move / drive'],['MOUSE','look (click to capture)'],['LEFT CLICK','shoot · auto-aims'],['E','car / shop'],['Q · WHEEL','switch weapon'],['SPACE','jump · handbrake'],['SHIFT','sprint · nitro'],['R','reload · radio in car'],['Z · RIGHT CLICK','sniper scope'],['H','horn'],['M','map'],['C · CTRL','duck · slide while sprinting'],['V','camera distance'],['P · ESC','pause']];
    for(const[a,b]of rows){const d=el('div');d.append(el('kbd','',a),el('span','',b));k.append(d)}B.append(k);
    B.append(el('p','fine','Crimes raise your wanted level. 1★ police try to arrest you, 2★ they shoot, 3★ SWAT and a helicopter, 4★ roadblocks, 5★ the army with a tank and gunship. Ducking makes you harder to hit. Break line of sight long enough and they give up. Mod garages, clothing and gun shops are marked on the map.'))};
  panel('Controls','',null,render,true);$('pOk').textContent='Back';$('pOk').disabled=false;$('pNo').hidden=true;$('pCost').textContent='';$('pOk').onclick=()=>{closePanel();back()};
}
function openPause(){
  if(state!=='play')return;state='paused';
  const render=()=>{const B=$('pBody');B.innerHTML='';const m=el('div','mbtns');
    const add=(t,f,primary)=>{const b=el('button','mb'+(primary?' primary':''),t);b.type='button';b.onclick=f;m.append(b)};
    add('Resume',()=>{closePanel();state='play'},true);add('Map',()=>{closePanel();state='play';openMap()});add('Settings',()=>openSettings(openPauseAgain));add('Controls',()=>openHelp(openPauseAgain));
    B.append(m);B.append(el('p','fine',`Cash ${fmt(save.money)} · Weapons ${owned().length-1} · Wanted ${wanted}★`))};
  panel('Paused','',null,render,false);
}
function openPauseAgain(){state='play';openPause()}
$('bMenu').addEventListener('click',()=>{if(state==='play')openPause();else if(state==='paused'){closePanel();state='play'}});

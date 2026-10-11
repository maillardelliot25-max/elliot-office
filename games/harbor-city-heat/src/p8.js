
// ===================== HUD, minimap, big map =====================
let toastT=0,vigT=0,state='title',night=0;
function toast(msg,cls,dur){const t=$('toast');t.textContent=msg;t.className='out on '+(cls||'');toastT=dur||2.2}
const MAPR=CE+260;
const mapImg=cnv(2*MAPR,2*MAPR,(g)=>{
  g.fillStyle='#24586b';g.fillRect(0,0,2*MAPR,2*MAPR);
  const im=g.getImageData(0,0,2*MAPR,2*MAPR),d=im.data;
  for(let y=0;y<2*MAPR;y+=2)for(let x=0;x<2*MAPR;x+=2){const wx=x-MAPR,wz=y-MAPR;if(Math.abs(wx)<CE&&Math.abs(wz)<CE)continue;const h=terrainH(wx,wz);let c;
    if(h<-.5)continue;if(h>2.5)c=[110+Math.min(60,h*.4),104+Math.min(40,h*.3),74];else c=[201,185,141];
    for(const[ox,oy]of[[0,0],[1,0],[0,1],[1,1]]){const i=((y+oy)*2*MAPR+x+ox)*4;d[i]=c[0];d[i+1]=c[1];d[i+2]=c[2]}}
  g.putImageData(im,0,0);
  g.fillStyle='#8d939c';g.fillRect(MAPR-CE+1,MAPR-CE+1,2*CE-2,2*CE-2);
  for(const b of blockList){const x=MAPR+b.x0,z=MAPR+b.z0;g.fillStyle=b.park?'#4f8a4a':b.d==='hills'||b.d==='suburb'?'#55704a':'#3a404c';g.fillRect(x,z,56,56)}
  g.fillStyle='#5b6372';for(const[,l]of cols)for(const b of l)if(b.maxX-b.minX>3)g.fillRect(MAPR+b.minX,MAPR+b.minZ,b.maxX-b.minX,b.maxZ-b.minZ);
  g.fillStyle='#8a6a48';g.fillRect(MAPR+PIER.x0,MAPR+PIER.z0,PIER.x1-PIER.x0,PIER.z1-PIER.z0);
});
const mm=$('mm'),mctx=mm.getContext('2d');
let lastHud={};
function setText(id,v){if(lastHud[id]!==v){lastHud[id]=v;$(id).textContent=v}}
function drawMinimap(){
  const W=mm.width,H=mm.height,sc=W/200*1.25*(player.car?.75:1),th=camYaw-PI,cs=Math.cos(th),sn=Math.sin(th),cy=H*.62;
  mctx.save();mctx.fillStyle='#24586b';mctx.fillRect(0,0,W,H);mctx.translate(W/2,cy);mctx.rotate(th);mctx.scale(sc,sc);mctx.translate(-player.x,-player.z);
  mctx.drawImage(mapImg,-MAPR,-MAPR);
  const gt=gpsTarget();if(gt){mctx.strokeStyle='#b46cff';mctx.lineWidth=5;mctx.lineJoin='round';mctx.beginPath();gpsPath(gt).forEach(([x,z],i)=>i?mctx.lineTo(x,z):mctx.moveTo(x,z));mctx.stroke()}
  mctx.restore();
  const to=(x,z)=>{const rx=(x-player.x)*sc,rz=(z-player.z)*sc;return[W/2+rx*cs-rz*sn,cy+rx*sn+rz*cs]};
  const edge=(a,b)=>{const dx=a-W/2,dy=b-cy,k=Math.max(Math.abs(dx)/(W/2-12),dy>0?dy/(H-cy-12):-dy/(cy-12),1);return[W/2+dx/k,cy+dy/k]};
  for(const sh of shops){const[a,b]=to(sh.x,sh.z);if(a>-10&&a<W+10&&b>-10&&b<H+10)iconDraw(mctx,sh.type,a,b,10)}
  mctx.fillStyle='#86e39a';for(const p of pickups){if(p.cd>0||p.kind!=='cash')continue;const[a,b]=to(p.x,p.z);if(a>0&&a<W&&b>0&&b<H)mctx.fillRect(a-2.5,b-2.5,5,5)}
  for(const c of vehicles)if(c.mine&&c!==player.car){const[a,b]=edge(...to(c.x,c.z));mctx.fillStyle='#3ee08f';mctx.strokeStyle='#000';mctx.lineWidth=2;mctx.beginPath();mctx.arc(a,b,7,0,TAU);mctx.fill();mctx.stroke()}
  const blink=(gameT*4|0)%2;
  for(const c of vehicles)if(c.kind==='police'&&c.driver&&wanted>0){const[a,b]=to(c.x,c.z);mctx.fillStyle=blink?'#ff5b4f':'#4ea6ff';mctx.beginPath();mctx.arc(clamp(a,6,W-6),clamp(b,6,H-6),6,0,TAU);mctx.fill()}
  for(const p of cops)if(p.state!=='dead'){const[a,b]=to(p.x,p.z);if(a>0&&a<W&&b>0&&b<H){mctx.fillStyle='#4ea6ff';mctx.fillRect(a-3,b-3,6,6)}}
  if(heli&&!heli.dead){const[a,b]=edge(...to(heli.x,heli.z));mctx.fillStyle=blink?'#ff5b4f':'#fff';mctx.font='bold 20px sans-serif';mctx.textAlign='center';mctx.fillText('✈',a,b+7)}
  if(job.on){const[a,b]=edge(...to(job.x,job.z));mctx.fillStyle=job.kind==='hit'?'#ff3b30':'#ffcc4d';mctx.strokeStyle='#000';mctx.lineWidth=2;mctx.beginPath();mctx.arc(a,b,8,0,TAU);mctx.fill();mctx.stroke()}
  if(waypoint){const[a,b]=edge(...to(waypoint.x,waypoint.z));mctx.fillStyle='#b46cff';mctx.beginPath();mctx.moveTo(a,b+9);mctx.lineTo(a-7,b-5);mctx.lineTo(a+7,b-5);mctx.fill()}
  const h=player.car?player.car.vis:player.a;
  mctx.save();mctx.translate(W/2,cy);mctx.rotate(camYaw-h);mctx.fillStyle='#fff';mctx.strokeStyle='#000';mctx.lineWidth=2.5;mctx.beginPath();mctx.moveTo(0,-12);mctx.lineTo(8,9);mctx.lineTo(0,4);mctx.lineTo(-8,9);mctx.closePath();mctx.fill();mctx.stroke();mctx.restore();
}
const bmc=$('bmc'),bctx=bmc.getContext('2d');let bmView=null;
function drawBigMap(){
  const dpr=Math.min(devicePixelRatio,2),W=bmc.width=innerWidth*dpr,H=bmc.height=innerHeight*dpr;
  const span=2*CE+260,s=Math.min(W,H*1.0)/span*.92,ox=W/2-(-60)*s,oz=H/2;bmView={s,ox,oz,dpr};
  bctx.fillStyle='#0f1a22';bctx.fillRect(0,0,W,H);bctx.save();bctx.translate(ox,oz);bctx.scale(s,s);bctx.drawImage(mapImg,-MAPR,-MAPR);
  const gt=gpsTarget();if(gt){bctx.strokeStyle='#b46cff';bctx.lineWidth=6/s*dpr;bctx.beginPath();gpsPath(gt).forEach(([x,z],i)=>i?bctx.lineTo(x,z):bctx.moveTo(x,z));bctx.stroke()}
  bctx.restore();
  const to=(x,z)=>[ox+x*s,oz+z*s];
  bctx.textAlign='center';bctx.font=`700 ${13*dpr}px "Barlow Condensed",sans-serif`;
  const labels=[['DOWNTOWN',150,-150],['PALOMA BEACH',-CE-30,200],['PALMWOOD HILLS',-100,-CE-100],['TERMINAL DOCKS',HALF-100,CE+40],['DEL SOL',-330,330],['MIRADOR',-260,-260],['ALTA VISTA',360,-300],['ROSEWOOD',260,240],['CYPRESS FLATS',-130,150]];
  for(const[t,x,z]of labels){const[a,b]=to(x,z);bctx.fillStyle='rgba(0,0,0,.6)';bctx.fillText(t,a+1,b+1);bctx.fillStyle='#f6efe2';bctx.fillText(t,a,b)}
  for(const sh of shops){const[a,b]=to(sh.x,sh.z);iconDraw(bctx,sh.type,a,b,9*dpr)}
  for(const c of vehicles)if(c.mine&&c!==player.car){const[a,b]=to(c.x,c.z);bctx.fillStyle='#3ee08f';bctx.beginPath();bctx.arc(a,b,6*dpr,0,TAU);bctx.fill()}
  if(job.on){const[a,b]=to(job.x,job.z);bctx.fillStyle=job.kind==='hit'?'#ff3b30':'#ffcc4d';bctx.beginPath();bctx.arc(a,b,8*dpr,0,TAU);bctx.fill()}
  if(waypoint){const[a,b]=to(waypoint.x,waypoint.z);bctx.fillStyle='#b46cff';bctx.beginPath();bctx.moveTo(a,b+10*dpr);bctx.lineTo(a-8*dpr,b-6*dpr);bctx.lineTo(a+8*dpr,b-6*dpr);bctx.fill()}
  const[a,b]=to(player.x,player.z);bctx.save();bctx.translate(a,b);bctx.rotate(-(player.car?player.car.vis:player.a)+PI);bctx.fillStyle='#fff';bctx.strokeStyle='#000';bctx.lineWidth=2*dpr;bctx.beginPath();bctx.moveTo(0,-11*dpr);bctx.lineTo(8*dpr,9*dpr);bctx.lineTo(0,4*dpr);bctx.lineTo(-8*dpr,9*dpr);bctx.closePath();bctx.fill();bctx.stroke();bctx.restore();
}
bmc.addEventListener('click',e=>{if(!bmView)return;const x=(e.clientX*bmView.dpr-bmView.ox)/bmView.s,z=(e.clientY*bmView.dpr-bmView.oz)/bmView.s;
  if(waypoint&&Math.hypot(waypoint.x-x,waypoint.z-z)<30){waypoint=null;toast('Waypoint cleared')}else if(Math.abs(x)<CE&&Math.abs(z)<CE){waypoint={x,z};toast('Waypoint set','job',1.2)}drawBigMap()});
function openMap(){if(state!=='play'&&state!=='paused')return;prevState=state;state='map';$('bigmap').hidden=false;drawBigMap()}
function closeMap(){$('bigmap').hidden=true;state='play'}
let prevState='play';
$('bmClose').addEventListener('click',closeMap);$('bMap').addEventListener('click',openMap);mm.addEventListener('click',openMap);
const vec=new THREE.Vector3();
function updateHud(dt){
  setText('money',fmt(save.money));
  const wid=player.car&&!WEAP[player.weapon].driveby?(save.weapons.smg>0?'smg':'pistol'):player.weapon,W=WEAP[wid];
  const wt=W.name+'|'+(wid==='fist'?'':save.weapons[wid]||0);if(lastHud.wpn!==wt){lastHud.wpn=wt;$('wpn').innerHTML='';$('wpn').append(W.name);const sm=document.createElement('small');sm.textContent=wid==='fist'?'':String(save.weapons[wid]||0);$('wpn').append(sm)}
  const sv='s'+wanted;if(lastHud.stars!==sv){lastHud.stars=sv;$('stars').innerHTML='<b>'+'★'.repeat(wanted)+'</b>'+'★'.repeat(5-wanted)}
  $('stars').classList.toggle('flash',wanted>0&&evade>1.5);$('mm').classList.toggle('alert',wanted>0);
  const ph=(dayT%1)*24,hh=Math.floor(ph),mi=Math.floor((ph-hh)*60);setText('clock',String(hh).padStart(2,'0')+':'+String(mi).padStart(2,'0'));
  $('hp').style.width=player.health+'%';$('hp').classList.toggle('hurt',player.health<35);$('ar').style.width=player.armor+'%';
  const pn=placeName(player.x,player.z),wv=pn.d+'|'+pn.s;if(lastHud.where!==wv){lastHud.where=wv;const w=$('where');w.firstChild.textContent=pn.d;w.lastChild.textContent=pn.s}
  const c=player.car;$('speedo').hidden=!c;
  if(c){setText('kmh',String(Math.round(Math.abs(c.v)*3.6)));$('chp').style.width=Math.max(0,c.health/c.t.hp*100)+'%';$('chp').classList.toggle('hurt',c.health<c.t.hp*.35);$('nosBar').hidden=!(c.spec&&c.spec.nitro);$('nos').style.width=c.nos*100+'%'}
  const jb=$('job');
  if(job.on){jb.hidden=false;jb.className=job.kind==='hit'?'hit':'';const d=Math.round(Math.hypot(job.x-player.x,job.z-player.z));
    const html=job.kind==='hit'?`<div class="k">Contract · ${fmt(job.reward)}</div><div>Take out the marked target</div><div class="t">${d}m</div>`:`<div class="k">Delivery · ${fmt(job.reward)}</div><div></div><div class="t${job.time<10?' low':''}">${Math.ceil(job.time)}s · ${d}m</div>`;
    if(lastHud.job!==html){lastHud.job=html;jb.innerHTML=html;if(job.kind!=='hit')jb.children[1].textContent=job.cargo+' → '+job.dest}}
  else jb.hidden=true;
  let hint='';
  if(state==='play'){const sh=nearShop();
    if(sh)hint=sh.type==='garage'?'Customize car':sh.type==='clothes'?'Shop for clothes':'Buy weapons';
    else if(!player.car){for(const v of vehicles){if(v.burnt||v.wreck)continue;if(Math.hypot(v.x-player.x,v.z-player.z)<4.8){hint=(v.driver&&v.ctrl!=='none'?'Steal ':'Get in ')+(v.kind==='police'?'squad car':v.mine?'your car':CT[v.tn].name.toLowerCase());break}}}}
  const h=$('hint');if(hint){h.hidden=false;if(lastHud.hint!==hint){lastHud.hint=hint;h.innerHTML='<kbd></kbd>';h.firstChild.textContent=coarse?'ENTER':'E';h.append(hint)}}else h.hidden=true;
  if(toastT>0){toastT-=dt;if(toastT<=0)$('toast').classList.remove('on')}
  vigT=Math.max(0,vigT-dt);$('vig').style.opacity=Math.max(vigT*1.6,player.health<30?.35+Math.sin(gameT*6)*.1:0);
  // reticle
  const r=$('ret'),armed=state==='play'&&(player.weapon!=='fist'||player.car);r.hidden=!armed;
  if(armed){const t=player.aimT>0&&player.target?player.target:null;if(t&&(t.ref.state!=='dead')){vec.set(t.x,t.y,t.z).project(camera);r.className='lock';r.style.left=(vec.x*.5+.5)*100+'%';r.style.top=(-vec.y*.5+.5)*100+'%'}else{r.className='';r.style.left='50%';r.style.top='50%'}}
  // touch labels
  if(coarse){const L=player.car?['BRAKE','NITRO','HORN','RADIO']:['JUMP','RUN','WEAPON','MAP'];if(lastHud.tl!==L[0]){lastHud.tl=L[0];['tB','tA','tW','tH'].forEach((id,k)=>$(id).textContent=L[k])}}
  if(save.settings.fps)setText('fps',fpsShow+' fps · '+qName);
}
function nearShop(){for(const s of shops){if(s.type==='hospital'||s.type==='police')continue;if(Math.hypot(s.x-player.x,s.z-player.z)<3.6){if(s.type==='garage'){if(player.car&&!player.car.wreck&&player.car.kind!=='police'&&Math.abs(player.car.v)<6)return s}else if(!player.car)return s}}return null}

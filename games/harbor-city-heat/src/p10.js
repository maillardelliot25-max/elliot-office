
// ===================== Input =====================
addEventListener('keydown',e=>{
  const k=e.key.toLowerCase();
  if([' ','arrowup','arrowdown','arrowleft','arrowright','tab'].includes(k)&&state==='play')e.preventDefault();
  if(e.repeat)return;keys.add(k);
  if(state==='map'&&(k==='m'||k==='escape')){closeMap();return}
  if(state!=='play'){if((k==='p'||k==='escape')&&state==='paused'){closePanel();state='play'}return}
  if(k==='e'||k==='f')enterExit();
  if(k==='q')cycleWeapon(1);
  if(k==='h')sfx.horn();
  if(k==='c'||k==='control')duck();
  if(k==='v')camFar=!camFar;
  if(k==='m')openMap();
  if(k==='r'){if(player.car)radioNext();else startReload(player.weapon)}
  if(k==='z'&&WEAP[player.weapon].scope&&!player.car)player.zoom=!player.zoom;
  if(k==='p'||k==='escape'){if(document.pointerLockElement)document.exitPointerLock();openPause()}
  if(k>='1'&&k<='6'){const w=WORDER[+k-1];if(save.weapons[w]!==undefined){player.weapon=w;showGun()}}
});
addEventListener('keyup',e=>keys.delete(e.key.toLowerCase()));
addEventListener('blur',()=>{keys.clear();inp.fire=false});
let lockFailed=false,drag=null;
canvas.addEventListener('contextmenu',e=>e.preventDefault());
canvas.addEventListener('pointerdown',e=>{
  initAudio();
  if(state!=='play'&&state!=='shop')return;
  if(e.pointerType==='touch'){if(!drag){drag={id:e.pointerId,x:e.clientX,y:e.clientY}}return}
  if(state==='shop'){drag={id:e.pointerId,x:e.clientX,y:e.clientY};return}
  if(e.button===2&&WEAP[player.weapon].scope&&!player.car){player.zoom=!player.zoom;return}
  if(e.button===0){inp.fire=true;if(!document.pointerLockElement&&!lockFailed){try{const p=canvas.requestPointerLock();if(p&&p.catch)p.catch(()=>{lockFailed=true})}catch(err){lockFailed=true}}}
  if(!document.pointerLockElement)drag={id:e.pointerId,x:e.clientX,y:e.clientY};
});
addEventListener('pointermove',e=>{
  if(document.pointerLockElement===canvas&&e.pointerType!=='touch'){look(e.movementX,e.movementY);return}
  if(drag&&e.pointerId===drag.id){const dx=e.clientX-drag.x,dy=e.clientY-drag.y;drag.x=e.clientX;drag.y=e.clientY;if(state==='shop'){camYaw-=dx*.008}else look(dx*(e.pointerType==='touch'?1.5:1),dy*(e.pointerType==='touch'?1.5:1))}
});
const endPtr=e=>{if(drag&&e.pointerId===drag.id)drag=null;if(e.pointerType!=='touch'&&e.button===0)inp.fire=false};
addEventListener('pointerup',endPtr);addEventListener('pointercancel',endPtr);
addEventListener('wheel',e=>{if(state==='play')cycleWeapon(e.deltaY>0?1:-1)},{passive:true});
{
  const stick=$('stick'),knob=$('knob');let sid=null;
  const mv=e=>{const r=stick.getBoundingClientRect();let dx=e.clientX-(r.left+r.width/2),dy=e.clientY-(r.top+r.height/2);const m=r.width/2,l=Math.hypot(dx,dy);if(l>m){dx*=m/l;dy*=m/l}
    inp.x=dx/m;inp.y=-dy/m;knob.style.transform=`translate(calc(-50% + ${dx}px),calc(-50% + ${dy}px))`};
  stick.addEventListener('pointerdown',e=>{e.stopPropagation();initAudio();sid=e.pointerId;stick.setPointerCapture(sid);mv(e)});
  stick.addEventListener('pointermove',e=>{if(e.pointerId===sid)mv(e)});
  const end=e=>{if(e.pointerId===sid){sid=null;inp.x=inp.y=0;knob.style.transform='translate(-50%,-50%)'}};
  stick.addEventListener('pointerup',end);stick.addEventListener('pointercancel',end);
  const hold=(id,on,off)=>{const b=$(id);b.addEventListener('pointerdown',e=>{e.preventDefault();e.stopPropagation();initAudio();b.classList.add('on');on()});
    for(const ev of['pointerup','pointercancel','pointerleave'])b.addEventListener(ev,()=>{b.classList.remove('on');if(off)off()})};
  hold('tF',()=>inp.fire=true,()=>inp.fire=false);
  hold('tE',()=>enterExit());
  hold('tB',()=>{if(player.car)inp.brake=true;else inp.jump=true},()=>{inp.brake=false;inp.jump=false});
  hold('tA',()=>{if(player.car)inp.nos=true;else inp.run=true},()=>{inp.nos=false;inp.run=false});
  hold('tW',()=>{if(player.car)sfx.horn();else cycleWeapon(1)});
  hold('tH',()=>{if(player.car)radioNext();else openMap()});
  hold('tZ',()=>{player.zoom=!player.zoom});
  hold('tC',()=>duck());
  $('wpn').addEventListener('pointerdown',e=>{e.stopPropagation();if(!player.car)startReload(player.weapon)});
  $('radio').addEventListener('click',radioNext);
  document.documentElement.style.setProperty('--bs',64*save.settings.btn+'px');
  if(coarse&&document.documentElement.requestFullscreen){$('bFull').hidden=false;$('bFull').onclick=()=>{const p=document.documentElement.requestFullscreen();if(p&&p.then)p.then(()=>{try{screen.orientation.lock('landscape').catch(()=>{})}catch(e){}}).catch(()=>toast('Full screen is not available here'))}}
}

// ===================== Down / respawn =====================
let downT=0;
function goDown(kind){
  if(state!=='play')return;state='down';downT=4;$('game').classList.add('down');$('big').hidden=false;
  const w=$('bigW');w.textContent=kind==='busted'?'BUSTED':'WASTED';w.className='w out'+(kind==='busted'?' busted':'');
  const loss=kind==='busted'?Math.round(save.money*.1):Math.min(save.money,100);save.money-=loss;
  $('bigS').textContent=(kind==='busted'?'Bail and fines ':'Hospital bill ')+fmt(loss);downKind=kind;
  if(document.pointerLockElement)document.exitPointerLock();
}
let downKind='wasted';
function respawn(){
  if(player.car)exitCar();
  const sh=shops.find(s=>s.type===(downKind==='busted'?'police':'hospital'));
  player.x=sh.x;player.z=sh.z+(sh.z>0?-2:2);player.y=groundY(player.x,player.z);player.health=100;
  if(downKind==='busted'){player.armor=0;for(const w of['smg','shotgun','rifle','rpg'])if(save.weapons[w])save.weapons[w]=Math.floor(save.weapons[w]/2)}
  for(const c of vehicles.slice())if(c.kind==='police'&&!c.mine)removeVehicle(c);
  for(const p of cops.slice())removePed(p);
  for(const h of helis)scene.remove(h.g);helis.length=0;for(const r of rockets.splice(0));player.zoom=false;player.reloadT=0;
  wanted=0;heat=0;bustT=0;evade=0;
  if(job.on)endJob(6);
  state='play';$('game').classList.remove('down');$('big').hidden=true;camYaw=player.a;
  spawnPersonalCar(true);persist();
}
function spawnPersonalCar(near){
  if(!save.car||!CT[save.car.tn])return;if(vehicles.some(c=>c.mine&&!c.burnt))return;
  const s=roadSpawn(near?8:8,near?60:60);let x,z,a;if(s){x=s.x+RIGHT[s.d][0]*2.3;z=s.z+RIGHT[s.d][1]*2.3;a=ANG[s.d]}else{x=P+5.8;z=44;a=PI}
  const c=addVehicle(save.car.tn,x,z,a,'civ','none');c.driver=false;c.mine=true;applyMods(c,Object.assign({},DEF_SPEC,save.car.spec));
}

// ===================== Day / night =====================
let dayT=17/24,envHour=-1;
const SKY={day:[C('#2f6fc4'),C('#bfe0f2'),C('#a8b9c0')],dusk:[C('#34437a'),C('#ff9a5c'),C('#6d4f4c')],night:[C('#03060f'),C('#16223e'),C('#05080f')]};
const tc=[new THREE.Color(),new THREE.Color(),new THREE.Color()],sunWarm=C('#ffae66'),sunWhite=C('#fff1dc'),moonC=C('#8fa6d8');
function updateSky(dt){
  const p=dayT%1,ang=TAU*(p-.25),el=Math.sin(ang);
  const mix=(a,b,t)=>{for(let i=0;i<3;i++)tc[i].copy(a[i]).lerp(b[i],t)};
  if(el>.25)mix(SKY.day,SKY.day,0);else if(el>-.05)mix(SKY.dusk,SKY.day,(el+.05)/.3);else mix(SKY.night,SKY.dusk,clamp((el+.3)/.25,0,1));
  skyU.top.value.copy(tc[0]);skyU.hor.value.copy(tc[1]);skyU.bot.value.copy(tc[2]);
  const sd=new THREE.Vector3(Math.cos(ang),el,.35).normalize();skyU.sunDir.value.copy(sd);skyU.sunCol.value.copy(sunWarm).lerp(sunWhite,clamp(el*2,0,1)).multiplyScalar(clamp(el*6+.4,0,1));
  night=clamp((.1-el)*4,0,1);skyU.night.value=night;
  scene.fog.color.copy(tc[1]).lerp(tc[0],.15);renderer.setClearColor(scene.fog.color);
  const dl=sd.clone();let si;if(el>0){si=clamp(el*4,0,1)*2.4;sun.color.copy(sunWarm).lerp(sunWhite,clamp(el*2.5,0,1))}else{dl.set(-sd.x,-sd.y,sd.z).normalize();si=clamp(-el*3,0,1)*.45;sun.color.copy(moonC)}
  sun.intensity=si;sun.position.set(player.x+dl.x*220,dl.y*220+10,player.z+dl.z*220);sun.target.position.set(player.x,0,player.z);
  hemi.intensity=.35+.55*(1-night);hemi.color.copy(tc[0]).lerp(tc[1],.5);
  renderer.toneMappingExposure=1.05+night*.25;
  for(const m of NIGHT_MATS)m.emissiveIntensity=night*1.1;ferris.userData.bulbMat.emissiveIntensity=night*1.4;
  lightMat.emissiveIntensity=.3+night*2;tailMat.emissiveIntensity=.4+night;
  lampGlow.pts.material.uniforms.alpha.value=night;
  waterNorm.offset.x+=dt*.004;waterNorm.offset.y+=dt*.0025;
  const hr=Math.floor(p*24);if(hr!==envHour){envHour=hr;updateEnv()}
  if(flash.intensity>0)flash.intensity=Math.max(0,flash.intensity-dt*14);
}
function carGlows(){
  glow.begin();
  for(const c of vehicles){if(c.burnt)continue;const d=Math.hypot(c.x-camera.position.x,c.z-camera.position.z);if(d>drawDist*.8)continue;
    const fx=Math.sin(c.vis),fz=Math.cos(c.vis),rx=-fz,rz=fx,t=c.t,hw=t.W/2-.32,y=c.y+c.m.fy;
    if(c.driver||c===player.car){if(night>.15)for(const s of[-1,1])glow.add(c.x+fx*(t.L/2+.2)+rx*hw*s,y,c.z+fz*(t.L/2+.2)+rz*hw*s,COL.head,.9*night,2.2);
      const ta=c.braking?1:night*.6;if(ta>.05)for(const s of[-1,1])glow.add(c.x-fx*(t.L/2+.15)+rx*hw*s,c.y+c.m.ry,c.z-fz*(t.L/2+.15)+rz*hw*s,COL.tail,ta,c.braking?1.4:1)}
    if(c.flashing){const on=(gameT*5|0)%2;glow.add(c.x+rx*.35*(on?-1:1),c.y+t.pts[5][1]+.15,c.z+rz*.35*(on?-1:1),on?COL.red:COL.blue,.6+night*.4,3.5)}
    if(c.boost){for(const s of[-1,1])glow.add(c.x-fx*(t.L/2+.5)+rx*.4*s,c.y+.45,c.z-fz*(t.L/2+.5)+rz*.4*s,COL.nos,1,1.6)}
  }
  glow.end();
}

// ===================== Main loop =====================
let last=performance.now(),fpsAcc=0,fpsN=0,fpsShow=0,lowFor=0,saveT=0;
function frame(now){
  const rdt=Math.min(.05,(now-last)/1000);last=now;
  fpsAcc+=rdt;fpsN++;if(fpsAcc>=1){fpsShow=Math.round(fpsN/fpsAcc);fpsAcc=0;fpsN=0;
    if(state==='play'&&save.settings.quality==='auto'){if(fpsShow<26)lowFor++;else lowFor=0;if(lowFor>=4&&qName!=='low'){qName=qName==='high'?'medium':'low';applyQuality();lowFor=0;toast('Graphics lowered for smoother play','',2)}}}
  let dt=rdt;frameDt=state==='down'?rdt*.3:rdt;
  if(state==='shop'&&player.model&&player.model.skinned&&!(shopCtx&&shopCtx.car)){player.model.g.rotation.y=player.a;animPerson(player.model,0,'walk',0,0,null)}
  if(state==='down'){dt*=.3;downT-=rdt;if(downT<=0)respawn()}
  if(state==='play'||state==='down'){gameT+=dt;dayT+=dt/960;if(state==='play')updatePlayer(dt);else if(player.car){player.x=player.car.x;player.z=player.car.z}updateWorldSim(dt)}
  else if(state==='title')dayT+=rdt/240;
  fxN.update(dt);fxA.update(dt);updTracers(dt);updDecals(dt);
  updateSky(rdt);updateCamera(rdt);updateBirds(performance.now()/1000);sky.position.copy(camera.position);
  for(const m of pMats)m.uniforms.scale.value=pScale;
  carGlows();
  if(state!=='title'){$('hud').style.visibility=state==='shop'?'hidden':'';updateHud(rdt);drawMinimap()}
  audioFrame();
  saveT-=rdt;if(saveT<=0&&state==='play'){saveT=5;save.armor=player.armor;persist()}
  renderer.render(scene,camera);
  requestAnimationFrame(frame);
}

// ===================== Boot =====================
function startGame(){
  $('title').hidden=true;$('hud').hidden=false;$('touch').hidden=!coarse;$('fps').hidden=!save.settings.fps;
  initAudio();state='play';camYaw=player.a;
  spawnPersonalCar(true);
  if(!vehicles.some(c=>c.mine)){const c=addVehicle('muscle',P+5.8,44,PI,'civ','none');c.driver=false;c.m.paint=c.m.bm.material=paintMat('#e8452c')}
  toast(save.car?'Your car is parked nearby':'Grab the red muscle car at the curb','job',3);
  if(coarse&&innerHeight>innerWidth)setTimeout(()=>toast('Turn your phone sideways for the best view','',3),3200);
}
$('mNote').textContent=save.char?`Saved: ${fmt(save.money)} · ${owned().length-1} weapon${owned().length===2?'':'s'}${save.car?' · personal '+CT[save.car.tn].name.toLowerCase():''}`:'Progress saves automatically on this device.';
$('mPlay').addEventListener('click',()=>{initAudio();if(!save.char){$('title').hidden=true;state='shop';openCreator(true,startGame);return}startGame()});
$('mSet').addEventListener('click',()=>{$('title').hidden=true;openSettings(()=>{$('title').hidden=false})});
$('mHelp').addEventListener('click',()=>{$('title').hidden=true;openHelp(()=>{$('title').hidden=false})});
if(save.char)save.char=Object.assign({},DEF_CHAR,save.char);
$('mPlay').disabled=true;$('mPlay').textContent='Loading people…';
loadChars(f=>{$('mPlay').textContent='Loading people… '+Math.round(f*100)+'%'}).then(()=>{
buildPlayer();player.y=groundY(player.x,player.z);player.model.g.position.set(player.x,player.y,player.z);
for(let i=0;i<Q.peds;i++)spawnPed(false);
for(let i=0;i<Q.traffic;i++)spawnTraffic(20,drawDist*.7);
for(let i=0;i<10;i++)spawnParked(30,drawDist*.7);
$('mPlay').disabled=false;$('mPlay').textContent=save.char?'Continue':'Play';});
updateEnv();
window.__hch={player,save,vehicles,peds,cops,get state(){return state},set state(v){state=v},openGarage,openGuns,openCreator,openMap,closeMap,minWanted,spawnHeli,spawnCop,helis,addVehicle,get gameT(){return gameT},get wanted(){return wanted},startGame,teleport:(x,z)=>{player.x=x;player.z=z}};
requestAnimationFrame(frame);
})();
</script>

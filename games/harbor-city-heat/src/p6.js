
// ===================== Weapons =====================
const WEAP={
  fist:{name:'Fists',dmg:14,rate:.42,range:2,melee:true},
  pistol:{name:'9mm Pistol',dmg:28,rate:.2,range:60,eff:20,spread:.01,recoil:.012,mag:17,reload:1.3,price:400,ammoPrice:90,pack:51,driveby:true,hands:1,snd:'pistol'},
  heavy:{name:'.45 Pistol',dmg:40,rate:.3,range:55,eff:18,spread:.012,recoil:.024,mag:8,reload:1.4,price:900,ammoPrice:110,pack:40,driveby:true,hands:1,snd:'heavy'},
  smg:{name:'Compact SMG',dmg:15,rate:.07,range:45,eff:15,spread:.03,recoil:.007,mag:30,reload:1.8,price:1500,ammoPrice:180,pack:120,auto:true,driveby:true,hands:2,snd:'smg'},
  shotgun:{name:'Pump Shotgun',dmg:11,pellets:9,rate:.9,range:28,eff:8,spread:.075,recoil:.06,mag:8,reload:3.2,price:1800,ammoPrice:160,pack:32,hands:2,snd:'shotgun'},
  ar:{name:'Assault Rifle',dmg:24,rate:.1,range:90,eff:40,spread:.013,recoil:.011,mag:30,reload:2.2,price:3200,ammoPrice:260,pack:120,auto:true,hands:2,snd:'rifle'},
  battle:{name:'Battle Rifle',dmg:36,rate:.14,range:110,eff:55,spread:.011,recoil:.02,mag:20,reload:2.5,price:4800,ammoPrice:320,pack:100,auto:true,hands:2,snd:'battle'},
  sniper:{name:'Sniper Rifle',dmg:130,rate:1.3,range:320,eff:260,spread:.0015,recoil:.07,mag:5,reload:3,price:8500,ammoPrice:400,pack:25,hands:2,scope:true,snd:'sniper'},
  lmg:{name:'Light Machine Gun',dmg:22,rate:.075,range:85,eff:35,spread:.03,recoil:.009,mag:100,reload:5,price:9000,ammoPrice:600,pack:300,auto:true,hands:2,snd:'rifle'},
  rpg:{name:'RPG',dmg:0,rate:1.4,range:180,rocket:true,mag:1,reload:2.8,price:12000,ammoPrice:900,pack:5,hands:3,snd:'rpg'},
};
const WORDER=['fist','pistol','heavy','smg','shotgun','ar','battle','sniper','lmg','rpg'];
if(save.weapons.rifle!==undefined){save.weapons.ar=(save.weapons.ar||0)+save.weapons.rifle;delete save.weapons.rifle}
for(const k in save.weapons)if(!WEAP[k])delete save.weapons[k];
function owned(){return WORDER.filter(w=>save.weapons[w]!==undefined&&(w==='fist'||save.weapons[w]>0))}
function cycleWeapon(dir){const o=owned();let i=o.indexOf(player.weapon);i=(i+dir+o.length)%o.length;player.weapon=o[i];player.zoom=false;player.reloadT=0;sfx.click();showGun()}

function showGun(){const m=player.model;if(!m)return;for(const k in m.guns)m.guns[k].visible=k===player.weapon&&!player.car}
function aimTarget(range){
  if(player.zoom)return null;
  const cf={x:Math.sin(camYaw),z:Math.cos(camYaw)},maxA=coarse?.8:.55;let best=null,bs=1e9;
  const consider=(x,y,z,ref,kind,bonus)=>{const dx=x-player.x,dz=z-player.z,d=Math.hypot(dx,dz);if(d>range||d<.3)return;
    const ang=Math.acos(clamp((dx*cf.x+dz*cf.z)/d,-1,1));if(ang>maxA)return;const s=ang*2+d/range-bonus;if(s<bs){bs=s;best={x,y,z,ref,kind}}};
  for(const p of peds)if(p.state!=='dead')consider(p.x,p.y+1.3,p.z,p,'ped',p.bounty||p.state==='attack'||p.state==='brawl'?.6:0);
  for(const p of cops)if(p.state!=='dead')consider(p.x,p.y+1.3,p.z,p,'ped',.4);
  for(const h of helis)if(!h.dead)consider(h.x,h.y,h.z,h,'heli',.5);
  for(const c of vehicles)if(c.kind==='police'&&c.driver&&c!==player.car)consider(c.x,c.y+1,c.z,c,'car',.1);
  return best;
}

function rayHit(ox,oy,oz,dx,dy,dz,range,ignoreCar){
  let best=null,bt=range;
  const sph=(cx,cy,cz,r,ref,kind,extra)=>{const lx=cx-ox,ly=cy-oy,lz=cz-oz,t=lx*dx+ly*dy+lz*dz;if(t<0||t>bt)return;const d2=lx*lx+ly*ly+lz*lz-t*t;if(d2<r*r){bt=t;best={t,ref,kind,...extra}}};
  for(const p of peds.concat(cops)){if(p.state==='dead')continue;sph(p.x,p.y+1.2,p.z,.42,p,'ped',{head:false});sph(p.x,p.y+1.82,p.z,.2,p,'ped',{head:true})}
  for(const c of vehicles){if(c===ignoreCar||c.burnt&&false)continue;const fx=Math.sin(c.a),fz=Math.cos(c.a),off=c.t.L/2-c.t.W/2;for(const s of[off,0,-off])sph(c.x+fx*s,c.y+.9,c.z+fz*s,c.t.W/2+.05,c,'car')}
  for(const h of helis)if(!h.dead)sph(h.x,h.y,h.z,3,h,'heli');
  for(let t=.6;t<bt;t+=.7){const x=ox+dx*t,y=oy+dy*t,z=oz+dz*t;if(y<groundY(x,z)||solidAt(x,y,z)){bt=t;best={t,kind:'world'};break}}
  if(!best)return{t:range,kind:'none'};return best;
}
let lockT=null;
function clipOf(id){if(player.clip[id]===undefined)player.clip[id]=Math.min(WEAP[id].mag||1,save.weapons[id]||0);return player.clip[id]}
function startReload(id){const W=WEAP[id];if(!W.mag||player.reloadT>0)return;const tot=save.weapons[id]||0;if(tot<=clipOf(id)||clipOf(id)>=W.mag)return;player.reloadT=W.reload*(player.car?1.3:1);player.reloadId=id;sfx.reload()}
function heldWeapon(){let wid=player.weapon;if(player.car&&!WEAP[wid].driveby)wid=save.weapons.smg>0?'smg':save.weapons.pistol>0?'pistol':save.weapons.heavy>0?'heavy':null;return wid}
function fire(){
  if(player.fireCD>0||state!=='play'||player.reloadT>0)return;
  const wid=heldWeapon();if(!wid)return;const w=WEAP[wid];
  if(!w.auto&&player.trigger)return;player.trigger=true;
  if(wid!=='fist'){if(!(save.weapons[wid]>0)){sfx.click();toast('Out of ammo — buy more at Ammo Depot');player.fireCD=.5;return}if(clipOf(wid)<=0){startReload(wid);return}}
  player.fireCD=w.rate;player.aimT=1.4;player.lastShot=gameT;
  const tgt=aimTarget(w.range);player.target=tgt;
  if(w.melee){
    let hitP=null;for(const p of peds.concat(cops))if(p.state!=='dead'&&Math.hypot(p.x-player.x,p.z-player.z)<2.1){const a=Math.atan2(p.x-player.x,p.z-player.z);if(Math.abs(wrapA(a-player.a))<1.2||tgt&&tgt.ref===p){hitP=p;break}}
    sfx.punch();if(hitP){player.a=Math.atan2(hitP.x-player.x,hitP.z-player.z);damagePed(hitP,w.dmg,Math.sin(player.a),Math.cos(player.a),true);if(hitP.state==='dead'){hitP.fl.vx=Math.sin(player.a)*4;hitP.fl.vz=Math.cos(player.a)*4}crime(hitP.cop?2:.3);if(hitP.cop)minWanted(1)}
    return}
  save.weapons[wid]--;player.clip[wid]--;
  let ox,oy,oz;
  if(player.car){const c=player.car;ox=c.x;oy=c.y+1.4;oz=c.z}
  else{const fx=Math.sin(player.a),fz=Math.cos(player.a);ox=player.x+fx*.6-fz*.3;oy=player.y+1.48;oz=player.z+fz*.6+fx*.3}
  let ax,ay,az;
  if(tgt){ax=tgt.x;ay=tgt.y;az=tgt.z}else{const v=new THREE.Vector3();camera.getWorldDirection(v);ax=camera.position.x+v.x*w.range;ay=camera.position.y+v.y*w.range;az=camera.position.z+v.z*w.range}
  let dx=ax-ox,dy=ay-oy,dz=az-oz;const l=Math.hypot(dx,dy,dz);dx/=l;dy/=l;dz/=l;
  if(!player.car)player.a=Math.atan2(dx,dz);
  fxA.spawn(ox+dx*.6,oy+dy*.6,oz+dz*.6,0,0,0,COL.muzzle,1,w.rocket?1.6:wid==='shotgun'||wid==='sniper'?1.2:.8,.05);
  fxN.spawn(ox-dz*.1,oy,oz+dx*.1,-dz*rand(1,2),rand(1,2),dx*rand(1,2),COL.spark,.9,.07,.4,0,-9);
  if(Q.shadow){flash.position.set(ox,oy,oz);flash.intensity=Math.max(flash.intensity,1.5)}
  sfx.gun(w.snd||wid,0);
  // recoil: camera kick + spread bloom
  camPitch=Math.max(-.15,camPitch-w.recoil*(player.zoom?.6:1.4));camYaw+=rand(-1,1)*w.recoil*.4;player.bloom=Math.min(.09,player.bloom+w.recoil*1.6);shake=Math.min(1,shake+w.recoil*2);
  if(w.rocket){fireRocket(ox+dx,oy+dy,oz+dz,dx,dy,dz,false);shake=Math.min(1,shake+.2)}
  else for(let k=0;k<(w.pellets||1);k++){
    const sp=(w.spread+player.bloom*(player.zoom?.15:1))*(player.car?1.6:1)*(player.onGround?1:2);let ex=dx+rand(-sp,sp),ey=dy+rand(-sp,sp),ez=dz+rand(-sp,sp);const el=Math.hypot(ex,ey,ez);ex/=el;ey/=el;ez/=el;
    const h=rayHit(ox,oy,oz,ex,ey,ez,w.range,player.car);
    const hx=ox+ex*h.t,hy=oy+ey*h.t,hz=oz+ez*h.t;tracer(ox,oy,oz,hx,hy,hz);
    const fall=h.t>w.eff?clamp(1-(h.t-w.eff)/(w.range-w.eff)*.55,.45,1):1,dmg=w.dmg*fall;
    if(h.kind==='ped')damagePed(h.ref,dmg*(h.head?(wid==='sniper'?4:2.6):1),ex,ez,true,h.head);
    else if(h.kind==='car'){damageCar(h.ref,dmg*.55,0,true);sparks(hx,hy,hz,5)}
    else if(h.kind==='heli')damageHeli(h.ref,dmg,true);
    else if(h.kind==='world'){sparks(hx,hy,hz,4);fxN.spawn(hx,hy,hz,0,.6,0,COL.dust,.5,.6,.6,1.5)}
  }
  if(clipOf(wid)<=0&&save.weapons[wid]>0)startReload(wid);
  if(crimeCD<=0){alarm(player.x,player.z,wid==='sniper'?30:45);if(policeNear(60))minWanted(1);crime(.25);crimeCD=1.5}
}

// ===================== Player, camera, input state =====================
let camYaw=player.a,camPitch=.22,lookT=-9,camFar=false;
const inp={x:0,y:0,fire:false,jump:false,run:false,brake:false,nos:false};
const keys=new Set();
const K=(...a)=>a.some(k=>keys.has(k));
function buildPlayer(){
  if(player.model)disposePerson(player.model);
  const m=makePerson(save.char||DEF_CHAR,true);player.model=m;
  for(const w of WORDER)if(w!=='fist'){const gm=makeGun(w);m.hold.add(gm);m.guns[w]=gm}
  showGun();m.g.visible=!player.car;
}
function enterExit(){
  if(state!=='play')return;
  const sh=nearShop();if(sh){openShop(sh);return}
  if(player.car){if(Math.abs(player.car.v)>9){toast('Slow down to get out');return}exitCar();return}
  let best=null,bd=4.8;for(const c of vehicles){if(c.burnt||c.wreck)continue;const d=Math.hypot(c.x-player.x,c.z-player.z);if(d<bd){bd=d;best=c}}
  if(!best)return;
  if(best.driver&&best.ctrl!=='none'){bail(best);if(best.kind==='police'){minWanted(2);toast('You jacked a squad car','bad')}else{toast('Carjacked');crime(policeNear(55)?1.2:.3)}}
  else if(best.kind==='police'&&!best.mine){minWanted(1)}
  best.ctrl='player';best.ai=null;best.driver=true;player.car=best;player.model.g.visible=false;sfx.door();
  if(best.mine)toast('Welcome back to your ride','cash',1.6);
  radioShow();
}
function exitCar(){
  const c=player.car;if(!c)return;const r=[-Math.cos(c.a),Math.sin(c.a)];
  let p={x:c.x-r[0]*2.5,z:c.z-r[1]*2.5};if(solidAt(p.x,1,p.z)||!walkable(p.x,p.z))p={x:c.x+r[0]*2.5,z:c.z+r[1]*2.5};
  collideCircle(p,.5);player.x=p.x;player.z=p.z;player.a=c.a;player.y=groundY(p.x,p.z);
  c.ctrl='none';c.driver=false;player.car=null;player.model.g.visible=true;showGun();sfx.door();$('radio').hidden=true;
}
function updatePlayer(dt){
  player.fireCD-=dt;player.aimT-=dt;player.hurtCD-=dt;player.bloom*=Math.exp(-dt*5);
  if(player.reloadT>0){player.reloadT-=dt;if(player.reloadT<=0){const id=player.reloadId;player.clip[id]=Math.min(WEAP[id].mag,save.weapons[id]||0)}}
  if(player.zoom&&(!WEAP[player.weapon].scope||player.car))player.zoom=false;
  if(inp.fire)fire();else player.trigger=false;
  if(player.car){
    const c=player.car;
    const thr=clamp((K('w','arrowup')?1:0)-(K('s','arrowdown')?1:0)+inp.y*1.25,-1,1);
    const steer=clamp((K('d','arrowright')?1:0)-(K('a','arrowleft')?1:0)+inp.x*1.3,-1,1);
    const boost=(K('n','shift')||inp.nos)&&c.spec&&c.spec.nitro&&c.nos>0&&thr>0;
    if(boost){c.nos=Math.max(0,c.nos-dt*.28)}else c.nos=Math.min(1,c.nos+dt*.04);
    if(c.wreck&&!c.burnt){drive(c,0,steer,true,dt,false)}else drive(c,thr,steer,K(' ')||inp.brake,dt,boost);
    c.boost=boost;player.x=c.x;player.z=c.z;player.y=c.y;
    return;
  }
  let mx=(K('d','arrowright')?1:0)-(K('a','arrowleft')?1:0)+inp.x,my=(K('w','arrowup')?1:0)-(K('s','arrowdown')?1:0)+inp.y;
  const ml=Math.hypot(mx,my);if(ml>1){mx/=ml;my/=ml}
  const fx=Math.sin(camYaw),fz=Math.cos(camYaw),rx=-fz,rz=fx;
  const wx=fx*my+rx*mx,wz=fz*my+rz*mx,mag=Math.min(1,Math.hypot(wx,wz));
  const sprint=K('shift')||inp.run,spd=mag<.05?0:(sprint?9.2:(coarse&&mag>.92?7:4.4))*mag;
  const aiming=player.aimT>0&&player.weapon!=='fist';
  if(mag>.05&&!aiming)player.a+=wrapA(Math.atan2(wx,wz)-player.a)*Math.min(1,dt*12);
  if(aiming&&player.target)player.a=Math.atan2(player.target.x-player.x,player.target.z-player.z);
  else if(aiming)player.a+=wrapA(camYaw-player.a)*Math.min(1,dt*12);
  const p={x:player.x+(mag>.05?wx/mag:0)*spd*dt,z:player.z+(mag>.05?wz/mag:0)*spd*dt};
  collideCircle(p,.45);
  for(const c of vehicles){const cfx=Math.sin(c.a),cfz=Math.cos(c.a),off=c.t.L/2-c.t.W/2,rr=c.t.W/2+.55;
    for(const s of[off,-off]){const cx=c.x+cfx*s,cz=c.z+cfz*s,dx=p.x-cx,dz=p.z-cz,d=Math.hypot(dx,dz);
      if(d<rr&&d>1e-4){p.x=cx+dx/d*rr;p.z=cz+dz/d*rr;const vs=Math.hypot(c.vel.x,c.vel.z);
        if(vs>6&&player.hurtCD<=0){hurtPlayer(vs*1.6);player.hurtCD=.8;p.x+=c.vel.x*.15;p.z+=c.vel.z*.15;sfx.crash(vs)}}}}
  if(walkable(p.x,p.z)){player.x=p.x;player.z=p.z}
  const gy=groundY(player.x,player.z);
  if((K(' ')||inp.jump)&&player.onGround){player.vy=6.5;player.onGround=false}
  player.vy-=20*dt;player.y+=player.vy*dt;if(player.y<=gy){player.y=gy;player.vy=0;player.onGround=true}
  player.ph+=spd*dt*2.6;
  const W=WEAP[player.weapon];
  const mode=!player.onGround?'jump':aiming?(W.hands===3?'rpg':W.hands===2?'aim2':'aim1'):(player.aimT>1.1&&player.weapon==='fist'?'punch':'walk');
  animPerson(player.model,player.ph,mode,spd>.1?(spd>6?1.25:.8):0);
  const g=player.model.g;g.position.set(player.x,player.y,player.z);g.rotation.y=player.a;
}
const camPos=new THREE.Vector3(),camLook=new THREE.Vector3();
function look(dx,dy){const s=.0034*save.settings.sens*(player.zoom?.3:1);camYaw=wrapA(camYaw-dx*s);camPitch=clamp(camPitch+dy*s*(save.settings.invert?-1:1)*.85,-.15,1.1);lookT=gameT}
let orbit=0;
function updateCamera(dt){
  let tx=player.x,ty=player.y,tz=player.z,dist,h,lookUp;
  if(state==='title'){orbit+=dt*.05;const r=150;camera.position.set(110+Math.cos(orbit)*r,70,-120+Math.sin(orbit)*r);camera.lookAt(110,25,-130);return}
  if(state==='shop'){orbit+=dt*.25;const c=shopCtx&&shopCtx.car;const r=c?8:2.5,yy=c?2.4:1.55;if(c){tx=c.x;ty=c.y;tz=c.z}
    camera.position.set(tx+Math.sin(camYaw+orbit)*r,ty+yy,tz+Math.cos(camYaw+orbit)*r);camera.lookAt(tx,ty+(c?.8:1.25),tz);return}
  const c=player.car;
  if(c){const sp=Math.abs(c.v);if(gameT-lookT>1.4)camYaw+=wrapA(c.vis-camYaw+(c.v<-2?PI:0))*Math.min(1,dt*2.6);dist=c.t.L*2.1+sp*.06;h=1.2;lookUp=1.2;ty=c.y;if(gameT-lookT>1.4)camPitch+=(.2-camPitch)*Math.min(1,dt*2)}
  else if(player.zoom){dist=.05;h=1.68;lookUp=1.68}
  else{dist=player.aimT>0&&player.weapon!=='fist'?3.6:4.8;h=1.55;lookUp=1.5}
  if(camFar)dist*=1.6;
  const fx=Math.sin(camYaw),fz=Math.cos(camYaw),cp=Math.cos(camPitch),spH=Math.sin(camPitch);
  const side=!c&&!player.zoom&&player.aimT>0&&player.weapon!=='fist'?.75:0;
  if(player.model)player.model.g.visible=!c&&!player.zoom;
  let dd=dist;const bx0=tx-fz*side,bz0=tz+fx*side;
  while(dd>1.6&&solidAt(bx0-fx*cp*dd,ty+h+spH*dd,bz0-fz*cp*dd))dd-=.5;
  camPos.set(bx0-fx*cp*dd,Math.max(groundY(bx0-fx*cp*dd,bz0-fz*cp*dd)+.4,ty+h+spH*dd),bz0-fz*cp*dd);
  if(shake>0){camPos.x+=(Math.random()-.5)*shake*.7;camPos.y+=(Math.random()-.5)*shake*.5;shake=Math.max(0,shake-dt*2)}
  camera.position.lerp(camPos,Math.min(1,dt*(c?9:14)));
  camLook.set(bx0+fx*2,ty+lookUp,bz0+fz*2);camera.lookAt(camLook);
  const fov=player.zoom?18:62+(c?Math.min(16,Math.abs(c.v)*.32)+(c.boost?8:0):0);if(Math.abs(camera.fov-fov)>.05){camera.fov=lerp(camera.fov,fov,Math.min(1,dt*4));camera.updateProjectionMatrix();pScale=renderer.domElement.height/(2*Math.tan(camera.fov*PI/360))}
}

// ===================== Wanted, spawning, jobs =====================
let spawnT=0;const lastWave={};
function updateWorldSim(dt){
  crimeCD-=dt;
  for(const c of vehicles){
    if(c.ctrl==='player')continue;
    if(c.ctrl==='lane')updateLane(c,dt);
    else if(c.ctrl==='police')updatePolice(c,dt);
    else if(Math.abs(c.vel.x)+Math.abs(c.vel.z)>.05)drive(c,0,0,true,dt,false);
  }
  // car vs car
  for(let i=0;i<vehicles.length;i++){const a=vehicles[i];for(let j=i+1;j<vehicles.length;j++){const b=vehicles[j];
    if(Math.abs(a.x-b.x)>6||Math.abs(a.z-b.z)>6)continue;
    if(a.ctrl==='lane'&&b.ctrl==='lane')continue;
    if((a.ctrl==='lane'&&a.ai.ghost>0&&b!==player.car)||(b.ctrl==='lane'&&b.ai.ghost>0&&a!==player.car))continue;
    const afx=Math.sin(a.a),afz=Math.cos(a.a),bfx=Math.sin(b.a),bfz=Math.cos(b.a),ao=a.t.L/2-a.t.W/2,bo=b.t.L/2-b.t.W/2,rs=a.t.W/2+b.t.W/2+.1;let best=null;
    for(const sa of[ao,-ao])for(const sb of[bo,-bo]){const dx=(b.x+bfx*sb)-(a.x+afx*sa),dz=(b.z+bfz*sb)-(a.z+afz*sa),d=Math.hypot(dx,dz);if(d<rs&&(!best||d<best.d))best={d,dx,dz}}
    if(!best||best.d<1e-4)continue;
    const nx=best.dx/best.d,nz=best.dz/best.d,ov=rs-best.d;a.x-=nx*ov/2;a.z-=nz*ov/2;b.x+=nx*ov/2;b.z+=nz*ov/2;
    const rv=(b.vel.x-a.vel.x)*nx+(b.vel.z-a.vel.z)*nz;
    if(rv<0){const k=1.3*rv/2;a.vel.x+=nx*k;a.vel.z+=nz*k;b.vel.x-=nx*k;b.vel.z-=nz*k;const imp=-rv;
      for(const c of[a,b]){if(c.ctrl==='lane'&&imp>2.5)c.ctrl='none';c.v=c.vel.x*Math.sin(c.a)+c.vel.z*Math.cos(c.a)}
      const pc=a===player.car?b:b===player.car?a:null;
      if(imp>5){damageCar(a,(imp-5)*2.2,imp,!!pc);damageCar(b,(imp-5)*2.2,imp,!!pc)}
      if(pc&&imp>6&&crimeCD<=0){if(pc.kind==='police'&&pc.driver){crime(1);minWanted(1)}else if(policeNear(45))crime(.6);crimeCD=2}}
  }}
  // wrecks, visuals
  const blink=(gameT*5|0)%2;
  for(const c of vehicles.slice()){
    c.vis+=wrapA(c.a-c.vis)*Math.min(1,dt*(c.ctrl==='lane'?7:30));
    c.y=lerp(c.y,groundY(c.x,c.z),Math.min(1,dt*10));
    const m=c.m;m.g.position.set(c.x,c.y,c.z);m.g.rotation.y=c.vis;
    for(const w of m.wheels){w.s.rotation.x=c.dist/c.t.r;if(w.front)w.o.rotation.y=-c.steer*.45}
    m.body.rotation.z=clamp(-c.steer*c.v*.004,-.06,.06);
    if(m.red){const on=(c.kind==='police'&&(wanted>0&&(c.driver||c.lights)))||(c.ctrl==='player'&&c.kind==='police');m.red.material.color.set(on&&blink?'#ff2020':'#551010');m.blue.material.color.set(on&&!blink?'#3060ff':'#101a55');c.flashing=on}
    if(c.health<45&&!c.burnt&&Math.random()<dt*8)fxN.spawn(c.x+Math.sin(c.a)*c.t.L*.35,c.y+1.2,c.z+Math.cos(c.a)*c.t.L*.35,rand(-.4,.4),2,rand(-.4,.4),c.health<20?COL.smoke:COL.smokeL,.5,.8,1.6,2.2);
    if(c.wreck&&!c.burnt){c.wreck+=dt;if(Math.random()<dt*30)fxA.spawn(c.x+rand(-.8,.8),c.y+1.3,c.z+rand(-.8,.8),0,rand(1.5,3),0,Math.random()<.5?COL.fire:COL.fire2,.9,rand(.6,1.1),rand(.3,.6),.5);
      if(c.wreck>c.bomb){c.burnt=true;m.bm.material=burntMat;m.gm.visible=false;if(c===player.car){exitCar();hurtPlayer(200)}explode(c.x,c.y,c.z,8,c.byPlayer);if(c.kind==='police'&&c.byPlayer)crime(2)}}
    if(c.slip>5&&Math.abs(c.v)>4&&Math.random()<.7){const bx=c.x-Math.sin(c.a)*c.t.L*.35,bz=c.z-Math.cos(c.a)*c.t.L*.35;fxN.spawn(bx,c.y+.3,bz,rand(-.6,.6),rand(.5,1.4),rand(-.6,.6),COL.tire,.35,1.1,1.4,1.8)}
  }
  for(const p of peds.slice())updatePed(p,dt);
  for(const p of cops.slice())updateCop(p,dt);
  for(const h of helis.slice())updateHeli(h,dt);updRockets(dt);
  // pickups
  for(let i=pickups.length-1;i>=0;i--){const p=pickups[i];
    if(p.cd>0){p.cd-=dt;p.m.visible=false;if(p.cd<=0)p.m.visible=true;continue}
    p.t+=dt;p.m.position.set(p.x,groundY(p.x,p.z)+.9+Math.sin(p.t*3)*.15,p.z);p.m.rotation.y=p.t*2.2;
    if(p.temp){p.life-=dt;if(p.life<=0){scene.remove(p.m);pickups.splice(i,1);continue}}
    if(Math.hypot(p.x-player.x,p.z-player.z)<(player.car?2.6:1.5)){let ok=true;
      if(p.kind==='cash'){save.money+=p.amount;toast('+'+fmt(p.amount),'cash',1.2)}
      else if(p.kind==='health'){if(player.health>=100)ok=false;else{player.health=100;toast('Health restored','cash',1.2)}}
      else if(p.kind==='armor'){if(player.armor>=100)ok=false;else{player.armor=100;toast('Body armor','cash',1.2)}}
      else if(p.kind==='ammo'){const w=owned().filter(x=>x!=='fist'&&x!=='rpg'&&x!=='sniper');const id=w.length?pick(w):'pistol';save.weapons[id]=(save.weapons[id]||0)+Math.round(WEAP[id].pack/3);toast('+ '+WEAP[id].name+' ammo','cash',1.2)}
      if(ok){sfx.pickup();if(p.temp){scene.remove(p.m);pickups.splice(i,1)}else p.cd=60}}
  }
  // spawning & despawning
  spawnT-=dt;
  if(spawnT<=0){spawnT=.35;const far=drawDist*.8;
    for(const c of vehicles.slice()){if(c===player.car||c.mine)continue;const d=Math.hypot(c.x-player.x,c.z-player.z);if(d>far||(c.kind==='police'&&wanted===0&&d>110&&!c.driver))removeVehicle(c)}
    const lane=vehicles.filter(c=>c.ctrl==='lane').length;if(lane<Q.traffic)spawnTraffic(80,far*.9);
    if(vehicles.length<Q.traffic+12&&Math.random()<.2)spawnParked(80,far*.9);
    while(peds.filter(p=>!p.extra).length<Q.peds)spawnPed(false);
    const pc=vehicles.filter(c=>c.kind==='police'&&c.driver).length;
    if(pc<Math.min(POLICE_CARS[wanted],Q.cops)){const s=roadSpawn(70,150);if(s){const role=wanted>=5?(Math.random()<.65?'army':'swat'):wanted>=3?(Math.random()<.55?'swat':'police'):'police';const tn=role==='swat'?'van':role==='army'?'suv':(wanted>=2&&Math.random()<.35?'suv':'sedan');
      const c=addVehicle(tn,s.x,s.z,Math.atan2(player.x-s.x,player.z-s.z),role,'police');c.vel={x:Math.sin(c.a)*12,z:Math.cos(c.a)*12};c.v=12;if(role!=='police'&&!lastWave[role]){lastWave[role]=1;toast(role==='swat'?'SWAT is rolling in':'The army has been deployed','bad',2.4)}}}
    if(wanted<3)lastWave.swat=0;if(wanted<5)lastWave.army=0;
    if(wanted>=4&&!helis.some(h=>h.type==='police'))spawnHeli('police');
    if(wanted>=5&&!helis.some(h=>h.type==='army'))spawnHeli('army');
  }
  // wanted decay & arrest
  if(wanted>0){
    if(policeNear(wanted>=3?90:70))evade=0;else{evade+=dt;if(evade>7+wanted*4){wanted=0;heat=0;toast('You lost the cops','cash',2);for(const p of cops)p.hostile=false}}
    if(player.car&&Math.abs(player.car.v)<1&&wanted<=1){for(const c of cops)if(c.state!=='dead'&&Math.hypot(c.x-player.x,c.z-player.z)<3){bustT+=dt;break}}
    if(bustT>1.6)goDown('busted');
    bustT=Math.max(0,bustT-dt*.5);
  }else bustT=0;
  if(player.health<=0&&state==='play')goDown('wasted');
  // job
  updateJob(dt);
  // ferris
  const fw=ferris.userData;fw.wheel.rotation.x+=dt*.08;for(const k of fw.cab){const a=k.a+fw.wheel.rotation.x;k.m.position.set(0,Math.sin(a)*fw.R-1,Math.cos(a)*fw.R)}
}
const job={on:false,cd:6,kind:'delivery',x:0,z:0,time:0,reward:0,cargo:'',dest:'',ped:null,beam:null};
const CARGO=['a bag of "souvenirs"','a crate of rum','a locked briefcase','hot stereo parts','a sealed envelope','a cooler of shrimp','a box of fireworks','a stolen painting'];
const beam=new THREE.Mesh(new THREE.CylinderGeometry(2.4,2.4,80,24,1,true),new THREE.MeshBasicMaterial({color:C('#ffcc4d'),transparent:true,opacity:.35,side:THREE.DoubleSide,depthWrite:false,blending:THREE.AdditiveBlending}));beam.visible=false;scene.add(beam);
const arrow=new THREE.Mesh(new THREE.ConeGeometry(.45,.9,4).rotateX(PI),new THREE.MeshBasicMaterial({color:C('#ff3b30')}));arrow.visible=false;scene.add(arrow);
let waypoint=null;
function newJob(){
  job.kind=job.kind==='delivery'&&Math.random()<.6?'hit':'delivery';
  if(job.kind==='hit'){const c=peds.filter(p=>p.state==='walk'&&!p.extra&&Math.hypot(p.x-player.x,p.z-player.z)>90);if(!c.length){job.kind='delivery'}
    else{const p=pick(c);p.bounty=true;p.health=90;job.ped=p;job.reward=randi(30,80)*10;job.on=true;job.time=0;const pn=placeName(p.x,p.z);job.dest=pn.d;toast('Contract: take out the mark near '+pn.d,'bad',3.5);
      const gun=makeGun('pistol');gun.visible=true;p.m.hold.add(gun);arrow.visible=true;return}}
  let q=null;for(let t=0;t<40;t++){const b=pick(blockList),c=perim(b.x0,b.z0,rand(0,208)),d=Math.hypot(c.x-player.x,c.z-player.z);if(d>180&&d<520){q=c;break}if(!q&&d>100)q=c}
  if(!q){const b=pick(blockList);q=perim(b.x0,b.z0,10)}
  const d=Math.hypot(q.x-player.x,q.z-player.z);
  Object.assign(job,{on:true,x:q.x,z:q.z,time:d/12+25,reward:Math.round(d*3.4/10)*10+150,cargo:pick(CARGO),dest:placeName(q.x,q.z).s||placeName(q.x,q.z).d});
  beam.position.set(q.x,40,q.z);beam.visible=true;toast('Delivery: take '+job.cargo+' to '+job.dest,'job',3.5);
}
function completeJob(){save.money+=job.reward;toast((job.kind==='hit'?'Contract complete! +':'Delivered! +')+fmt(job.reward),'cash',2.6);sfx.pickup();endJob(5)}
function endJob(cd){job.on=false;job.cd=cd;beam.visible=false;arrow.visible=false;if(job.ped){job.ped.bounty=false;job.ped=null}}
function updateJob(dt){
  if(!job.on){job.cd-=dt;if(job.cd<=0&&state==='play')newJob();return}
  if(job.kind==='hit'){const p=job.ped;if(!p||p.state==='dead'){endJob(6);return}
    job.x=p.x;job.z=p.z;arrow.position.set(p.x,p.y+2.6+Math.sin(gameT*4)*.15,p.z);arrow.rotation.y+=dt*3;
    if(p.state==='walk'&&Math.hypot(p.x-player.x,p.z-player.z)<28){p.state='attack';toast('The mark spotted you!','bad',1.6)}return}
  job.time-=dt;beam.material.opacity=.28+Math.sin(gameT*3)*.08;
  if(Math.hypot(job.x-player.x,job.z-player.z)<5)completeJob();
  else if(job.time<=0){toast('Too slow. The client walked.','bad',2.6);endJob(8)}
}
function gpsTarget(){if(waypoint)return waypoint;if(job.on)return{x:job.x,z:job.z};return null}
function gpsPath(t){
  const sx=Math.round(player.x/P),sz=Math.round(player.z/P),tx=clamp(Math.round(t.x/P),-N,N),tz=clamp(Math.round(t.z/P),-N,N);
  const onAve=Math.abs(player.x-sx*P)<Math.abs(player.z-sz*P);
  const cx=clamp(sx,-N,N),cz=clamp(sz,-N,N),corner=onAve?[cx*P,tz*P]:[tx*P,cz*P];
  return[[player.x,player.z],[cx*P,cz*P],corner,[tx*P,tz*P],[t.x,t.z]];
}

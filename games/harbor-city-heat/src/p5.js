
// ===================== Game entities =====================
const player={clip:{},reloadT:0,reloadId:null,bloom:0,trigger:false,zoom:false,x:P+9,z:36,y:.3,vy:0,a:PI*.85,health:100,armor:save.armor||0,car:null,ph:0,hurtCD:0,weapon:'pistol',fireCD:0,aimT:0,lastShot:-9,onGround:true,model:null,target:null};
if(!save.weapons[player.weapon])player.weapon='fist';
const vehicles=[],peds=[],cops=[],rockets=[],pickups=[];
const helis=[];let wanted=0,heat=0,evade=0,bustT=0,shake=0,gameT=0,crimeCD=0;
const THR=[0,1,4,9,16,26],POLICE_CARS=[0,2,3,4,5,6];
function crime(pts){heat+=pts;let w=0;for(let k=0;k<6;k++)if(heat>=THR[k])w=k;if(w>wanted){wanted=w;starPulse=1}evade=0}
function minWanted(w){if(wanted<w){wanted=w;heat=Math.max(heat,THR[w]);starPulse=1}evade=0}
let starPulse=0;

function addVehicle(tn,x,z,a,role,ctrl){
  const m=makeCar(tn,pick(PAINT),role),t=CT[tn];
  const law=role==='police'||role==='swat'||role==='army';
  const c={m,t,tn,x,z,y:0,a,vis:a,vel:{x:0,z:0},v:0,steer:0,dist:0,health:t.hp*(role==='swat'||role==='army'?1.8:1),kind:law?'police':role||'civ',unit:law?role:null,ctrl,ai:null,driver:ctrl!=='none',wreck:0,burnt:false,stuck:0,rev:0,spec:null,nos:1,lights:false,byPlayer:false,deployed:false,slip:0,braking:false};
  c.st=carStats(c);m.g.position.set(x,0,z);m.g.rotation.y=a;vehicles.push(c);return c;
}
function removeVehicle(c){scene.remove(c.m.g);if(c.m.own)c.m.paint.dispose();const i=vehicles.indexOf(c);if(i>=0)vehicles.splice(i,1)}
function roadSpawn(minD,maxD){
  for(let t=0;t<40;t++){
    const d=randi(0,3),k=randi(-N,N),m=randi(-N,N-1),along=rand(m*P+12,(m+1)*P-12);let x,z,tx,tz;
    if(d===0||d===2){x=k*P+RIGHT[d][0]*LANE;z=along;tx=k;tz=d===0?m+1:m}else{z=k*P+RIGHT[d][1]*LANE;x=along;tz=k;tx=d===1?m+1:m}
    const pd=Math.hypot(x-player.x,z-player.z);if(pd<minD||pd>maxD)continue;
    if(vehicles.some(o=>Math.abs(o.x-x)<9&&Math.abs(o.z-z)<9))continue;
    return{x,z,d,tx,tz};
  }return null;
}
function spawnTraffic(minD,maxD){const s=roadSpawn(minD,maxD);if(!s)return;const role=Math.random()<.08?'taxi':'civ';
  const ar=areaName(s.x,s.z),rich=ar==='Palmwood Hills'||ar==='Downtown'||ar==='Paloma Beach';
  const tn=role==='taxi'?'sedan':(rich&&Math.random()<.4)?pick(RICH_TYPES):pick(CIV_TYPES);
  const c=addVehicle(tn,s.x,s.z,ANG[s.d],role,'lane');const agg=Math.random()<.12;
  c.ai={d:s.d,tx:s.tx,tz:s.tz,cruise:agg?rand(15,19):rand(9,13.5),wait:0,ghost:0};c.v=c.ai.cruise;plan(c)}

function spawnParked(minD,maxD){const s=roadSpawn(minD,maxD);if(!s)return;const c=addVehicle(pick(CIV_TYPES),s.x+RIGHT[s.d][0]*2.3,s.z+RIGHT[s.d][1]*2.3,ANG[s.d],'civ','none');c.driver=false}
function plan(c){const ai=c.ai,d=ai.d,opts=[];
  for(const nd of[d,(d+1)%4,(d+3)%4])if(Math.abs(ai.tx+FWD[nd][0])<=N&&Math.abs(ai.tz+FWD[nd][1])<=N)opts.push(nd);
  const nd=opts.includes(d)&&Math.random()<.55?d:pick(opts);ai.nd=nd;
  const axisZ=d===0||d===2,center=axisZ?ai.tz*P:ai.tx*P;ai.trig=nd===d?center:center+(axisZ?RIGHT[nd][1]:RIGHT[nd][0])*LANE}
function updateLane(c,dt){
  const ai=c.ai,f=FWD[ai.d],r=RIGHT[ai.d];let target=ai.cruise;
  const blk=(ox,oz,rad)=>{const rx=ox-c.x,rz=oz-c.z,al=rx*f[0]+rz*f[1];if(al>0&&al<13&&Math.abs(rx*r[0]+rz*r[1])<rad)target=Math.min(target,al<7?0:target*.4)};
  if(ai.ghost>0)ai.ghost-=dt;else{for(const o of vehicles)if(o!==c)blk(o.x,o.z,2.2);if(!player.car)blk(player.x,player.z,2);if(wanted>2&&Math.random()<.002)ai.cruise=rand(14,20)}
  if(c.v<.5){ai.wait+=dt;if(ai.wait>5){ai.ghost=2.5;ai.wait=0}}else ai.wait=0;
  c.v+=clamp(target-c.v,-22*dt,5*dt);
  const axisZ=f[0]===0;
  if(axisZ){c.z+=f[1]*c.v*dt;c.x+=(ai.tx*P+r[0]*LANE-c.x)*Math.min(1,dt*3)}else{c.x+=f[0]*c.v*dt;c.z+=(ai.tz*P+r[1]*LANE-c.z)*Math.min(1,dt*3)}
  const along=axisZ?c.z:c.x,sg=axisZ?f[1]:f[0];
  if((along-ai.trig)*sg>=0){if(axisZ)c.z=ai.trig;else c.x=ai.trig;ai.d=ai.nd;c.a=ANG[ai.d];ai.tx+=FWD[ai.d][0];ai.tz+=FWD[ai.d][1];plan(c)}
  c.vel.x=FWD[ai.d][0]*c.v;c.vel.z=FWD[ai.d][1]*c.v;c.dist+=c.v*dt;c.braking=target<c.v-1;
}
function drive(c,thr,steer,hb,dt,boost){
  const st=c.st;let maxV=st.max,acc=st.acc;if(boost){maxV+=15;acc*=1.9}
  const sp=c.v,yaw=steer*2.2*clamp(Math.abs(sp)/5,0,1)/(1+Math.abs(sp)/42)*(sp<0?-1:1)*(hb?1.55:1);
  c.a=wrapA(c.a-yaw*dt);c.steer=lerp(c.steer,steer,Math.min(1,dt*10));
  const fx=Math.sin(c.a),fz=Math.cos(c.a),rx=-fz,rz=fx;
  let fs=c.vel.x*fx+c.vel.z*fz,ls=c.vel.x*rx+c.vel.z*rz;
  if(thr>0){if(fs<-.5)fs+=40*thr*dt;else fs+=acc*thr*dt*Math.max(0,1-fs/maxV)}
  else if(thr<0){if(fs>.5)fs-=36*-thr*dt;else if(fs>-13)fs-=10*-thr*dt}
  else fs-=Math.sign(fs)*Math.min(Math.abs(fs),3*dt);
  if(hb)fs-=Math.sign(fs)*Math.min(Math.abs(fs),12*dt);
  fs-=fs*.1*dt;c.slip=Math.abs(ls);ls*=Math.exp(-(hb?.9:st.grip)*dt);
  c.braking=(thr<0&&fs>.5)||hb;
  c.vel.x=fx*fs+rx*ls;c.vel.z=fz*fs+rz*ls;
  const ox=c.x,oz=c.z;c.x+=c.vel.x*dt;c.z+=c.vel.z*dt;
  if(!walkable(c.x,c.z)){c.x=ox;c.z=oz;c.vel.x*=-.3;c.vel.z*=-.3}
  const off=c.t.L/2-c.t.W/2,rad=c.t.W/2+.12;
  for(const s of[off,-off]){const p={x:c.x+fx*s,z:c.z+fz*s},px=p.x,pz=p.z,hit=collideCircle(p,rad);
    if(hit){c.x+=p.x-px;c.z+=p.z-pz;const vn=c.vel.x*hit.nx+c.vel.z*hit.nz;if(vn<0){c.vel.x-=hit.nx*vn*1.3;c.vel.z-=hit.nz*vn*1.3;if(-vn>6)damageCar(c,(-vn-6)*2.3,-vn,false)}}}
  c.v=c.vel.x*fx+c.vel.z*fz;c.dist+=c.v*dt;
}
function damageCar(c,amt,imp,byPlayer){
  if(c.burnt||amt<=0)return;
  if(c.spec)amt*=1-.17*(c.spec.armor||0);
  c.health-=amt;if(byPlayer)c.byPlayer=true;
  if(c===player.car&&imp){sfx.crash(imp);shake=Math.min(1,shake+imp/28)}
  if(c.ctrl==='lane'&&(imp>2.5||byPlayer)){c.ctrl='none'}
  if(byPlayer&&c.driver&&c.ctrl!=='player'&&c.kind!=='police'&&Math.random()<.35){bail(c)}
  if(c.health<=0&&!c.wreck){c.wreck=.001;c.bomb=rand(3,5);if(c.driver&&c!==player.car)bail(c);c.driver=false;if(c.ctrl!=='player')c.ctrl='none';
    if(c===player.car)toast('Your car is on fire — get out!','bad',2.5)}
}
function bail(c){c.driver=false;if(c.ctrl==='lane'||c.ctrl==='police')c.ctrl='none';const r=[-Math.cos(c.a),Math.sin(c.a)];
  if(c.kind==='police'){spawnCop(c.x-r[0]*2.4,c.z-r[1]*2.4,c.unit||'police')}else{const p=spawnPed(true);p.x=c.x-r[0]*2.4;p.z=c.z-r[1]*2.4;react(p,'danger',player.x,player.z,true)}}

function explode(x,y,z,radius,byPlayer){
  for(let k=0;k<26;k++)fxA.spawn(x+rand(-1,1),y+rand(0,1.5),z+rand(-1,1),rand(-6,6),rand(2,9),rand(-6,6),k%2?COL.fire:COL.fire2,1,rand(1.6,3),rand(.4,.9),1.6,2,2);
  for(let k=0;k<22;k++)fxN.spawn(x+rand(-2,2),y+rand(0,2),z+rand(-2,2),rand(-2,2),rand(2,5),rand(-2,2),COL.smoke,.7,rand(2,3.5),rand(2,4),2.5,.6,.6);
  sparks(x,y+1,z,20);decal(x,z,'#141210',rand(3,4.5),false);
  if(Q.shadow){flash.position.set(x,y+3,z);flash.intensity=6}
  sfx.boom(Math.hypot(x-player.x,z-player.z));
  const pd=Math.hypot(player.x-x,player.z-z);shake=Math.max(shake,clamp(1-pd/60,0,1));
  if(pd<radius&&!(player.car&&player.car.burnt===false&&player.car.wreck===0))hurtPlayer((1-pd/radius)*90);
  for(const c of vehicles){const d=Math.hypot(c.x-x,c.z-z);if(d<radius+1&&!c.burnt&&d>.01){damageCar(c,140*(1-d/(radius+1)),0,byPlayer);c.vel.x+=(c.x-x)/d*6;c.vel.z+=(c.z-z)/d*6}}
  for(const p of peds.concat(cops)){if(p.state==='dead')continue;const d=Math.hypot(p.x-x,p.z-z);if(d<radius){const k=(1-d/radius);killPed(p,{x:(p.x-x)/(d||1)*14*k,y:8*k+3,z:(p.z-z)/(d||1)*14*k},byPlayer)}}
  for(const h of helis)if(!h.dead&&Math.hypot(h.x-x,h.z-z,h.y-y)<radius+3)damageHeli(h,220,byPlayer);
  if(byPlayer)crime(1.2);
  alarm(x,z,60);
}
function hurtPlayer(d){if(state!=='play')return;const a=Math.min(player.armor,d*.7);player.armor-=a;player.health=Math.max(0,player.health-(d-a));vigT=.5;shake=Math.min(1,shake+.25)}

// --- Peds ---
function nearBlock(minD,maxD){for(let t=0;t<25;t++){const b=pick(blockList),d=Math.hypot(b.x0+28-player.x,b.z0+28-player.z);if(d>minD&&d<maxD)return b}return pick(blockList)}
const ARCH={local:{w:[1.1,1.6],run:[5.4,6.4],react:[.4,1],brave:0,hp:45,wt:.33},jogger:{w:[2.6,3.2],run:[7,7.8],react:[.25,.5],brave:0,hp:50,wt:.1},
  elder:{w:[.55,.85],run:[2.4,3.2],react:[1.1,1.9],brave:0,hp:28,wt:.1},business:{w:[1.4,1.8],run:[5.4,6.2],react:[.5,.9],brave:0,hp:45,wt:.15},
  tourist:{w:[.9,1.3],run:[5,5.8],react:[.8,1.4],brave:0,hp:45,wt:.12},thug:{w:[1,1.4],run:[6.6,7.4],react:[.15,.35],brave:2,hp:80,wt:.1},brawler:{w:[1.1,1.5],run:[6.4,7],react:[.2,.4],brave:1,hp:75,wt:.1}};
function pickArch(){let r=Math.random(),acc=0;for(const k in ARCH){acc+=ARCH[k].wt;if(r<acc)return k}return'local'}
function newPedObj(cfg,cop,arch){const m=makePerson(cfg,false);const A=ARCH[arch||'local'];
  return{m,cfg,cop:!!cop,arch:arch||'local',A,x:0,z:0,y:0,a:0,state:'walk',health:A.hp,ph:rand(0,6),bl:null,s:0,dir:1,speed:rand(...A.w),run:rand(...A.run),react:rand(...A.react),reactT:0,pend:null,
    deadT:0,fl:null,fleeT:0,tx:0,tz:0,shootCD:rand(.5,1.5),hitCD:0,hostile:false,bounty:false,clear:true,losT:0,spin:0,seeT:0}}
function placePed(p,bl){p.bl=bl;p.s=rand(0,208);p.dir=Math.random()<.5?1:-1;p.state='walk';p.health=p.A.hp;p.fl=null;p.pend=null;p.bounty=false;p.hostile=false;p.m.g.rotation.set(0,0,0);p.m.g.visible=true;
  if(p.gun)p.gun.visible=false;const q=perim(bl.x0,bl.z0,p.s);p.x=q.x;p.z=q.z;p.y=.3}
function spawnPed(extra){const a=pickArch(),p=newPedObj(archChar(a),false,a);p.extra=!!extra;
  if(a==='thug'){p.gun=makeGun(Math.random()<.3?'smg':'pistol');p.m.hold.add(p.gun)}
  placePed(p,nearBlock(30,drawDist*.55));peds.push(p);return p}
function spawnCop(x,z,unit){unit=unit||'police';if(cops.length>=Q.cops+(unit==='police'?2:5))return null;const U=UNITS[unit];
  const p=newPedObj(U.cfg(),true);p.unit=unit;p.U=U;p.health=U.hp;p.react=rand(...U.react);p.burstN=U.burst;p.side=Math.random()<.5?1:-1;p.sideT=rand(1,3);
  p.x=x;p.z=z;p.y=groundY(x,z);p.state='cop';const gun=makeGun(unit==='police'&&wanted>=3?'smg':U.gun);gun.visible=true;p.m.hold.add(gun);cops.push(p);return p}
function removePed(p){disposePerson(p.m);const a=p.cop?cops:peds,i=a.indexOf(p);if(i>=0)a.splice(i,1)}

function flee(p,fx,fz,t){if(p.state==='dead'||p.cop)return;p.state='flee';p.fleeT=t||rand(6,10);p.tx=fx;p.tz=fz;if(p.gun)p.gun.visible=false}
function react(p,kind,x,z,now){if(p.state==='dead'||p.cop||p.state==='attack'||p.state==='brawl')return;p.pend={kind,x,z};p.reactT=now?0:p.react}
function resolveReact(p){const e=p.pend;p.pend=null;const d=Math.hypot(p.x-player.x,p.z-player.z);
  if(p.A.brave===2&&d<45){p.state='attack';p.seeT=0;if(p.gun)p.gun.visible=true}
  else if(p.A.brave===1&&d<22&&!player.car)p.state='brawl';
  else flee(p,e.x,e.z)}

function alarm(x,z,r){for(const p of peds)if(p.state!=='dead'&&!p.hostile&&Math.hypot(p.x-x,p.z-z)<r)react(p,'danger',x,z)}

function killPed(p,fling,byPlayer){
  if(p.state==='dead')return;
  p.state='dead';p.deadT=p.cop?25:30;p.fl={vx:fling?fling.x:0,vy:fling?fling.y:0,vz:fling?fling.z:0,air:!!(fling&&fling.y>1),t:0,dir:Math.random()<.5?1:-1,pooled:false};
  p.spin=fling&&fling.y>1?rand(-8,8):0;
  sfx.hit();
  if(!byPlayer)return;
  if(p.cop){crime(3);minWanted(2);if(Math.random()<.6)addPickup('ammo',p.x,p.z,true)}
  else{crime(policeNear(70)?2:1.2);if(Math.random()<.55)addPickup('cash',p.x+rand(-.6,.6),p.z+rand(-.6,.6),true,randi(2,16)*5)}
  if(p.bounty&&job.on&&job.kind==='hit'){completeJob()}
  alarm(p.x,p.z,40);
}
function damagePed(p,dmg,dx,dz,byPlayer,head){
  if(p.state==='dead')return;if(p.U&&!head)dmg*=1-p.U.armor;p.health-=dmg;blood(p.x,head?p.y+1.8:p.y+1.25,p.z,dx,dz,head?14:8);
  if(p.health<=0)killPed(p,{x:dx*3,y:1.5,z:dz*3},byPlayer);
  else if(p.cop){p.hostile=true;p.seeT=Math.max(p.seeT,p.react);if(byPlayer)minWanted(2)}
  else if(p.bounty){p.state='attack';if(p.gun)p.gun.visible=true}
  else if(byPlayer){p.pend={kind:'hit',x:player.x,z:player.z};resolveReact(p)}
}

function pedPhysicsDead(p,dt){
  const f=p.fl,g=p.m.g;f.t+=dt;
  if(f.air){f.vy-=20*dt;p.x+=f.vx*dt;p.z+=f.vz*dt;p.y+=f.vy*dt;g.rotation.x+=p.spin*dt;const gy=groundY(p.x,p.z);
    const q={x:p.x,z:p.z};collideCircle(q,.4);if(q.x!==p.x||q.z!==p.z){f.vx*=-.3;f.vz*=-.3;p.x=q.x;p.z=q.z}
    if(p.y<=gy+.2&&f.vy<0){p.y=gy+.2;f.air=false;g.rotation.x=f.dir*PI/2;sfx.thud()}}
  else{const tgt=f.dir*PI/2;g.rotation.x+=(tgt-g.rotation.x)*Math.min(1,dt*9);p.y+=((groundY(p.x,p.z)+.18)-p.y)*Math.min(1,dt*8);p.x+=f.vx*dt*.3;p.z+=f.vz*dt*.3;f.vx*=.9;f.vz*=.9;
    if(!f.pooled&&f.t>.7){f.pooled=true;decal(p.x,p.z,'#5a0a0a',rand(1.1,1.7),true)}}
  g.position.set(p.x,p.y,p.z);
}
function hitByCars(p){
  for(const c of vehicles){const s=Math.hypot(c.vel.x,c.vel.z);if(s<4)continue;const fx=Math.sin(c.a),fz=Math.cos(c.a),off=c.t.L/2-c.t.W/2;
    if(Math.hypot(c.x+fx*off-p.x,c.z+fz*off-p.z)<1.6||Math.hypot(c.x-fx*off-p.x,c.z-fz*off-p.z)<1.6){
      const byP=c===player.car;if(s>8||p.health<30)killPed(p,{x:c.vel.x*.7,y:s*.35+2,z:c.vel.z*.7},byP);else{damagePed(p,s*4,fx,fz,byP);}
      if(byP){sfx.crash(6);if(p.cop)minWanted(2)}return}}
}
function updatePed(p,dt){
  const g=p.m.g;
  if(p.state==='dead'){pedPhysicsDead(p,dt);p.deadT-=dt;if(p.deadT<=0){if(p.extra){removePed(p);return}placePed(p,nearBlock(60,drawDist*.55))}return}
  const dpl=Math.hypot(p.x-player.x,p.z-player.z);
  if(dpl>drawDist*.65&&!p.bounty){if(p.extra){removePed(p);return}placePed(p,nearBlock(60,drawDist*.55));return}
  if(p.pend){p.reactT-=dt;if(p.reactT<=0)resolveReact(p)}
  let dx,dz,sp,mode='walk';
  if(p.state==='walk'){p.s+=p.dir*p.speed*dt;const q=perim(p.bl.x0,p.bl.z0,p.s);p.x=q.x;p.z=q.z;dx=q.dx*p.dir;dz=q.dz*p.dir;sp=p.speed;
    if(player.aimT>0&&dpl<16&&player.weapon!=='fist'&&!p.pend)react(p,'aim',player.x,player.z)}
  else{
    let ax,az;
    if(p.state==='flee'){ax=p.x-p.tx;az=p.z-p.tz}else{ax=player.x-p.x;az=player.z-p.z}
    const l=Math.hypot(ax,az)||1;dx=ax/l;dz=az/l;sp=p.run;
    if(p.state==='attack'){mode='aim1';sp=dpl>14?p.run*.8:0;p.losT-=dt;if(p.losT<=0){p.clear=lineClear(p.x,1.5,p.z,player.x,1.5,player.z);p.losT=.5}
      if(p.clear&&dpl<40)p.seeT+=dt;else p.seeT=0;p.shootCD-=dt;
      if(p.seeT>p.react&&p.shootCD<=0){enemyShoot(p,clamp(.38-dpl*.006,.1,.38),7);p.shootCD=rand(.5,1.1)}
      if(dpl>70){p.state='walk';placePed(p,nearBlock(60,drawDist*.55));return}}
    else if(p.state==='brawl'){if(player.car&&Math.abs(player.car.v)>3){flee(p,player.x,player.z,4)}else{sp=dpl>1.2?p.run:0;p.hitCD-=dt;if(dpl<1.4){mode='punch';if(p.hitCD<=0){hurtPlayer(rand(5,9));sfx.punch();p.hitCD=rand(.7,1.1)}}}}
    else{p.fleeT-=dt;if(p.fleeT<=0){if(dpl>60){placePed(p,nearBlock(60,drawDist*.55));return}p.fleeT=3}}
    const q={x:p.x+dx*sp*dt,z:p.z+dz*sp*dt};if(collideCircle(q,.4)||!walkable(q.x,q.z)){const a=Math.atan2(dx,dz)+rand(-1.5,1.5);if(!walkable(q.x,q.z)){q.x=p.x;q.z=p.z}if(p.state==='flee'){p.tx=p.x-Math.sin(a)*5;p.tz=p.z-Math.cos(a)*5}}
    p.x=q.x;p.z=q.z;
  }
  p.a=Math.atan2(dx,dz);p.ph+=sp*dt*3;animPerson(p.m,p.ph,mode,sp>0?(sp>3?1.2:.7):0);
  p.y=groundY(p.x,p.z);g.position.set(p.x,p.y,p.z);g.rotation.y=p.a;
  hitByCars(p);
}

function updateCop(p,dt){
  const g=p.m.g,U=p.U;
  if(p.state==='dead'){pedPhysicsDead(p,dt);p.deadT-=dt;if(p.deadT<=0)removePed(p);return}
  const dx=player.x-p.x,dz=player.z-p.z,d=Math.hypot(dx,dz);
  let mv=0,side=0,mode='walk',ang=Math.atan2(dx,dz);
  if(wanted===0&&!p.hostile){p.calm=(p.calm||0)+dt;mv=.5;ang=p.a;if(p.calm>14||d>drawDist*.6){removePed(p);return}}
  else{
    p.losT-=dt;if(p.losT<=0){p.clear=lineClear(p.x,1.5,p.z,player.x,1.5,player.z);p.losT=.4}
    if(p.clear&&d<U.range)p.seeT+=dt;else p.seeT=Math.max(0,p.seeT-dt*.5);
    const shoot=wanted>=2||p.hostile||p.unit!=='police';
    if(shoot){mode=U.two?'aim2':'aim1';
      if(d>U.range*.55||!p.clear)mv=1;else if(d<6)mv=-.5;else{p.sideT-=dt;if(p.sideT<=0){p.side=-p.side;p.sideT=rand(1.2,3)}side=p.side*.45}
      p.shootCD-=dt;
      if(p.seeT>p.react&&p.shootCD<=0&&d<U.range){
        const moving=player.car?Math.abs(player.car.v)>8:(K('w','a','s','d')||Math.hypot(inp.x,inp.y)>.2);
        enemyShoot(p,clamp(U.acc-d*.006,.1,U.acc)*(moving?.7:1)*(player.car?.85:1),U.dmg);
        if(--p.burstN>0)p.shootCD=U.gap;else{p.burstN=U.burst;p.shootCD=rand(...U.rate)}}}
    else{mv=d>1.3?1:0;if(d<1.9&&!player.car&&gameT-player.lastShot>1.5)bustT+=dt*1.2}
  }
  p.a=ang;const sp=mv*(mv>0?U.speed:3);
  const q={x:p.x+Math.sin(ang)*sp*dt+Math.cos(ang)*side*U.speed*dt,z:p.z+Math.cos(ang)*sp*dt-Math.sin(ang)*side*U.speed*dt};
  if(collideCircle(q,.4)){q.x+=Math.cos(ang)*U.speed*dt*.8;q.z-=Math.sin(ang)*U.speed*dt*.8}
  if(walkable(q.x,q.z)){p.x=q.x;p.z=q.z}
  const mvAmt=Math.abs(sp)+Math.abs(side)*U.speed;p.ph+=mvAmt*dt*3;animPerson(p.m,p.ph,mode,mvAmt>.1?1:0);
  p.y=groundY(p.x,p.z);g.position.set(p.x,p.y,p.z);g.rotation.y=p.a;
  hitByCars(p);
}

function enemyShoot(p,acc,dmg){
  const sx=p.x+Math.sin(p.a)*.6,sy=p.y+1.5,sz=p.z+Math.cos(p.a)*.6;shootFrom(sx,sy,sz,acc,dmg);
  fxA.spawn(sx,sy,sz,0,0,0,COL.muzzle,1,.7,.05);
}
function shootFrom(sx,sy,sz,acc,dmg){
  const ty=player.car?player.car.y+1:player.y+1.3,hit=Math.random()<acc;
  const ex=player.x+(hit?rand(-.2,.2):rand(-3,3)),ey=ty+(hit?rand(-.2,.2):rand(-1,2)),ez=player.z+(hit?rand(-.2,.2):rand(-3,3));
  tracer(sx,sy,sz,ex,ey,ez);sfx.gun('pistol',Math.hypot(sx-player.x,sz-player.z));
  if(hit){if(player.car){damageCar(player.car,dmg*.9,0,false);hurtPlayer(dmg*.12);sparks(ex,ey,ez,4)}else{hurtPlayer(dmg);blood(player.x,ty,player.z,0,0,5)}}
  else sparks(ex,ey,ez,3);
}

// --- Helicopters: police (4★) and army gunship (5★) ---
function spawnHeli(type){type=type||'police';const g=new THREE.Group(),army=type==='army';
  const bodyM=army?armyPaint:new THREE.MeshStandardMaterial({color:C('#14213d'),metalness:.6,roughness:.35});
  const body=new THREE.Mesh(new THREE.SphereGeometry(1.6,14,10),bodyM);body.scale.set(army?.85:1,.9,army?2.1:1.8);g.add(body);
  bx(.5,.5,6.5,army?armyPaint:lam('#14213d'),0,.3,-4.2,g);bx(.12,1.4,.9,army?armyPaint:lam('#f2f2f2'),0,1,-7,g);
  if(!army)bx(1.4,.15,.4,lam('#f2f2f2'),0,-.2,.2,g);
  else{bx(4.2,.12,.6,armyPaint,0,-.1,0,g);for(const s of[-1,1]){const pod=new THREE.Mesh(new THREE.CylinderGeometry(.28,.28,1.4,8).rotateX(PI/2),lam('#2b2f24'));pod.position.set(s*1.9,-.35,0);g.add(pod)}
    const gun=new THREE.Mesh(new THREE.CylinderGeometry(.08,.08,1.2,6).rotateX(PI/2),lam('#111'));gun.position.set(0,-1.3,2.4);g.add(gun)}
  for(const s of[-1,1])bx(.1,.1,3.4,lam('#222'),s*1,-1.5,0,g);
  const rotor=new THREE.Group();rotor.position.y=1.6;bx(11,.06,.3,lam('#222'),0,0,0,rotor);bx(.3,.06,11,lam('#222'),0,0,0,rotor);g.add(rotor);
  const beam=new THREE.Mesh(new THREE.ConeGeometry(5,40,16,1,true),new THREE.MeshBasicMaterial({color:C('#fff6d8'),transparent:true,opacity:0,blending:THREE.AdditiveBlending,depthWrite:false,side:THREE.DoubleSide}));
  beam.geometry.translate(0,-20,0);beam.visible=!army;g.add(beam);
  const a=rand(0,TAU);const h={type,g,rotor,beam,x:player.x+Math.cos(a)*190,z:player.z+Math.sin(a)*190,y:75,vx:0,vz:0,ang:a,health:army?520:300,dead:false,vy:0,shootCD:2,rocketCD:rand(3,5),burst:0,yaw:0};
  helis.push(h);scene.add(g);return h}
function damageHeli(h,d,byPlayer){if(!h||h.dead)return;h.health-=d;sparks(h.x,h.y,h.z,6);if(h.health<=0){h.dead=true;if(byPlayer){crime(5);toast(h.type==='army'?'Gunship down!':'Chopper down!','cash',2)}}}
function updateHeli(h,dt){
  h.rotor.rotation.y+=dt*28;const army=h.type==='army';
  if(h.dead){h.vy-=14*dt;h.y+=h.vy*dt;h.g.rotation.y+=dt*4;fxN.spawn(h.x,h.y,h.z,0,2,0,COL.smoke,.7,3,2,1.5);
    if(h.y<=groundY(h.x,h.z)+1){explode(h.x,h.y,h.z,10,true);scene.remove(h.g);helis.splice(helis.indexOf(h),1)}return}
  const leave=wanted<(army?5:4);h.ang+=dt*(army?.22:.3);
  const R0=army?45:30,tx=leave?h.x+h.vx*3:player.x+Math.cos(h.ang)*R0,tz=leave?h.z+h.vz*3:player.z+Math.sin(h.ang)*R0,ty=groundY(player.x,player.z)+(leave?85:army?42:34);
  const ax=tx-h.x,az=tz-h.z,l=Math.hypot(ax,az)||1,spd=Math.min(army?38:32,l*.8);
  h.vx+=(ax/l*spd-h.vx)*Math.min(1,dt*1.2);h.vz+=(az/l*spd-h.vz)*Math.min(1,dt*1.2);if(leave){h.vx*=1.01;h.vz*=1.01}
  h.x+=h.vx*dt;h.z+=h.vz*dt;h.y+=(ty-h.y)*Math.min(1,dt*.8);
  h.yaw=Math.atan2(player.x-h.x,player.z-h.z);h.g.rotation.set(-h.vz*.006*Math.cos(h.yaw),h.yaw,h.vx*.006);
  if(leave&&Math.hypot(h.x-player.x,h.z-player.z)>300){scene.remove(h.g);helis.splice(helis.indexOf(h),1);return}
  const dd=Math.hypot(h.x-player.x,h.z-player.z);
  if(!leave&&dd<(army?110:75)&&lineClear(h.x,h.y-1,h.z,player.x,player.y+1.2,player.z)){
    h.shootCD-=dt;if(h.shootCD<=0){shootFrom(h.x,h.y-1.3,h.z,army?.3:.22,army?10:7);if(army){if(++h.burst<8)h.shootCD=.07;else{h.burst=0;h.shootCD=rand(1,1.8)}}else h.shootCD=rand(.3,.6)}
    if(army){h.rocketCD-=dt;if(h.rocketCD<=0){h.rocketCD=rand(3.5,6);const ex=player.x+rand(-4,4)-h.x,ey=player.y-(h.y-1.5),ez=player.z+rand(-4,4)-h.z,el=Math.hypot(ex,ey,ez);fireRocket(h.x,h.y-1.5,h.z,ex/el,ey/el,ez/el,true);sfx.gun('rpg',dd)}}}
  const bm=h.beam;if(bm.visible){bm.material.opacity=night*.12;bm.lookAt(player.x,groundY(player.x,player.z),player.z);bm.rotateX(-PI/2)}
  h.g.position.set(h.x,h.y,h.z);
}
// --- Police cars ---
function policeNear(r){for(const h of helis)if(!h.dead&&Math.hypot(h.x-player.x,h.z-player.z)<r*1.6)return true;
  for(const c of vehicles)if(c.kind==='police'&&c.driver&&Math.hypot(c.x-player.x,c.z-player.z)<r)return true;
  for(const p of cops)if(p.state!=='dead'&&Math.hypot(p.x-player.x,p.z-player.z)<r)return true;return false}

function updatePolice(c,dt){
  const pv=player.car?player.car.vel:{x:0,z:0},tx=player.x+pv.x*.6,tz=player.z+pv.z*.6,dx=tx-c.x,dz=tz-c.z,dist=Math.hypot(dx,dz);
  let thr=0,steer=0,hb=false;
  if(wanted>0){
    const diff=wrapA(Math.atan2(dx,dz)-c.a);steer=clamp(-diff*2.5,-1,1);thr=1;
    const pslow=!player.car||Math.abs(player.car.v)<5;
    if(dist<22&&pslow&&!c.deployed){thr=c.v>1?-1:0;if(Math.abs(c.v)<1.5){c.deployed=true;c.driver=false;c.ctrl='none';c.lights=true;const r=[-Math.cos(c.a),Math.sin(c.a)],u=c.unit||'police',n=u==='police'?(wanted>=2?2:1):u==='swat'?4:3;for(let k=0;k<n;k++){const sd=k%2?1:-1,back=Math.floor(k/2)*2.2;spawnCop(c.x+r[0]*2.4*sd-Math.sin(c.a)*back,c.z+r[1]*2.4*sd-Math.cos(c.a)*back,u)}return}}
    else if(dist<12)thr=Math.abs(diff)>1.2?.35:.6;
    if(c.rev>0){c.rev-=dt;thr=-1;steer=-steer}else if(Math.abs(c.v)<1.5&&dist>12){c.stuck+=dt;if(c.stuck>1.1){c.rev=1.1;c.stuck=0}}else c.stuck=0;
  }
  drive(c,thr,steer,hb,dt,(wanted>=4||c.unit!=='police')&&dist>40);
}

// --- Rockets ---
function fireRocket(x,y,z,dx,dy,dz,enemy){rockets.push({x,y,z,vx:dx*55,vy:dy*55,vz:dz*55,t:0,enemy:!!enemy})}

function updRockets(dt){for(let i=rockets.length-1;i>=0;i--){const r=rockets[i];r.t+=dt;r.x+=r.vx*dt;r.y+=r.vy*dt;r.z+=r.vz*dt;
  fxN.spawn(r.x,r.y,r.z,rand(-.5,.5),rand(0,1),rand(-.5,.5),COL.smokeL,.6,.7,1.2,2);fxA.spawn(r.x,r.y,r.z,0,0,0,COL.fire2,1,.6,.06);
  let boom=r.t>3||r.y<=groundY(r.x,r.z)||solidAt(r.x,r.y,r.z)||(!r.enemy&&helis.some(h=>!h.dead&&Math.hypot(h.x-r.x,h.y-r.y,h.z-r.z)<3.5))||(r.enemy&&Math.hypot(player.x-r.x,player.z-r.z)<1.5&&r.y<player.y+2.5);
  if(!boom)for(const c of vehicles)if(Math.hypot(c.x-r.x,c.z-r.z)<2&&r.y<2.5){boom=true;break}
  if(!boom)for(const p of peds.concat(cops))if(p.state!=='dead'&&Math.hypot(p.x-r.x,p.z-r.z)<1&&r.y<p.y+2){boom=true;break}
  if(boom){explode(r.x,Math.max(r.y,groundY(r.x,r.z)),r.z,r.enemy?6.5:8,!r.enemy);rockets.splice(i,1)}}}

// --- Pickups ---
const pkGeo={cash:new THREE.BoxGeometry(.9,.5,.2),health:new THREE.BoxGeometry(.7,.7,.7),armor:new THREE.BoxGeometry(.8,.9,.25),ammo:new THREE.BoxGeometry(.7,.45,.45)};
const pkMat={cash:new THREE.MeshLambertMaterial({color:C('#3fa85a'),emissive:C('#3fa85a'),emissiveIntensity:.5}),health:new THREE.MeshLambertMaterial({map:tex(cnv(32,32,g=>{g.fillStyle='#fff';g.fillRect(0,0,32,32);g.fillStyle='#d22';g.fillRect(12,4,8,24);g.fillRect(4,12,24,8)})),emissive:C('#ffffff'),emissiveIntensity:.3}),armor:new THREE.MeshLambertMaterial({color:C('#3c7bd8'),emissive:C('#3c7bd8'),emissiveIntensity:.5}),ammo:new THREE.MeshLambertMaterial({color:C('#c9a43a'),emissive:C('#c9a43a'),emissiveIntensity:.4})};
function addPickup(kind,x,z,temp,amount){const m=new THREE.Mesh(pkGeo[kind],pkMat[kind]);scene.add(m);const p={kind,m,x,z,temp,t:rand(0,6),life:temp?40:0,amount:amount||0,home:temp?null:{x,z},cd:0};pickups.push(p);return p}
{seed=777;for(let k=0;k<26;k++){const b=Rp(blockList),q=perim(b.x0,b.z0,Rr(0,208));addPickup(k<16?'cash':k<22?'health':'armor',q.x,q.z,false,randi(5,25)*10)}}


// ===================== Particles, glows, tracers, decals =====================
const PVERT='attribute float size;attribute vec4 col;varying vec4 vC;uniform float scale;void main(){vC=col;vec4 mv=modelViewMatrix*vec4(position,1.);gl_PointSize=size*scale/max(-mv.z,.5);gl_Position=projectionMatrix*mv;}';
const PFRAG=`varying vec4 vC;uniform float alpha;void main(){float d=length(gl_PointCoord-.5)*2.;float a=(1.-smoothstep(.15,1.,d))*vC.a*alpha;if(a<.004)discard;gl_FragColor=vec4(vC.rgb,a);
#include <encodings_fragment>
}`;
const pMats=[];
function pMat(add){const m=new THREE.ShaderMaterial({uniforms:{scale:{value:500},alpha:{value:1}},vertexShader:PVERT,fragmentShader:PFRAG,transparent:true,depthWrite:false,blending:add?THREE.AdditiveBlending:THREE.NormalBlending});pMats.push(m);return m}
class PSys{
  constructor(max,add){this.max=max;this.h=0;const f=n=>new Float32Array(n);
    this.p=f(max*3);this.c=f(max*4);this.s=f(max);this.v=f(max*3);this.life=f(max);this.ml=f(max);this.gr=f(max);this.g=f(max);this.a0=f(max);this.s0=f(max);this.dr=f(max);
    const geo=new THREE.BufferGeometry();this.pa=new THREE.BufferAttribute(this.p,3);this.ca=new THREE.BufferAttribute(this.c,4);this.sa=new THREE.BufferAttribute(this.s,1);
    for(const a of[this.pa,this.ca,this.sa])a.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position',this.pa);geo.setAttribute('col',this.ca);geo.setAttribute('size',this.sa);
    this.pts=new THREE.Points(geo,pMat(add));this.pts.frustumCulled=false;this.pts.renderOrder=add?6:5;scene.add(this.pts)}
  spawn(x,y,z,vx,vy,vz,col,a,size,life,grow=0,grav=0,drag=0){const i=this.h;this.h=(i+1)%this.max;
    this.p[i*3]=x;this.p[i*3+1]=y;this.p[i*3+2]=z;this.v[i*3]=vx;this.v[i*3+1]=vy;this.v[i*3+2]=vz;
    this.c[i*4]=col.r;this.c[i*4+1]=col.g;this.c[i*4+2]=col.b;this.c[i*4+3]=a;this.a0[i]=a;this.s0[i]=size;this.s[i]=size;
    this.life[i]=life;this.ml[i]=life;this.gr[i]=grow;this.g[i]=grav;this.dr[i]=drag}
  update(dt){for(let i=0;i<this.max;i++){if(this.life[i]<=0){this.s[i]=0;continue}
    const l=this.life[i]-=dt;if(l<=0){this.s[i]=0;continue}const k=l/this.ml[i],d=1-this.dr[i]*dt;
    this.v[i*3]*=d;this.v[i*3+1]=this.v[i*3+1]*d+this.g[i]*dt;this.v[i*3+2]*=d;
    this.p[i*3]+=this.v[i*3]*dt;this.p[i*3+1]+=this.v[i*3+1]*dt;this.p[i*3+2]+=this.v[i*3+2]*dt;
    this.s[i]=this.s0[i]*(1+this.gr[i]*(1-k));this.c[i*4+3]=this.a0[i]*Math.min(1,k*1.4)}
    this.pa.needsUpdate=this.ca.needsUpdate=this.sa.needsUpdate=true}
}
class Glow{
  constructor(max){this.max=max;this.n=0;this.p=new Float32Array(max*3);this.c=new Float32Array(max*4);this.s=new Float32Array(max);
    const geo=new THREE.BufferGeometry();this.geo=geo;this.pa=new THREE.BufferAttribute(this.p,3);this.ca=new THREE.BufferAttribute(this.c,4);this.sa=new THREE.BufferAttribute(this.s,1);
    geo.setAttribute('position',this.pa);geo.setAttribute('col',this.ca);geo.setAttribute('size',this.sa);
    this.pts=new THREE.Points(geo,pMat(true));this.pts.frustumCulled=false;this.pts.renderOrder=7;scene.add(this.pts)}
  begin(){this.n=0}
  add(x,y,z,col,a,size){if(this.n>=this.max)return;const i=this.n++;this.p[i*3]=x;this.p[i*3+1]=y;this.p[i*3+2]=z;this.c[i*4]=col.r;this.c[i*4+1]=col.g;this.c[i*4+2]=col.b;this.c[i*4+3]=a;this.s[i]=size}
  end(){this.geo.setDrawRange(0,this.n);this.pa.needsUpdate=this.ca.needsUpdate=this.sa.needsUpdate=true}
}
const fxN=new PSys(700,false),fxA=new PSys(700,true),glow=new Glow(400);
const lampGlow=new Glow(lampPos.length+beacons.length);
{const wc=C('#ffcf8a');for(const[x,y,z]of lampPos)lampGlow.add(x,y,z,wc,.9,4.2);const rc=C('#ff3020');for(const[x,y,z]of beacons)lampGlow.add(x,y,z,rc,1,5);lampGlow.end()}
const COL={fire:C('#ff8a2a'),fire2:C('#ffd25a'),smoke:C('#4a4743'),smokeL:C('#9a958e'),spark:C('#ffd27a'),blood:C('#7a0d0d'),dust:C('#b9ae98'),white:C('#ffffff'),head:C('#fff2cf'),tail:C('#ff2a1a'),red:C('#ff2020'),blue:C('#2f6dff'),nos:C('#5fd8ff'),tire:C('#cfcac2'),muzzle:C('#ffc46a')};
function sparks(x,y,z,n=6){for(let k=0;k<n;k++)fxA.spawn(x,y,z,rand(-5,5),rand(1,6),rand(-5,5),COL.spark,1,.18,rand(.15,.35),0,-14,1)}
function blood(x,y,z,dx,dz,n=10){for(let k=0;k<n;k++)fxN.spawn(x,y,z,dx*rand(1,4)+rand(-1.5,1.5),rand(.5,3),dz*rand(1,4)+rand(-1.5,1.5),COL.blood,.95,rand(.18,.35),rand(.4,.8),.5,-12,1)}
// tracers
const TRN=64,trPos=new Float32Array(TRN*6),trCol=new Float32Array(TRN*6),trLife=new Float32Array(TRN);let trH=0;
const trGeo=new THREE.BufferGeometry();trGeo.setAttribute('position',new THREE.BufferAttribute(trPos,3));trGeo.setAttribute('color',new THREE.BufferAttribute(trCol,3));
const tracers=new THREE.LineSegments(trGeo,new THREE.LineBasicMaterial({vertexColors:true,transparent:true,blending:THREE.AdditiveBlending,depthWrite:false}));tracers.frustumCulled=false;scene.add(tracers);
function tracer(x0,y0,z0,x1,y1,z1){const i=trH;trH=(trH+1)%TRN;trPos.set([x0,y0,z0,x1,y1,z1],i*6);trLife[i]=.07}
function updTracers(dt){for(let i=0;i<TRN;i++){trLife[i]=Math.max(0,trLife[i]-dt);const k=trLife[i]/.07;trCol[i*6]=k;trCol[i*6+1]=k*.8;trCol[i*6+2]=k*.45;trCol[i*6+3]=k*.6;trCol[i*6+4]=k*.45;trCol[i*6+5]=k*.25}
  trGeo.attributes.position.needsUpdate=trGeo.attributes.color.needsUpdate=true}
// decals
const decals=[];const decalGeo=new THREE.CircleGeometry(1,14).rotateX(-PI/2);
function decal(x,z,col,size,grow){let d;if(decals.length<36){d={m:new THREE.Mesh(decalGeo,new THREE.MeshBasicMaterial({color:C(col),transparent:true,opacity:.85,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2}))};scene.add(d.m);decals.push(d)}else{d=decals.shift();decals.push(d);d.m.material.color.copy(C(col))}
  d.m.position.set(x,groundY(x,z)+.03,z);d.t=0;d.size=size;d.grow=grow;d.m.scale.setScalar(grow?.1:size);d.m.material.opacity=.85}
function updDecals(dt){for(const d of decals){d.t+=dt;if(d.grow)d.m.scale.setScalar(Math.min(d.size,.1+d.t*.5));if(d.t>40)d.m.material.opacity=Math.max(0,.85-(d.t-40)*.1)}}

// ===================== People =====================
const SKIN=['#f3d2b8','#e6b48f','#c98f66','#a56b45','#7b4a2f','#5a3624'];
const HAIRC=['#1b1512','#3b2a20','#6b4a2e','#a77b48','#d9b56d','#e9e2d0','#b23a2a','#3a5bd1','#d94fa0','#2fa86b'];
const CLOTH=['#f2f2f2','#1d1f24','#c0392b','#e67e22','#f1c40f','#27ae60','#16a085','#2980b9','#8e44ad','#ff7aa8','#7f8c8d','#6b4f3a','#2c3e50','#d4c4a1','#9b2335','#4a6741'];
const OPTS={frame:['Masculine','Feminine'],skin:SKIN,build:['Slim','Regular','Muscular'],hair:['Bald','Buzz','Short','Long','Mohawk','Afro','Ponytail'],hairColor:HAIRC,hat:['None','Cap','Beanie','Bucket hat'],hatColor:CLOTH,glasses:['None','Shades','Aviators'],top:['Tee','Tank','Hoodie','Jacket','Suit','Polo'],topColor:CLOTH,legs:['Jeans','Shorts','Cargo','Slacks'],legsColor:CLOTH,shoesColor:CLOTH,chain:['None','Gold chain','Silver chain']};
const DEF_CHAR={frame:0,skin:2,build:1,hair:2,hairColor:0,hat:0,hatColor:1,glasses:1,top:0,topColor:0,legs:0,legsColor:12,shoesColor:1,chain:0};
const blobMat=new THREE.MeshBasicMaterial({color:0,transparent:true,opacity:.28,depthWrite:false});
const blobGeo=new THREE.CircleGeometry(.55,14).rotateX(-PI/2);
function bx(w,h,d,m,x,y,z,parent){const o=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),m);o.position.set(x,y,z);o.userData.own=true;parent.add(o);return o}
function makeGun(id){
  const g=new THREE.Group(),m=lam('#1d1f22'),m2=lam('#3a3c40');
  if(id==='pistol'){bx(.05,.2,.09,m,0,-.06,.02,g);bx(.05,.08,.1,m2,0,.02,-.02,g)}
  else if(id==='smg'){bx(.06,.38,.1,m,0,-.1,.02,g);bx(.04,.07,.16,m2,0,0,-.08,g)}
  else if(id==='shotgun'){bx(.05,.85,.07,m,0,-.28,.03,g);bx(.06,.28,.1,lam('#6b4a2e'),0,.13,0,g)}
  else if(id==='rifle'){bx(.06,.78,.09,m,0,-.23,.02,g);bx(.045,.07,.18,m2,0,-.05,-.1,g);bx(.05,.22,.1,m,0,.22,0,g)}
  else if(id==='rpg'){const c=new THREE.Mesh(new THREE.CylinderGeometry(.08,.08,1.15,10),lam('#4a5a3a'));c.userData.own=true;c.position.y=-.2;g.add(c);bx(.1,.18,.18,m,0,-.8,0,g)}
  g.visible=false;return g;
}
// Smooth, proportioned figures. Each body part is one merged, vertex-coloured mesh.
const HG={sph:new THREE.SphereGeometry(1,12,9),head:new THREE.SphereGeometry(1,20,16),cap:new THREE.SphereGeometry(1,16,8,0,TAU,0,PI*.55),
  cyl:new THREE.CylinderGeometry(1,1,1,12),limb:new THREE.CylinderGeometry(1,.82,1,12),cone:new THREE.ConeGeometry(1,1,8),box:new THREE.BoxGeometry(1,1,1),torus:new THREE.TorusGeometry(1,.3,6,16),
  torso:[[[0,0],[.15,0],[.165,.05],[.155,.14],[.15,.22],[.165,.32],[.185,.42],[.19,.5],[.17,.56],[.11,.61],[0,.63]],[[0,0],[.17,0],[.18,.06],[.15,.16],[.133,.24],[.152,.34],[.165,.42],[.16,.5],[.14,.56],[.095,.61],[0,.63]]].map(pts=>new THREE.LatheGeometry(pts.map(([x,y])=>new THREE.Vector2(x,y)),16))};
const personMat=new THREE.MeshLambertMaterial({vertexColors:true}),heroMat=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.7,metalness:0});
const _m=new THREE.Matrix4(),_q=new THREE.Quaternion(),_e=new THREE.Euler(),_v=new THREE.Vector3(),_s=new THREE.Vector3();
function mergePart(items){
  const pos=[],nor=[],col=[];
  for(const[g0,hex,p,s,r]of items){const g=g0.index?g0.toNonIndexed():g0.clone();
    _m.compose(_v.set(p[0],p[1],p[2]),_q.setFromEuler(_e.set(...(r||[0,0,0]))),_s.set(...(s||[1,1,1])));g.applyMatrix4(_m);
    const c=C(hex),a=g.attributes.position,n=g.attributes.normal;
    for(let i=0;i<a.count;i++){pos.push(a.getX(i),a.getY(i),a.getZ(i));nor.push(n.getX(i),n.getY(i),n.getZ(i));col.push(c.r,c.g,c.b)}g.dispose()}
  const o=new THREE.BufferGeometry();o.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));o.setAttribute('normal',new THREE.Float32BufferAttribute(nor,3));o.setAttribute('color',new THREE.Float32BufferAttribute(col,3));o.computeBoundingSphere();return o;
}
function makePerson(cfg,hi){
  cfg=Object.assign({},DEF_CHAR,cfg);
  const mat=hi?heroMat:personMat,g=new THREE.Group();
  const skin=SKIN[cfg.skin],top=CLOTH[cfg.topColor],legs=CLOTH[cfg.legsColor],shoe=CLOTH[cfg.shoesColor],hair=HAIRC[cfg.hairColor],hat=CLOTH[cfg.hatColor];
  const fem=cfg.frame===1,bw=[.9,1,1.13][cfg.build],hipW=fem?1.12:1,shW=fem?.9:1,ts=OPTS.top[cfg.top],ls=OPTS.legs[cfg.legs],hs=OPTS.hair[cfg.hair],ht=OPTS.hat[cfg.hat],gl=OPTS.glasses[cfg.glasses];
  const mesh=(items,parent)=>{const m=new THREE.Mesh(mergePart(items),mat);m.userData.own=true;if(hi)m.castShadow=true;parent.add(m);return m};
  const H=HG,cz=.66*bw;
  // core: pelvis, torso, neck, head, face, hair, hat, accessories
  const core=[[H.sph,legs,[0,.95,0],[.17*hipW*bw,.11,.12*bw]],[H.torso[fem?1:0],top,[0,.9,0],[1.12*bw*shW,1,cz]],[H.cyl,skin,[0,1.575,0],[.052,.12,.052]],
    [H.head,skin,[0,1.74,0],[.108,.132,.12]],[H.sph,skin,[0,1.665,.025],[.085,.06,.085]],[H.cone,skin,[0,1.722,.118],[.02,.05,.02],[PI/2,0,0]],
    [H.sph,skin,[-.108,1.74,0],[.016,.034,.028]],[H.sph,skin,[.108,1.74,0],[.016,.034,.028]],
    [H.sph,'#f4f1ec',[-.041,1.756,.1],[.021,.015,.012]],[H.sph,'#f4f1ec',[.041,1.756,.1],[.021,.015,.012]],
    [H.sph,'#24170f',[-.041,1.756,.11],[.0105,.0105,.006]],[H.sph,'#24170f',[.041,1.756,.11],[.0105,.0105,.006]],
    [H.box,hs==='Bald'?skin:hair,[-.042,1.787,.108],[.045,.008,.01],[0,0,.08]],[H.box,hs==='Bald'?skin:hair,[.042,1.787,.108],[.045,.008,.01],[0,0,-.08]],
    [H.box,fem?'#b5534c':'#8a4a40',[0,1.676,.11],[.04,.007,.006]],
    [H.cyl,'#222',[0,.99,0],[.19*hipW*bw,.04,.125*bw]]];
  if(hs==='Buzz')core.push([H.cap,hair,[0,1.745,-.004],[.112,.136,.124],[-.6,0,0]]);
  if(hs==='Short'||hs==='Long'||hs==='Ponytail')core.push([H.cap,hair,[0,1.75,-.006],[.116,.146,.128],[-.6,0,0]],[H.sph,hair,[0,1.72,-.045],[.11,.105,.095]]);
  if(hs==='Long')core.push([H.sph,hair,[0,1.6,-.07],[.118,.18,.06]]);
  if(hs==='Ponytail')core.push([H.sph,hair,[0,1.65,-.15],[.04,.11,.04]]);
  if(hs==='Mohawk')core.push([H.box,hair,[0,1.86,-.01],[.03,.06,.24]]);
  if(hs==='Afro')core.push([H.sph,hair,[0,1.8,-.02],[.165,.15,.17]]);
  if(ht==='Cap')core.push([H.cap,hat,[0,1.765,0],[.122,.12,.13],[-.3,0,0]],[H.cyl,hat,[0,1.79,.12],[.1,.012,.09]]);
  if(ht==='Beanie')core.push([H.cap,hat,[0,1.76,0],[.125,.17,.132],[-.4,0,0]]);
  if(ht==='Bucket hat')core.push([H.limb,hat,[0,1.85,0],[.1,.09,.1]],[H.cyl,hat,[0,1.8,0],[.165,.012,.165]]);
  if(gl==='Shades')core.push([H.box,'#0d0d0d',[0,1.757,.116],[.15,.034,.01]]);
  if(gl==='Aviators')core.push([H.sph,'#3a2a14',[-.042,1.755,.116],[.032,.024,.008]],[H.sph,'#3a2a14',[.042,1.755,.116],[.032,.024,.008]],[H.box,'#a8862f',[0,1.77,.118],[.1,.006,.006]]);
  if(cfg.chain)core.push([H.torus,cfg.chain===1?'#e1b84a':'#cfd3d6',[0,1.47,.06],[.085,.085,.03],[1.15,0,0]]);
  if(fem)core.push([H.sph,top,[-.066,1.33,.08*bw],[.068,.064,.058]],[H.sph,top,[.066,1.33,.08*bw],[.068,.064,.058]]);
  if(ts==='Jacket'||ts==='Suit')core.push([H.box,ts==='Suit'?'#f2f2f2':'#2b2b2b',[0,1.3,.118*bw],[.085,.36,.01]]);
  if(ts==='Suit')core.push([H.box,'#9b2335',[0,1.33,.125*bw],[.034,.26,.008]]);
  if(ts==='Hoodie')core.push([H.torus,top,[0,1.56,-.06],[.11,.11,.08],[PI/2-.3,0,0]]);
  if(ts==='Polo')core.push([H.torus,top,[0,1.535,0],[.07,.07,.055],[PI/2,0,0]]);
  mesh(core,g);
  // arms: shoulder pivot + elbow pivot
  const sleeveUp=ts==='Tank'?skin:top,sleeveLo=['Hoodie','Jacket','Suit'].includes(ts)?top:skin,ab=bw*(fem?.88:1);
  const mkArm=sx=>{const A=new THREE.Group();A.position.set(sx*.205*bw*shW,1.47,0);
    mesh([[H.sph,sleeveUp,[0,0,0],[.06*ab,.06,.06*ab]],[H.limb,sleeveUp,[0,-.15,0],[.05*ab,.3,.05*ab]]],A);
    const E=new THREE.Group();E.position.y=-.3;A.add(E);
    mesh([[H.sph,sleeveLo,[0,0,0],[.045*ab,.045,.045*ab]],[H.limb,sleeveLo,[0,-.13,0],[.043*ab,.26,.043*ab]],[H.sph,skin,[0,-.3,.005],[.036,.055,.024]]],E);
    g.add(A);return[A,E]};
  const[armL,elbowL]=mkArm(-1),[armR,elbowR]=mkArm(1);
  // legs: hip pivot + knee pivot
  const mkLeg=sx=>{const L=new THREE.Group();L.position.set(sx*.09*hipW*bw,.92,0);
    const thigh=[[H.limb,legs,[0,-.21,0],[.08*hipW*bw,.42,.082*bw]]];if(ls==='Cargo')thigh.push([H.box,legs,[sx*.085*bw,-.24,0],[.03,.09,.07]]);mesh(thigh,L);
    const Kn=new THREE.Group();Kn.position.y=-.42;L.add(Kn);
    mesh([[H.sph,ls==='Shorts'?skin:legs,[0,0,0],[.06*bw,.05,.062*bw]],[H.limb,ls==='Shorts'?skin:legs,[0,-.2,0],[.056*bw,.4,.058*bw]],[H.sph,shoe,[0,-.44,.045],[.055,.042,.12]],[H.box,'#e9e6df',[0,-.475,.045],[.1,.014,.22]]],Kn);
    g.add(L);return[L,Kn]};
  const[legL,kneeL]=mkLeg(-1),[legR,kneeR]=mkLeg(1);
  const hold=new THREE.Group();hold.position.set(0,-.3,.03);elbowR.add(hold);
  const blob=new THREE.Mesh(blobGeo,blobMat);blob.position.y=.03;g.add(blob);
  scene.add(g);
  return{g,legL,legR,kneeL,kneeR,armL,armR,elbowL,elbowR,hold,guns:{}};
}
function disposePerson(m){scene.remove(m.g);m.g.traverse(o=>{if(o.isMesh&&o.userData.own)o.geometry.dispose()})}
function animPerson(p,ph,mode,amt){
  const s=Math.sin(ph)*.7*amt;
  p.legL.rotation.set(s,0,0);p.legR.rotation.set(-s,0,0);
  p.kneeL.rotation.x=Math.max(0,s)*1.3+.08*amt;p.kneeR.rotation.x=Math.max(0,-s)*1.3+.08*amt;
  p.armL.rotation.set(-s*.8,0,-.07);p.armR.rotation.set(s*.8,0,.07);
  p.elbowL.rotation.set(-.2-Math.max(0,s)*.5*amt,0,0);p.elbowR.rotation.set(-.2-Math.max(0,-s)*.5*amt,0,0);
  if(mode==='aim1'){p.armR.rotation.set(-PI/2,0,0);p.elbowR.rotation.set(0,0,0)}
  else if(mode==='aim2'){p.armR.rotation.set(-PI/2,0,0);p.elbowR.rotation.set(0,0,0);p.armL.rotation.set(-PI/2+.15,0,.55);p.elbowL.rotation.set(-.25,0,0)}
  else if(mode==='rpg'){p.armR.rotation.set(-PI/2+.25,0,.25);p.armL.rotation.set(-PI/2+.2,0,.45);p.elbowR.rotation.set(-.4,0,0);p.elbowL.rotation.set(-.4,0,0)}
  else if(mode==='punch'){p.armR.rotation.set(-PI/2,0,0);p.elbowR.rotation.set(0,0,0)}
  else if(mode==='jump'){p.legL.rotation.x=-.5;p.legR.rotation.x=.2;p.kneeL.rotation.x=.9;p.kneeR.rotation.x=.4;p.armL.rotation.set(-.3,0,-.6);p.armR.rotation.set(-.3,0,.6)}
}
const randChar=()=>({frame:randi(0,1),skin:randi(0,5),build:randi(0,2),hair:randi(0,6),hairColor:randi(0,5),hat:Math.random()<.7?0:randi(1,3),hatColor:randi(0,15),glasses:Math.random()<.7?0:randi(1,2),top:randi(0,5),topColor:randi(0,15),legs:randi(0,3),legsColor:randi(0,15),shoesColor:randi(0,15),chain:Math.random()<.85?0:randi(1,2)});
const copChar=()=>({frame:Math.random()<.25?1:0,skin:randi(0,5),build:randi(1,2),hair:1,hairColor:randi(0,3),hat:1,hatColor:12,glasses:Math.random()<.5?1:2,top:5,topColor:12,legs:3,legsColor:12,shoesColor:1,chain:0});

// ===================== Vehicles =====================
const CT={
  sedan:{name:'Sedan',L:4.5,W:1.86,r:.36,max:40,acc:16,grip:7.5,hp:100,pts:[[-2.25,.38],[2.25,.38],[2.3,.68],[2.15,.92],[1.0,1.0],[.15,1.46],[-.95,1.46],[-1.65,1.02],[-2.2,.96],[-2.3,.66]]},
  sports:{name:'Sports',L:4.4,W:1.92,r:.36,max:54,acc:23,grip:8.6,hp:90,pts:[[-2.2,.3],[2.2,.3],[2.3,.52],[2.05,.7],[.75,.84],[-.1,1.18],[-.85,1.18],[-1.75,.9],[-2.2,.88],[-2.3,.58]]},
  muscle:{name:'Muscle',L:4.8,W:1.9,r:.38,max:48,acc:20,grip:7,hp:110,pts:[[-2.4,.36],[2.4,.36],[2.45,.66],[2.3,.86],[.6,.96],[-.15,1.36],[-1.05,1.36],[-1.8,.98],[-2.35,.94],[-2.45,.64]]},
  suv:{name:'SUV',L:4.8,W:1.98,r:.44,max:37,acc:14,grip:6.6,hp:130,pts:[[-2.4,.5],[2.4,.5],[2.46,.9],[2.32,1.16],[1.25,1.24],[.72,1.86],[-2.1,1.86],[-2.36,1.42],[-2.44,1.22],[-2.46,.9]]},
  van:{name:'Van',L:5.4,W:2.04,r:.42,max:32,acc:11,grip:6,hp:140,pts:[[-2.7,.48],[2.7,.48],[2.76,.9],[2.62,1.3],[2.12,1.46],[1.55,2.3],[-2.6,2.3],[-2.72,2.0],[-2.76,1.42],[-2.76,.9]]},
};
const CIV_TYPES=['sedan','sedan','sedan','suv','suv','sports','muscle','van'];
const PAINT=['#c0392b','#e8452c','#e67e22','#f1c40f','#27ae60','#16a085','#2980b9','#1f3a93','#8e44ad','#d94fa0','#ecf0f1','#bdc3c7','#7f8c8d','#2c3e50','#111214','#6b4f3a','#b8a07a','#4e6e3a','#00b3b3','#ff6f91'];
const FINISH={Gloss:{m:.3,r:.22,p:0},Metallic:{m:.85,r:.3,p:250},Matte:{m:0,r:.85,p:300},Pearl:{m:.55,r:.12,p:400},Chrome:{m:1,r:.04,p:1200}};
const RIMS={Stock:0,Sport:400,'Deep dish':600,Chrome:900};
const SPOILERS={None:0,Lip:300,Wing:700,'GT wing':1500};
const NEON={Off:null,Red:'#ff2a3a',Blue:'#2f7dff',Green:'#2fff7a',Purple:'#b04dff',Pink:'#ff4fc8',Cyan:'#3ff0ff',White:'#ffffff'};
const TINTS=['Stock','Light','Limo'];
const DEF_SPEC={color:'#e8452c',finish:'Gloss',rim:'Stock',rimColor:'#c9ccd0',spoiler:'None',neon:'Off',tint:0,low:false,engine:0,armor:0,nitro:false};
const glassMats=[['#22303d',.06,.9],['#4f6b82',.08,.6],['#07090c',.04,.9]].map(([c,r,m])=>new THREE.MeshStandardMaterial({color:C(c),roughness:r,metalness:m,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2}));
const tireMat=lam('#141414'),rimSilver=new THREE.MeshStandardMaterial({color:C('#c9ccd0'),metalness:.9,roughness:.25});
const lightMat=new THREE.MeshStandardMaterial({color:C('#fff6d8'),emissive:C('#fff2c0'),emissiveIntensity:.3,roughness:.1});
const tailMat=new THREE.MeshStandardMaterial({color:C('#8a1a14'),emissive:C('#ff2a1a'),emissiveIntensity:.4,roughness:.2});
const burntMat=new THREE.MeshStandardMaterial({color:C('#1e1b19'),roughness:.95,metalness:.2});
const paintCache=new Map();
const paintMat=h=>{let m=paintCache.get(h);if(!m){m=new THREE.MeshStandardMaterial({color:C(h),metalness:.5,roughness:.3});paintCache.set(h,m)}return m};
const policePaint=new THREE.MeshStandardMaterial({color:C('#111216'),metalness:.5,roughness:.3});
const neonTex=tex(cnv(64,128,(g)=>{const gr=g.createRadialGradient(32,64,4,32,64,62);gr.addColorStop(0,'rgba(255,255,255,1)');gr.addColorStop(1,'rgba(255,255,255,0)');g.fillStyle=gr;g.fillRect(0,0,64,128)}),false);
const lblTex=(txt,bg,fg)=>tex(cnv(256,64,(g)=>{g.fillStyle=bg;g.fillRect(0,0,256,64);g.fillStyle=fg;g.font='bold 44px "Arial Black",Impact,sans-serif';g.textAlign='center';g.textBaseline='middle';g.fillText(txt,128,34)}));
const policeDoor=new THREE.MeshLambertMaterial({map:lblTex('POLICE','#f2f2f2','#14306b')}),taxiSign=new THREE.MeshLambertMaterial({map:lblTex('TAXI','#ffd23a','#111'),emissive:C('#ffd23a'),emissiveIntensity:.2});
function typeGeo(t){if(t.geo)return t.geo;
  const ext={depth:t.W-.12,bevelEnabled:true,bevelThickness:.06,bevelSize:.06,bevelSegments:2,steps:1,curveSegments:1};
  const body=new THREE.ExtrudeGeometry(new THREE.Shape(t.pts.map(p=>new THREE.Vector2(p[0],p[1]))),ext);body.rotateY(-PI/2);body.translate((t.W-.12)/2,0,0);
  const Pp=t.pts,ry=Pp[5][1]-.07,f=(a,b,y)=>{const k=(y-a[1])/(b[1]-a[1]);return new THREE.Vector2(a[0]+(b[0]-a[0])*k,y)};
  const gp=[new THREE.Vector2(Pp[4][0],Pp[4][1]),f(Pp[4],Pp[5],ry),f(Pp[7],Pp[6],ry),new THREE.Vector2(Pp[7][0],Pp[7][1])];
  const glass=new THREE.ExtrudeGeometry(new THREE.Shape(gp),{...ext,depth:t.W-.08});glass.rotateY(-PI/2);glass.translate((t.W-.08)/2,0,0);
  t.geo={body,glass,tire:new THREE.CylinderGeometry(t.r,t.r,.3,16).rotateZ(PI/2)};return t.geo}
const rimGeos={};
function rimGeo(style,r){const k=style+r;if(rimGeos[k])return rimGeos[k];let g;
  if(style==='Sport'){const parts=[new THREE.CylinderGeometry(r*.2,r*.2,.32,8).rotateZ(PI/2)];for(let i=0;i<5;i++){const s=new THREE.BoxGeometry(.31,r*1.15,.08);s.rotateX(i*TAU/5);parts.push(s)}parts.push(new THREE.TorusGeometry(r*.6,.035,4,16).rotateY(PI/2));g=mergeGeos(parts)}
  else if(style==='Deep dish'){g=mergeGeos([new THREE.TorusGeometry(r*.6,.06,6,18).rotateY(PI/2),new THREE.CylinderGeometry(r*.38,r*.38,.31,10).rotateZ(PI/2)])}
  else g=new THREE.CylinderGeometry(r*.62,r*.62,.31,12).rotateZ(PI/2);
  return rimGeos[k]=g}
function mergeGeos(list){const p=[],n=[];for(const g0 of list){const g=g0.index?g0.toNonIndexed():g0;const a=g.attributes.position,b=g.attributes.normal;for(let i=0;i<a.count;i++){p.push(a.getX(i),a.getY(i),a.getZ(i));n.push(b.getX(i),b.getY(i),b.getZ(i))}}
  const o=new THREE.BufferGeometry();o.setAttribute('position',new THREE.Float32BufferAttribute(p,3));o.setAttribute('normal',new THREE.Float32BufferAttribute(n,3));return o}
const carBlobGeo=new THREE.PlaneGeometry(1,1).rotateX(-PI/2);
function makeCar(tn,hex,role){
  const t=CT[tn],G=typeGeo(t),g=new THREE.Group(),body=new THREE.Group();g.add(body);
  const paint=role==='police'?policePaint:paintMat(role==='taxi'?'#f2c230':hex);
  const bm=new THREE.Mesh(G.body,paint);bm.castShadow=true;body.add(bm);
  const gm=new THREE.Mesh(G.glass,glassMats[0]);body.add(gm);
  const Pp=t.pts,fy=(Pp[2][1]+Pp[3][1])/2,ry=(Pp[8][1]+Pp[9][1])/2;
  for(const s of[-1,1]){bx(.42,.15,.06,lightMat,s*(t.W/2-.32),fy,t.L/2+.04,body);bx(.4,.14,.06,tailMat,s*(t.W/2-.3),ry,-t.L/2-.05,body)}
  const wheels=[];
  for(const[sx,sz]of[[-1,1],[1,1],[-1,-1],[1,-1]]){const o=new THREE.Group();o.position.set(sx*(t.W/2-.04),t.r,sz*(t.L/2-.82));const s=new THREE.Group();o.add(s);s.add(new THREE.Mesh(G.tire,tireMat));const rim=new THREE.Mesh(rimGeo('Stock',t.r),rimSilver);rim.position.x=sx*.01;s.add(rim);g.add(o);wheels.push({o,s,rim,front:sz>0})}
  const blob=new THREE.Mesh(carBlobGeo,blobMat);blob.scale.set(t.W+.5,1,t.L+.4);blob.position.y=.04;g.add(blob);
  const m={g,body,bm,gm,paint,wheels,t,fy,ry,bar:null,neon:null,spoiler:null,own:false};
  if(role==='police'){for(const s of[-1,1]){const d=new THREE.Mesh(new THREE.PlaneGeometry(t.L*.42,.42),policeDoor);d.position.set(s*(t.W/2+.005),.78,0);d.rotation.y=s*PI/2;body.add(d)}
    const bar=new THREE.Group();bar.position.set(0,Pp[5][1]+.08,(Pp[5][0]+Pp[6][0])/2);bx(1.3,.12,.3,lam('#222'),0,0,0,bar);m.red=bx(.55,.14,.26,new THREE.MeshBasicMaterial({color:C('#661010')}),-.33,.04,0,bar);m.blue=bx(.55,.14,.26,new THREE.MeshBasicMaterial({color:C('#102066')}),.33,.04,0,bar);body.add(bar);m.bar=bar}
  if(role==='taxi'){const s=bx(.7,.22,.26,taxiSign,0,Pp[5][1]+.14,(Pp[5][0]+Pp[6][0])/2,body)}
  scene.add(g);return m;
}
function applyMods(c,s){
  const m=c.m,t=m.t;c.spec=s;
  if(!m.own){m.paint=new THREE.MeshStandardMaterial();m.bm.material=m.paint;m.own=true}
  const F=FINISH[s.finish];m.paint.color.copy(C(s.color));m.paint.metalness=F.m;m.paint.roughness=F.r;
  m.gm.material=glassMats[s.tint];
  const rm=s.rim==='Chrome'?new THREE.MeshStandardMaterial({color:C('#f2f4f6'),metalness:1,roughness:.05}):new THREE.MeshStandardMaterial({color:C(s.rimColor),metalness:.7,roughness:.3});
  for(const w of m.wheels){w.s.remove(w.rim);w.rim=new THREE.Mesh(rimGeo(s.rim==='Chrome'?'Sport':s.rim,t.r),rm);w.s.add(w.rim)}
  if(m.spoiler){m.body.remove(m.spoiler);m.spoiler=null}
  if(s.spoiler!=='None'){const sp=new THREE.Group(),Pp=t.pts,z=(Pp[7][0]+Pp[8][0])/2-.15,y=Pp[8][1];const pm=m.paint;
    if(s.spoiler==='Lip')bx(t.W*.8,.06,.25,pm,0,y+.06,z-.1,sp);
    else{const h=s.spoiler==='Wing'?.28:.52,w=s.spoiler==='Wing'?t.W*.85:t.W*.98;for(const k of[-1,1])bx(.06,h,.12,lam('#1b1b1b'),k*w*.32,y+h/2,z,sp);bx(w,.07,s.spoiler==='Wing'?.4:.55,pm,0,y+h,z,sp);if(s.spoiler==='GT wing')for(const k of[-1,1])bx(.04,.3,.6,pm,k*w/2,y+h,z,sp)}
    m.body.add(sp);m.spoiler=sp}
  if(m.neon){m.g.remove(m.neon);m.neon=null}
  if(NEON[s.neon]){const n=new THREE.Mesh(new THREE.PlaneGeometry(t.W+1.6,t.L+1.4).rotateX(-PI/2),new THREE.MeshBasicMaterial({color:C(NEON[s.neon]),map:neonTex,transparent:true,blending:THREE.AdditiveBlending,depthWrite:false}));n.position.y=.06;m.g.add(n);m.neon=n}
  m.body.position.y=s.low?-.1:0;
  c.st=carStats(c);
}
function carStats(c){const t=c.t,e=c.spec?c.spec.engine:0;return{max:t.max*(1+.075*e),acc:t.acc*(1+.12*e),grip:t.grip+(c.spec&&c.spec.low?.6:0)}}

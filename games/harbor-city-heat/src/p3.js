
// ===================== City generation (merged static geometry) =====================
const buckets=new Map();
function addGeo(geo,mats,cols,chunk){
  const pos=geo.attributes.position,nor=geo.attributes.normal,uv=geo.attributes.uv,idx=geo.index;
  const groups=geo.groups.length?geo.groups:[{start:0,count:idx?idx.count:pos.count,materialIndex:0}];
  for(const gr of groups){
    const mat=Array.isArray(mats)?mats[gr.materialIndex]:mats,col=Array.isArray(cols)?cols[gr.materialIndex]:cols;
    const k=chunk+'|'+mat.uuid;let b=buckets.get(k);if(!b){b={mat,p:[],n:[],u:[],c:[]};buckets.set(k,b)}
    for(let q=gr.start;q<gr.start+gr.count;q++){const i=idx?idx.getX(q):q;
      b.p.push(pos.getX(i),pos.getY(i),pos.getZ(i));b.n.push(nor.getX(i),nor.getY(i),nor.getZ(i));
      b.u.push(uv?uv.getX(i):0,uv?uv.getY(i):0);b.c.push(col.r,col.g,col.b)}
  }
  geo.dispose();
}
function scaleUV(geo,w,h,d,tx,ty){const uv=geo.attributes.uv,S=[[d,h],[d,h],[w,d],[w,d],[w,h],[w,h]];
  for(let f=0;f<6;f++)for(let k=0;k<4;k++){const i=f*4+k;uv.setXY(i,uv.getX(i)*S[f][0]/tx,uv.getY(i)*S[f][1]/ty)}}
function box(cx,y0,cz,w,h,d,mats,cols,ch,tx,ty){const g=new THREE.BoxGeometry(w,h,d);if(tx)scaleUV(g,w,h,d,tx,ty||tx);g.translate(cx,y0+h/2,cz);addGeo(g,mats,cols,ch)}
const wr=(w,r)=>[w,w,r,r,w,w];
function buildBuckets(){for(const b of buckets.values()){const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.Float32BufferAttribute(b.p,3));g.setAttribute('normal',new THREE.Float32BufferAttribute(b.n,3));
  g.setAttribute('uv',new THREE.Float32BufferAttribute(b.u,2));g.setAttribute('color',new THREE.Float32BufferAttribute(b.c,3));g.computeBoundingSphere();
  const m=new THREE.Mesh(g,b.mat);m.castShadow=b.mat!==matSide&&b.mat!==matGrass;m.receiveShadow=true;m.matrixAutoUpdate=false;m.updateMatrix();scene.add(m)}buckets.clear()}

const cols=new Map();
const colKey=(x,z)=>Math.floor(x/P)+','+Math.floor(z/P);
function addCol(cx,cz,w,d,h){const k=colKey(cx,cz);let l=cols.get(k);if(!l){l=[];cols.set(k,l)}l.push({minX:cx-w/2,maxX:cx+w/2,minZ:cz-d/2,maxZ:cz+d/2,h})}
const blockList=[];
const STUCCO=['#e8dcc8','#d9cbb5','#efe3cf','#c9c2b6','#e2c9a8','#d6d9dc','#cfc0a8','#e9d2c0','#bfc8cf','#d8b9a0','#c7d1c0','#e6cfc9'];
const PASTEL=['#f4d0c0','#f7e3b5','#c6e5da','#f6c4cf','#d7d0f2','#fbe2c8','#c4dff0','#f2cc9c','#bfe8c8'];
const OFFICE=['#a9c4d8','#9fb3c3','#c4d2db','#8fa9bd','#b7c9b9','#cdbfa8','#9ab0cc','#b6b8c9'];
const AWN=['#e05a47','#2f7f93','#e8b04a','#5a9e6f','#c9c9c9','#8e5aa8','#ef7f45'];
const CONT=['#b5452f','#2f6fa3','#3f8a55','#e28a2b','#7d7d7d','#c2b13d','#8b3b6b'];
const ROOF=C('#77736d');
const palms=[],trees=[],beacons=[],billboards=[];
function districtOf(i,j){
  if(i===-N)return'beach';if(j<=-N+1)return'hills';if(i>=N-3&&j>=N-3)return'port';
  if(i>=-1&&i<=3&&j>=-4&&j<=0)return'downtown';if(i<=-3&&j>=1)return'suburb';return'mid';
}
function areaName(x,z){
  if(x<-CE-6)return onPier(x,z)?'Paloma Pier':'Paloma Beach';
  if(x>CE+4||z<-CE-4)return'Palmwood Hills';if(z>CE+3)return'Terminal Docks';
  const i=clamp(Math.floor(x/P),-N,N-1),j=clamp(Math.floor(z/P),-N,N-1),d=districtOf(i,j);
  return{beach:'Paloma Beach',hills:'Palmwood Hills',port:'Terminal Docks',downtown:'Downtown',suburb:'Del Sol'}[d]||(x<0?(z<0?'Mirador':'Cypress Flats'):(z<0?'Alta Vista':'Rosewood'));
}
const AVES=['Ocean','Palmetto','Harbor','Del Mar','Marlowe','Cypress','Vista','Sable','Coral','Laguna','Mesa','Agave','Fremont','Jacaranda','Orchard','Bristol','Sierra'];
const ord=n=>n+(n%10===1&&n%100!==11?'st':n%10===2&&n%100!==12?'nd':n%10===3&&n%100!==13?'rd':'th');
function placeName(x,z){
  const kx=clamp(Math.round(x/P),-N,N),kz=clamp(Math.round(z/P),-N,N),dx=Math.abs(x-kx*P),dz=Math.abs(z-kz*P);
  const ave=AVES[kx+N]+(Math.abs(kx)%4===0?' Blvd':' Ave'),st=ord(kz+N+1)+' St';
  return{d:areaName(x,z),s:Math.abs(x)>CE||Math.abs(z)>CE?'':dx<9&&dz<9?ave+' & '+st:dx<dz?ave:st};
}
function perim(x0,z0,s){s=((s%208)+208)%208;
  if(s<52)return{x:x0+2+s,z:z0+2,dx:1,dz:0};if(s<104)return{x:x0+54,z:z0+2+(s-52),dx:0,dz:1};
  if(s<156)return{x:x0+54-(s-104),z:z0+54,dx:-1,dz:0};return{x:x0+2,z:z0+54-(s-156),dx:0,dz:-1}}

function bld(ch,cx,cz,w,d,h,mat,hex,y0=.3,tx=32,ty=32,collide=true){const c=C(hex);box(cx,y0,cz,w,h,d,wr(mat,matPlain),wr(c,ROOF),ch,tx,ty);if(collide)addCol(cx,cz,w,d,y0+h)}
function rooftop(ch,cx,cz,w,d,top){
  if(R()<.7)box(cx+Rr(-w/4,w/4),top,cz+Rr(-d/4,d/4),Rr(2,4),Rr(1.4,2.6),Rr(2,4),matPlain,C('#8d8f92'),ch);
  if(R()<.3){const g=new THREE.CylinderGeometry(1.4,1.4,3,10);g.translate(cx-w/4,top+2.6,cz+d/4);addGeo(g,matPlain,C('#7a5d44'),ch);box(cx-w/4,top,cz+d/4,2,1.1,2,matPlain,C('#555'),ch)}
  if(R()<.08&&w>12)billboards.push({x:cx,z:cz,y:top,a:R()<.5?0:PI/2});
}
function genMid(b,ch){
  const ax=b.x0+4,az=b.z0+4,r=R();
  const lots=r<.18?[[0,0,48,48]]:r<.6?[[0,0,24,24],[24,0,24,24],[0,24,24,24],[24,24,24,24]]:[[0,0,16,24],[16,0,16,24],[32,0,16,24],[0,24,24,24],[24,24,24,24]];
  const cf=1-Math.min(1,Math.hypot(b.x0+28-100,b.z0+28+120)/650);
  for(const[lx,lz,lw,ld]of lots){if(R()<.06)continue;
    const w=lw-Rr(1,3.5),d=ld-Rr(1,3.5),cx=ax+lx+lw/2,cz=az+lz+ld/2,big=lw>40;
    const h=big?Rr(24,58):Rr(7,20)+cf*Rr(0,38),col=Rp(STUCCO);
    if(R()<.72){box(cx,.3,cz,w+.6,4,d+.6,wr(matShop,matPlain),wr(C(Rp(AWN)),ROOF),ch,8,4);addCol(cx,cz,w+.6,d+.6,4.3);bld(ch,cx,cz,w,d,h,matResid,col,4.3,32,32,false);rooftop(ch,cx,cz,w,d,4.3+h)}
    else{bld(ch,cx,cz,w,d,h+4,matResid,col);rooftop(ch,cx,cz,w,d,h+4.3)}
  }
}
function genDown(b,ch){
  const cx=b.x0+28,cz=b.z0+28,cf=1-Math.min(1,Math.hypot(cx-105,cz-(-140))/300);
  const tower=(x,z,w,d,h)=>{const col=Rp(OFFICE);box(x,.3,z,w+1,6,d+1,wr(matShop,matPlain),wr(C('#cfd6dc'),ROOF),ch,8,6);addCol(x,z,w+1,d+1,6.3);
    let y=6.3,ww=w,dd=d;const tiers=R()<.55?2:R()<.5?3:1;
    for(let t=0;t<tiers;t++){const th=t===tiers-1?Math.max(10,h-y):h*Rr(.42,.58);bld(ch,x,z,ww,dd,th,matOffice,col,y,32,32,false);y+=th;ww*=Rr(.72,.86);dd*=Rr(.72,.86)}
    box(x,y,z,ww*.92,1.4,dd*.92,matPlain,C('#9da3a8'),ch);
    const ah=Rr(6,22);const g=new THREE.CylinderGeometry(.25,.4,ah,6);g.translate(x,y+1.4+ah/2,z);addGeo(g,matPlain,C('#b8bcc0'),ch);
    beacons.push([x,y+1.4+ah,z]);};
  if(R()<.55)tower(cx,cz,Rr(32,44),Rr(32,44),Rr(70,110)+cf*Rr(50,120));
  else{tower(b.x0+4+11.5,cz,Rr(18,22),Rr(34,44),Rr(45,90)+cf*70);tower(b.x0+52-11.5,cz,Rr(18,22),Rr(30,44),Rr(35,80)+cf*55)}
}
function genBeach(b,ch){
  for(let r=0;r<3;r++)for(let c=0;c<2;c++){if(R()<.12)continue;
    const w=Rr(17,21),d=Rr(12,14.5),cx=b.x0+4+12+c*24,cz=b.z0+4+8+r*16,h=Rr(3,7);
    box(cx,.3,cz,w,4,d,wr(matShop,matPlain),wr(C(Rp(PASTEL)),ROOF),ch,8,4);addCol(cx,cz,w,d,4.3);
    if(R()<.75){bld(ch,cx,cz,w-1,d-1,h,matResid,Rp(PASTEL),4.3,32,32,false);rooftop(ch,cx,cz,w,d,4.3+h)}}
  for(let z=b.z0+5;z<b.z0+54;z+=11)palms.push([b.x0+1.6,.3,z,Rr(.9,1.2)]);
}
function lawn(b,ch,hex='#7fae5a'){box(b.x0+28,.3,b.z0+28,52,.08,52,matGrass,C(hex),ch,8)}
function genHills(b,ch){
  lawn(b,ch,'#86b35e');
  const lots=R()<.4?[[0,0,48,48]]:[[0,0,48,24],[0,24,48,24]];
  for(const[lx,lz,lw,ld]of lots){
    const cx=b.x0+4+lx+lw/2,cz=b.z0+4+lz+ld/2,w=Math.min(lw-12,Rr(16,26)),d=Math.min(ld-8,Rr(10,15)),col=Rp(['#f4f1ea','#efe6d6','#e9ddd0','#f2efe9','#d9d2c4']);
    bld(ch,cx-4,cz,w,d,3.6,matHouse,col,.38,8,8);box(cx-4,3.98,cz,w+2.4,.45,d+2.4,matPlain,C('#4a4744'),ch);
    bld(ch,cx-4-w*.15,cz,w*.6,d*.8,3.4,matHouse,col,4.43,8,8,false);box(cx-4-w*.15,7.83,cz,w*.6+2,.4,d*.8+2,matPlain,C('#4a4744'),ch);
    const px=cx+w/2+2.5;box(px,.38,cz,7,.12,Math.min(d,10),matPlain,C('#e9e6df'),ch);
    const pg=new THREE.BoxGeometry(5.6,.06,Math.min(d,10)-1.4);pg.translate(px,.5,cz);const pool=new THREE.Mesh(pg,matWater);scene.add(pool);
    palms.push([cx+w/2+6,.38,cz-d/2,Rr(1,1.3)],[cx-w/2-8,.38,cz+d/2,Rr(1,1.3)]);
    for(const s of[-1,1]){const hz=b.z0+4+(s<0?lz+.6:lz+ld-.6);box(b.x0+4+12,.38,hz,22,1.8,1.2,matPlain,C('#3f6b35'),ch);addCol(b.x0+4+12,hz,22,1.2,2.2)}
  }
}
function genSub(b,ch){
  lawn(b,ch);
  for(let r=0;r<3;r++)for(let c=0;c<2;c++){
    const lx=b.x0+4+c*24,lz=b.z0+4+r*16,w=Rr(9,12),d=Rr(7,9),cx=lx+12+(c?2:-2),cz=lz+8,col=Rp(PASTEL.concat(STUCCO));
    bld(ch,cx,cz,w,d,3.4,matHouse,col,.38,8,8);
    const rh=Rr(1.8,2.6),sh=new THREE.Shape([new THREE.Vector2(-w/2-.5,0),new THREE.Vector2(w/2+.5,0),new THREE.Vector2(0,rh)]);
    const rg=new THREE.ExtrudeGeometry(sh,{depth:d+1,bevelEnabled:false});rg.translate(cx,3.78,cz-d/2-.5);addGeo(rg,matPlain,C(Rp(['#a8513a','#6b6b70','#8c5a3c','#4f5560'])),ch);
    box(c?lx+3:lx+21,.38,cz,3.4,.05,d,matPlain,C('#9c9a95'),ch);
    trees.push([c?lx+20:lx+4,.38,lz+Rr(3,13),Rr(.8,1.2)]);
  }
}
function genPort(b,ch){
  box(b.x0+28,.3,b.z0+28,52,.06,52,matPlain,C('#86827a'),ch);
  if(R()<.45){const w=Rr(36,44),d=Rr(24,32),cx=b.x0+28,cz=b.z0+28;bld(ch,cx,cz,w,d,Rr(10,14),matCorr,Rp(['#9aa6b0','#b0a48f','#7f8f9c','#a3604a']),.36,8,8);
    for(let k=-1;k<=1;k++)box(cx+k*11,.36,cz+d/2+.02,6,6,.1,matPlain,C('#3c3f44'),ch)}
  else for(let r=0;r<4;r++){const z=b.z0+8+r*11.5,x0=b.x0+6;for(let k=0;k<3;k++){const st=1+Math.floor(R()*4),x=x0+6+k*14;
    for(let s=0;s<st;s++)box(x,.36+s*2.6,z,12.2,2.6,2.5,matCorr,C(Rp(CONT)),ch,8,8);addCol(x,z,12.2,2.5,.36+st*2.6)}}
}
function genPark(b,ch){
  lawn(b,ch,'#76b05a');const cx=b.x0+28,cz=b.z0+28;
  box(cx,.38,cz,48,.05,4,matSide,C('#d8d2c8'),ch,8);box(cx,.38,cz,4,.05,48,matSide,C('#d8d2c8'),ch,8);
  const g=new THREE.CylinderGeometry(5,5.4,.8,20);g.translate(cx,.78,cz);addGeo(g,matPlain,C('#e7e2d8'),ch);
  const w=new THREE.Mesh(new THREE.CylinderGeometry(4.5,4.5,.1,20),matWater);w.position.set(cx,1.2,cz);scene.add(w);addCol(cx,cz,10,10,1.2);
  for(let k=0;k<6;k++)palms.push([b.x0+Rr(6,50),.38,b.z0+Rr(6,50),Rr(.9,1.3)]);
  for(let k=0;k<4;k++)trees.push([b.x0+Rr(6,50),.38,b.z0+Rr(6,50),Rr(.9,1.3)]);
}
for(let i=-N;i<N;i++)for(let j=-N;j<N;j++){
  const x0=i*P+7,z0=j*P+7,ch=Math.floor((i+N)/4)+','+Math.floor((j+N)/4),d=districtOf(i,j);
  box(x0+28,0,z0+28,56,.3,56,matSide,C('#ffffff'),ch,8);
  const park=(d==='mid'||d==='suburb')&&R()<.08&&!(i===0&&j===0);
  const b={i,j,x0,z0,d,park};blockList.push(b);
  if(park)genPark(b,ch);else({mid:genMid,downtown:genDown,beach:genBeach,hills:genHills,suburb:genSub,port:genPort})[d](b,ch);
}
// Container cranes straddling the dock road
for(let i=N-3;i<N;i++){const x=i*P+35,ch='q'+i,red=C('#c4422f'),wht=C('#e9e6df');
  for(const sx of[-6,6])for(const z of[HALF-12,HALF+9]){box(x+sx,0,z,1,30,1,matPlain,red,ch);addCol(x+sx,z,1.2,1.2,30)}
  box(x,30,HALF-1.5,14,2,24,matPlain,wht,ch);box(x,32,HALF+18,3,2.4,60,matPlain,red,ch);box(x,32,HALF-16,3,3,8,matPlain,wht,ch);
}
box(HALF-1.5*P,0,CE+1,4.5*P,.3,6,matPlain,C('#8f8b84'),'quay',0);
buildBuckets();

// Instanced vegetation, streetlights
function inst(geo,mat,list,place){const m=new THREE.InstancedMesh(geo,mat,list.length),o=new THREE.Object3D();list.forEach((it,i)=>{place(o,it,i);o.updateMatrix();m.setMatrixAt(i,o.matrix)});m.castShadow=true;scene.add(m);return m}
for(let k=-N;k<=N;k+=4)for(let z=-HALF;z<HALF;z+=14){const zz=z+7;if(Math.abs(((zz%P)+P)%P-0)<12||Math.abs(((zz%P)+P)%P-P)<12)continue;for(const s of[-1,1]){const x=k*P+s*9.4;if(Math.abs(x)>HALF+2)continue;palms.push([x,.3,zz,Rr(.95,1.25)]);addCol(x,zz,.7,.7,8)}}
for(let z=-CE-40;z<CE+30;z+=13){palms.push([-CE-Rr(4,24),0,z+Rr(-4,4),Rr(1,1.4)])}
for(const p of palms)if(Math.abs(p[0])<HALF&&Math.abs(p[2])<HALF)addCol(p[0],p[2],.7,.7,8);
{
  const trunkG=new THREE.CylinderGeometry(.22,.38,8,6);trunkG.translate(0,4,0);
  const frondG=new THREE.BoxGeometry(1,.08,4.2);frondG.translate(0,0,2.1);
  inst(trunkG,lam('#8a6a48'),palms,(o,[x,y,z,s])=>{o.position.set(x,y,z);o.rotation.set(0,0,(hash2(x,z)-.5)*.25);o.scale.set(1,s,1)});
  const fr=[];for(const p of palms)for(let k=0;k<7;k++)fr.push([p,k]);
  inst(frondG,lam('#3e8a46'),fr,(o,[[x,y,z,s],k])=>{const lean=(hash2(x,z)-.5)*.25;o.position.set(x-Math.sin(lean)*8*s,y+Math.cos(lean)*8*s,z);o.rotation.order='YXZ';o.rotation.set(.35+hash2(k,x)*.35,k*TAU/7+hash2(z,k),0);o.scale.set(1,1,s)});
  const tt=new THREE.CylinderGeometry(.25,.35,3,6);tt.translate(0,1.5,0);const tc=new THREE.IcosahedronGeometry(2.4,0);tc.translate(0,4.2,0);
  inst(tt,lam('#6b4f36'),trees,(o,[x,y,z,s])=>{o.position.set(x,y,z);o.rotation.set(0,0,0);o.scale.set(s,s,s)});
  inst(tc,lam('#4f7d3b'),trees,(o,[x,y,z,s])=>{o.position.set(x,y,z);o.rotation.set(0,hash2(x,z)*6,0);o.scale.set(s,s*1.1,s)});
  for(const t of trees)addCol(t[0],t[2],.8,.8,4);
  // Hillside homes and scrub
  const hh=[],hb=[];for(let k=0;k<900&&hh.length<160;k++){const x=rand(-CE-100,CE+260),z=rand(-CE-260,CE+100);const hill=Math.max(x-CE,-z-CE);if(hill<25||hill>230)continue;const y=terrainH(x,z);if(y<4)continue;(Math.random()<.4?hh:hb).push([x,y,z])}
  for(let k=0;k<1400;k++){const x=rand(-CE-200,CE+400),z=rand(-CE-400,CE+200);const hill=Math.max(x-CE,-z-CE);if(hill<12)continue;const y=terrainH(x,z);if(y<1.5)continue;hb.push([x,y,z])}
  const hm=inst(new THREE.BoxGeometry(14,6,10),new THREE.MeshLambertMaterial({color:C('#f2eee6')}),hh,(o,[x,y,z])=>{o.position.set(x,y+2,z);o.rotation.set(0,hash2(x,z)*3,0);o.scale.set(1,1,1)});hm.castShadow=false;
  const bm=inst(new THREE.ConeGeometry(2.4,6,6),lam('#4a6a3a'),hb,(o,[x,y,z])=>{o.position.set(x,y+2.4,z);o.rotation.set(0,0,0);const s=.8+hash2(x,z);o.scale.set(s,s,s)});bm.castShadow=false;
}
const lampPos=[];
{
  const pole=new THREE.CylinderGeometry(.11,.15,7.2,6);pole.translate(0,3.6,0);
  const arm=new THREE.BoxGeometry(2.3,.12,.12);arm.translate(-1.1,7.1,0);
  const head=new THREE.BoxGeometry(.8,.18,.38);head.translate(-2.1,7,0);
  const items=[];
  for(let k=-N;k<=N;k++)for(let m=-N;m<N;m++){const mid=(m+.5)*P;
    for(const s of[-1,1]){
      if(!((k===-N&&s<0)||(k===N&&s>0))){items.push([k*P+s*8.3,mid,s<0?PI:0]);lampPos.push([k*P+s*6.2,7,mid])}
      if(!((k===-N&&s<0)||(k===N&&s>0))){items.push([mid,k*P+s*8.3,-s*PI/2]);lampPos.push([mid,7,k*P+s*6.2])}
    }}
  const mat=lam('#3a3d42');
  for(const g of[pole,arm,head])inst(g,mat,items,(o,[x,z,r])=>{o.position.set(x,.3,z);o.rotation.set(0,r,0)}).castShadow=false;
  for(const[x,,z]of items.map(i=>[i[0],0,i[1]]))addCol(x,z,.4,.4,7);
}
// Rooftop billboards (fictional ads)
const ADS=[['FIZZ','the taste of summer','#e8453c','#fff4e0'],['PALM FM 98.6','synthwave all night','#2a1e5c','#ff7ac8'],['GOLD COAST REALTY',"you can't afford this",'#0f3d36','#f2d27a'],['TACO LOCO','open till 4am','#f2b23a','#2a1a10'],['FLEX GYM','24/7 · no excuses','#111','#5fe08a'],['HARBOR AIR','fly away from it all','#1f6fb5','#ffffff']];
{
  const adTex=ADS.map(([a,b,bg,fg])=>tex(cnv(512,256,(g)=>{g.fillStyle=bg;g.fillRect(0,0,512,256);g.fillStyle=fg;g.font='bold 76px "Arial Black",Impact,sans-serif';g.textAlign='center';g.fillText(a,256,130,480);g.font='600 38px Arial,sans-serif';g.globalAlpha=.85;g.fillText(b,256,195,470);g.globalAlpha=1;g.strokeStyle=fg;g.lineWidth=8;g.strokeRect(10,10,492,236)})));
  billboards.slice(0,16).forEach((b,i)=>{const t=adTex[i%adTex.length],m=new THREE.MeshLambertMaterial({map:t,emissive:C('#ffffff'),emissiveMap:t,emissiveIntensity:0});NIGHT_MATS.push(m);
    const g=new THREE.Group();const board=new THREE.Mesh(new THREE.BoxGeometry(14,7,.4),[lam('#444'),lam('#444'),lam('#444'),lam('#444'),m,lam('#444')]);board.position.y=7.5;g.add(board);
    for(const s of[-4,4]){const l=new THREE.Mesh(new THREE.BoxGeometry(.4,4.5,.4),lam('#555'));l.position.set(s,2.2,0);g.add(l)}
    g.position.set(b.x,b.y,b.z);g.rotation.y=b.a+(R()<.5?PI:0);scene.add(g)});
}

// Collision against building/prop boxes (circle in the ground plane)
function collideCircle(p,r){
  let hit=null;const bi=Math.floor(p.x/P),bj=Math.floor(p.z/P);
  for(let i=bi-1;i<=bi+1;i++)for(let j=bj-1;j<=bj+1;j++){
    const list=cols.get(i+','+j);if(!list)continue;
    for(const b of list){
      const cx=clamp(p.x,b.minX,b.maxX),cz=clamp(p.z,b.minZ,b.maxZ),dx=p.x-cx,dz=p.z-cz,d2=dx*dx+dz*dz;
      if(d2<r*r){let nx,nz,dep;
        if(d2<1e-8){const l=p.x-b.minX,rr=b.maxX-p.x,t=p.z-b.minZ,bt=b.maxZ-p.z,m=Math.min(l,rr,t,bt);
          if(m===l){nx=-1;nz=0;dep=l+r}else if(m===rr){nx=1;nz=0;dep=rr+r}else if(m===t){nx=0;nz=-1;dep=t+r}else{nx=0;nz=1;dep=bt+r}}
        else{const d=Math.sqrt(d2);nx=dx/d;nz=dz/d;dep=r-d}
        p.x+=nx*dep;p.z+=nz*dep;hit={nx,nz}}
    }
  }
  return hit;
}
function solidAt(x,y,z){const l=cols.get(colKey(x,z));if(!l)return false;for(const b of l)if(x>b.minX&&x<b.maxX&&z>b.minZ&&z<b.maxZ&&y<b.h)return true;return false}
function lineClear(x0,y0,z0,x1,y1,z1){const d=Math.hypot(x1-x0,z1-z0),n=Math.ceil(d/2.5);for(let k=1;k<n;k++){const t=k/n;if(solidAt(lerp(x0,x1,t),lerp(y0,y1,t),lerp(z0,z1,t)))return false}return true}

// Shops & services
const SHOP_DEF={garage:{name:'Torque Kings Customs',col:'#ff9b3d'},clothes:{name:'Threadz',col:'#ff7ac8'},guns:{name:'Ammo Depot',col:'#e8453c'},hospital:{name:'St. Paloma Hospital',col:'#f6efe2'},police:{name:'Police Station',col:'#4ea6ff'}};
const shops=[];
function blockAt(i,j){return blockList.find(b=>b.i===i&&b.j===j)}
function addShop(type,i,j,s){const b=blockAt(i,j);let x,z;
  if(type==='garage'){x=b.x0+28;z=b.z0-1.8}else{const q=perim(b.x0,b.z0,s);x=q.x;z=q.z}
  shops.push({type,x,z,...SHOP_DEF[type]});}
addShop('garage',-1,-1);addShop('garage',5,3);addShop('garage',-6,4);
addShop('clothes',1,1,26);addShop('clothes',-6,-4,26);addShop('clothes',-8,2,130);
addShop('guns',-2,4,26);addShop('guns',4,-3,26);addShop('guns',6,-6,26);
addShop('hospital',-1,2,26);addShop('police',2,1,26);
function iconDraw(g,type,x,y,r){
  g.save();g.translate(x,y);g.fillStyle=SHOP_DEF[type]?SHOP_DEF[type].col:'#fff';g.strokeStyle='#000';g.lineWidth=r*.18;
  g.beginPath();g.arc(0,0,r,0,TAU);g.fill();g.stroke();g.fillStyle='#111';g.strokeStyle='#111';const s=r/10;
  if(type==='garage'){g.lineWidth=2.4*s;g.beginPath();g.moveTo(-5*s,5*s);g.lineTo(4*s,-4*s);g.stroke();g.beginPath();g.arc(4.5*s,-4.5*s,3*s,PI*.25,PI*1.75,true);g.stroke()}
  else if(type==='clothes'){g.beginPath();g.moveTo(-6*s,-4*s);g.lineTo(-2.5*s,-6*s);g.lineTo(2.5*s,-6*s);g.lineTo(6*s,-4*s);g.lineTo(4*s,-1*s);g.lineTo(3*s,-2*s);g.lineTo(3*s,6*s);g.lineTo(-3*s,6*s);g.lineTo(-3*s,-2*s);g.lineTo(-4*s,-1*s);g.closePath();g.fill()}
  else if(type==='guns'){g.fillRect(-6*s,-4*s,11*s,3.5*s);g.fillRect(-6*s,-1*s,3.5*s,6*s)}
  else if(type==='hospital'){g.fillStyle='#d23';g.fillRect(-1.6*s,-6*s,3.2*s,12*s);g.fillRect(-6*s,-1.6*s,12*s,3.2*s)}
  else if(type==='police'){g.fillStyle='#fff';g.beginPath();for(let k=0;k<10;k++){const a=k*PI/5-PI/2,rr=k%2?2.6*s:6*s;g.lineTo(Math.cos(a)*rr,Math.sin(a)*rr)}g.fill()}
  g.restore();
}
for(const sh of shops){
  const ring=new THREE.Mesh(new THREE.RingGeometry(2.2,2.9,32).rotateX(-PI/2),new THREE.MeshBasicMaterial({color:C(sh.col),transparent:true,opacity:.8,depthWrite:false}));
  ring.position.set(sh.x,groundY(sh.x,sh.z)+.06,sh.z);scene.add(ring);
  if(sh.type!=='hospital'&&sh.type!=='police'){const cyl=new THREE.Mesh(new THREE.CylinderGeometry(2.5,2.5,2.4,24,1,true),new THREE.MeshBasicMaterial({color:C(sh.col),transparent:true,opacity:.22,side:THREE.DoubleSide,depthWrite:false}));cyl.position.set(sh.x,ring.position.y+1.2,sh.z);scene.add(cyl)}
  const sp=new THREE.Sprite(new THREE.SpriteMaterial({map:tex(cnv(128,128,(g)=>iconDraw(g,sh.type,64,64,52))),depthWrite:false}));sp.scale.set(2.2,2.2,1);sp.position.set(sh.x,ring.position.y+4.2,sh.z);scene.add(sp);sh.sprite=sp;
}

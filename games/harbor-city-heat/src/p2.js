// ===================== Utilities =====================
const $=id=>document.getElementById(id);
const PI=Math.PI,TAU=PI*2;
const clamp=(v,a,b)=>v<a?a:v>b?b:v, lerp=(a,b,t)=>a+(b-a)*t;
const wrapA=a=>{a=(a+PI)%TAU;if(a<0)a+=TAU;return a-PI};
const smooth=(a,b,x)=>{const t=clamp((x-a)/(b-a),0,1);return t*t*(3-2*t)};
const rand=(a,b)=>a+Math.random()*(b-a), randi=(a,b)=>Math.floor(rand(a,b+1)), pick=a=>a[Math.floor(Math.random()*a.length)];
let seed=20261011;
const R=()=>{seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296};
const Rr=(a,b)=>a+R()*(b-a), Rp=a=>a[Math.floor(R()*a.length)];
function hash2(x,z){const h=Math.sin(x*127.1+z*311.7)*43758.5453;return h-Math.floor(h)}
function vnoise(x,z){const xi=Math.floor(x),zi=Math.floor(z),xf=x-xi,zf=z-zi,u=xf*xf*(3-2*xf),v=zf*zf*(3-2*zf);
  return lerp(lerp(hash2(xi,zi),hash2(xi+1,zi),u),lerp(hash2(xi,zi+1),hash2(xi+1,zi+1),u),v)}
const fbm=(x,z)=>vnoise(x,z)*.5+vnoise(x*2.1,z*2.1)*.3+vnoise(x*4.3,z*4.3)*.2;
const C=h=>new THREE.Color(h).convertSRGBToLinear();
const fmt=n=>'$'+Math.round(n).toLocaleString('en-US');

// ===================== Save =====================
const DEF={v:2,money:2500,char:null,car:null,weapons:{fist:1,pistol:72},armor:0,settings:{quality:'auto',draw:'medium',sens:1,invert:false,vol:.8,music:.5,fps:false,btn:1}};
let save=null;
try{save=JSON.parse(localStorage.getItem('hch2')||'null')}catch(e){}
if(!save||save.v!==2){save=JSON.parse(JSON.stringify(DEF));try{const old=+localStorage.getItem('hch.money');if(old>0)save.money=Math.max(save.money,old)}catch(e){}}
save.settings=Object.assign({},DEF.settings,save.settings||{});
if(!save.weapons)save.weapons={fist:1,pistol:72};
function persist(){try{localStorage.setItem('hch2',JSON.stringify(save))}catch(e){}}

// ===================== Renderer =====================
const coarse=matchMedia('(pointer: coarse)').matches;
if(coarse)document.body.classList.add('coarse');
const canvas=$('view');
const renderer=new THREE.WebGLRenderer({canvas,antialias:!coarse,powerPreference:'high-performance'});
renderer.outputEncoding=THREE.sRGBEncoding;
renderer.toneMapping=THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure=1.05;
renderer.shadowMap.enabled=true;
renderer.shadowMap.type=THREE.PCFSoftShadowMap;
const scene=new THREE.Scene();
scene.fog=new THREE.Fog(0xbfd8e6,100,400);
const camera=new THREE.PerspectiveCamera(62,1,.3,500);
const hemi=new THREE.HemisphereLight(0xffffff,0x4a443c,.6);scene.add(hemi);
const sun=new THREE.DirectionalLight(0xffffff,1.5);
sun.shadow.mapSize.set(2048,2048);
{const s=sun.shadow.camera;s.left=-75;s.right=75;s.top=75;s.bottom=-75;s.near=5;s.far=600}
sun.shadow.bias=-.0005;sun.shadow.normalBias=.05;
scene.add(sun,sun.target);
const flash=new THREE.PointLight(0xffa040,0,40,2);scene.add(flash);

const QUAL={low:{pr:Math.min(devicePixelRatio,1)*.75,traffic:12,peds:20,cops:4,shadow:false,part:1},
  medium:{pr:Math.min(devicePixelRatio,1.25),traffic:20,peds:30,cops:6,shadow:false,part:1},
  high:{pr:Math.min(devicePixelRatio,2),traffic:28,peds:42,cops:9,shadow:true,part:1}};
const DRAW={near:240,medium:350,far:540};
let qName=null,Q=QUAL.medium,drawDist=350;

// Sky dome: gradient + sun + stars, tone mapped like everything else
const skyU={top:{value:new THREE.Color()},hor:{value:new THREE.Color()},bot:{value:new THREE.Color()},sunDir:{value:new THREE.Vector3(0,1,0)},sunCol:{value:new THREE.Color()},night:{value:0}};
const skyMat=new THREE.ShaderMaterial({uniforms:skyU,side:THREE.BackSide,depthWrite:false,fog:false,
  vertexShader:'varying vec3 vD;void main(){vD=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
  fragmentShader:`uniform vec3 top,hor,bot,sunCol,sunDir;uniform float night;varying vec3 vD;
  float h3(vec3 p){return fract(sin(dot(p,vec3(12.9898,78.233,37.719)))*43758.5453);}
  void main(){vec3 d=normalize(vD);float y=d.y;vec3 c=y>0.?mix(hor,top,pow(y,.45)):mix(hor,bot,pow(-y,.4));
  float s=max(dot(d,sunDir),0.);c+=sunCol*(pow(s,900.)*8.+pow(s,24.)*.3+pow(s,4.)*.1);
  if(night>0.&&y>0.){vec3 q=floor(d*300.);float st=h3(q);c+=vec3(step(.9984,st))*night*(.4+.6*h3(q+1.));}
  gl_FragColor=vec4(c,1.);
  #include <tonemapping_fragment>
  #include <encodings_fragment>
  }`});
const sky=new THREE.Mesh(new THREE.SphereGeometry(1,32,16),skyMat);sky.renderOrder=-10;sky.frustumCulled=false;scene.add(sky);
const envScene=new THREE.Scene();envScene.add(new THREE.Mesh(new THREE.SphereGeometry(20,24,12),skyMat));
{const g=new THREE.Mesh(new THREE.PlaneGeometry(60,60).rotateX(-PI/2),new THREE.MeshBasicMaterial({color:C('#5d5a55')}));g.position.y=-2;envScene.add(g)}
const pmrem=new THREE.PMREMGenerator(renderer);let envRT=null;
function updateEnv(){const rt=pmrem.fromScene(envScene,.03);if(envRT)envRT.dispose();envRT=rt;scene.environment=rt.texture}

let pScale=500;
function resize(){const w=innerWidth,h=innerHeight;renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();
  pScale=renderer.domElement.height/(2*Math.tan(camera.fov*PI/360))}
addEventListener('resize',resize);
function applyQuality(){
  if(save.settings.quality!=='auto')qName=save.settings.quality;else if(!qName)qName=coarse?'medium':'high';
  Q=QUAL[qName];renderer.setPixelRatio(Q.pr);sun.castShadow=Q.shadow;
  drawDist=DRAW[save.settings.draw]*(qName==='low'?.85:1);
  camera.far=drawDist;scene.fog.near=drawDist*.3;scene.fog.far=drawDist*.97;sky.scale.setScalar(drawDist*.9);
  resize();
}
applyQuality();

// ===================== Textures & materials =====================
function cnv(w,h,draw){const c=document.createElement('canvas');c.width=w;c.height=h;draw(c.getContext('2d'),w,h);return c}
const maxAniso=renderer.capabilities.getMaxAnisotropy();
function tex(c,srgb=true){const t=new THREE.CanvasTexture(c);t.wrapS=t.wrapT=THREE.RepeatWrapping;if(srgb)t.encoding=THREE.sRGBEncoding;t.anisotropy=Math.min(8,maxAniso);return t}
function grain(g,w,h,n,a){for(let i=0;i<n;i++){const v=Math.random()<.5?0:255;g.fillStyle=`rgba(${v},${v},${v},${Math.random()*a})`;g.fillRect(Math.random()*w,Math.random()*h,1+Math.random()*2,1+Math.random()*2)}}

// City grid: roads on x=k*P and z=k*P, k=-N..N; blocks between
const N=8,P=70,ROAD=14,HALF=N*P,CE=HALF+8,LANE=3.5,SEA=-.6;
const FWD=[[0,1],[1,0],[0,-1],[-1,0]],RIGHT=[[-1,0],[0,1],[1,0],[0,-1]],ANG=[0,PI/2,PI,-PI/2];

const roadTex=tex(cnv(512,512,(g,w)=>{
  const s=w/P,c=w/2,hw=ROAD/2*s,ie=hw+4*s,seg=(x,y,a,b)=>g.fillRect(x,y,a,b);
  g.fillStyle='#3a3c41';g.fillRect(0,0,w,w);grain(g,w,w,14000,.07);
  for(let i=0;i<16;i++){g.fillStyle=`rgba(0,0,0,${rand(.04,.1)})`;g.beginPath();const v=i%2;g.ellipse(v?c+rand(-hw,hw):rand(0,w),v?rand(0,w):c+rand(-hw,hw),rand(4,10),rand(8,22),v?0:PI/2,0,TAU);g.fill()}
  g.fillStyle='#d8ae3a';
  seg(c-2.5,0,1.6,c-ie);seg(c+.9,0,1.6,c-ie);seg(c-2.5,c+ie,1.6,w-c-ie);seg(c+.9,c+ie,1.6,w-c-ie);
  seg(0,c-2.5,c-ie,1.6);seg(0,c+.9,c-ie,1.6);seg(c+ie,c-2.5,w-c-ie,1.6);seg(c+ie,c+.9,w-c-ie,1.6);
  g.fillStyle='rgba(230,230,230,.7)';const e=hw-.5*s;
  for(const o of[-e,e-1.4]){seg(c+o,0,1.4,c-ie);seg(c+o,c+ie,1.4,w-c-ie);seg(0,c+o,c-ie,1.4);seg(c+ie,c+o,w-c-ie,1.4)}
  g.fillStyle='rgba(238,238,238,.85)';const cw0=hw+.8*s,cw1=hw+3.6*s,sw=.55*s;
  for(let k=-hw+.8*s;k<hw-.8*s;k+=1.1*s){seg(c+k,c-cw1,sw,cw1-cw0);seg(c+k,c+cw0,sw,cw1-cw0);seg(c-cw1,c+k,cw1-cw0,sw);seg(c+cw0,c+k,cw1-cw0,sw)}
}));
const sideTex=tex(cnv(256,256,(g,w)=>{g.fillStyle='#d6d1c8';g.fillRect(0,0,w,w);grain(g,w,w,5000,.08);g.strokeStyle='rgba(0,0,0,.14)';g.lineWidth=2;
  for(let k=0;k<=w;k+=64){g.beginPath();g.moveTo(k,0);g.lineTo(k,w);g.stroke();g.beginPath();g.moveTo(0,k);g.lineTo(w,k);g.stroke()}}));
const grassTex=tex(cnv(256,256,(g,w)=>{g.fillStyle='#ffffff';g.fillRect(0,0,w,w);for(let i=0;i<7000;i++){const v=rand(.72,1);g.fillStyle=`rgba(${v*255|0},${v*255|0},${v*235|0},.5)`;g.fillRect(rand(0,w),rand(0,w),2,3)}}));
const litCells=[];
function windowsCanvas(lit,kind){return cnv(256,256,(g)=>{
  g.fillStyle=lit?'#000':'#fff';g.fillRect(0,0,256,256);if(!lit)grain(g,256,256,3000,.06);
  let i=0;
  for(let y=0;y<8;y++)for(let x=0;x<8;x++){
    const on=lit?litCells[kind*64+i]:false;i++;
    if(kind===0){if(lit){if(on){g.fillStyle=pick(['#ffe2a3','#ffd27a','#fff1c9','#bfe3ff']);g.fillRect(x*32+7,y*32+7,18,19)}}
      else{g.fillStyle='rgba(0,0,0,.18)';g.fillRect(x*32+5,y*32+5,22,23);g.fillStyle=Math.random()<.5?'#2f3b48':'#3c4b5a';g.fillRect(x*32+7,y*32+7,18,19);g.fillStyle='rgba(255,255,255,.12)';g.fillRect(x*32+7,y*32+7,8,19)}}
    else{if(lit){if(on){g.fillStyle=pick(['#ffe7b8','#fff3d6','#cfe8ff']);g.fillRect(x*32+1,y*32+2,14,28);g.fillRect(x*32+17,y*32+2,14,28)}}
      else{g.fillStyle=`hsl(205,30%,${rand(18,30)}%)`;g.fillRect(x*32,y*32,32,32);const gr=g.createLinearGradient(x*32,y*32,x*32+32,y*32+32);gr.addColorStop(0,'rgba(255,255,255,.25)');gr.addColorStop(.6,'rgba(255,255,255,0)');g.fillStyle=gr;g.fillRect(x*32,y*32,32,32)}}
  }
  if(!lit&&kind===1){g.fillStyle='#c9d0d6';for(let k=0;k<256;k+=32){g.fillRect(0,k,256,2);}for(let k=0;k<256;k+=16)g.fillRect(k,0,1.5,256)}
})}
for(let i=0;i<128;i++)litCells.push(Math.random()<.4);
const residTex=tex(windowsCanvas(false,0)),residLit=tex(windowsCanvas(true,0));
const officeTex=tex(windowsCanvas(false,1)),officeLit=tex(windowsCanvas(true,1));
const houseTex=tex(cnv(128,128,(g)=>{g.fillStyle='#fff';g.fillRect(0,0,128,128);grain(g,128,128,1500,.06);
  for(const x of[14,78]){g.fillStyle='#e6e0d6';g.fillRect(x-3,30,42,46);g.fillStyle='#34414e';g.fillRect(x,33,36,40);g.fillStyle='rgba(255,255,255,.15)';g.fillRect(x,33,14,40)}}));
const houseLit=tex(cnv(128,128,(g)=>{g.fillStyle='#000';g.fillRect(0,0,128,128);g.fillStyle='#ffd897';if(Math.random()<.7)g.fillRect(14,33,36,40);g.fillStyle='#ffe8bf';if(Math.random()<.5)g.fillRect(78,33,36,40)}));
const shopTex=tex(cnv(128,64,(g)=>{g.fillStyle='#e9e4da';g.fillRect(0,0,128,64);
  for(let x=0;x<128;x+=16){g.fillStyle=(x/16)%2?'#ffffff':'#c9c2b6';g.fillRect(x,0,16,12)}
  g.fillStyle='rgba(0,0,0,.25)';g.fillRect(0,12,128,2);
  for(const x of[6,70]){g.fillStyle='#1e2a35';g.fillRect(x,18,52,44);const gr=g.createLinearGradient(x,18,x+52,62);gr.addColorStop(0,'rgba(255,255,255,.28)');gr.addColorStop(.5,'rgba(255,255,255,0)');g.fillStyle=gr;g.fillRect(x,18,52,44);g.fillStyle='#9a958c';g.fillRect(x+25,18,2,44)}}));
const shopLit=tex(cnv(128,64,(g)=>{g.fillStyle='#000';g.fillRect(0,0,128,64);g.fillStyle='#ffd99a';g.fillRect(6,18,52,44);g.fillStyle='#fff0cf';g.fillRect(70,18,52,44)}));
const corrTex=tex(cnv(128,128,(g)=>{for(let x=0;x<128;x+=8){const gr=g.createLinearGradient(x,0,x+8,0);gr.addColorStop(0,'#cfcfcf');gr.addColorStop(.5,'#ffffff');gr.addColorStop(1,'#a8a8a8');g.fillStyle=gr;g.fillRect(x,0,8,128)}grain(g,128,128,800,.12)}));
const plankTex=tex(cnv(128,128,(g)=>{for(let y=0;y<128;y+=16){g.fillStyle=`hsl(28,${rand(28,40)}%,${rand(38,48)}%)`;g.fillRect(0,y,128,15);g.fillStyle='rgba(0,0,0,.4)';g.fillRect(0,y+15,128,1)}grain(g,128,128,900,.15)}));
const glowTex=tex(cnv(64,64,(g)=>{const gr=g.createRadialGradient(32,32,0,32,32,32);gr.addColorStop(0,'rgba(255,255,255,1)');gr.addColorStop(.35,'rgba(255,255,255,.45)');gr.addColorStop(1,'rgba(255,255,255,0)');g.fillStyle=gr;g.fillRect(0,0,64,64)}),false);
const waterNorm=(()=>{const S=128,h=new Float32Array(S*S);for(let y=0;y<S;y++)for(let x=0;x<S;x++)h[y*S+x]=Math.sin(x/S*TAU*3+Math.sin(y/S*TAU*2)*1.5)*.5+Math.sin(y/S*TAU*5+x/S*TAU)*.3+vnoise(x*.25,y*.25)*.6;
  const c=cnv(S,S,(g)=>{const im=g.createImageData(S,S);for(let y=0;y<S;y++)for(let x=0;x<S;x++){const dx=h[y*S+(x+1)%S]-h[y*S+(x+S-1)%S],dy=h[((y+1)%S)*S+x]-h[((y+S-1)%S)*S+x];const nx=-dx,ny=-dy,nz=1,l=Math.hypot(nx,ny,nz);const i=(y*S+x)*4;im.data[i]=(nx/l*.5+.5)*255;im.data[i+1]=(ny/l*.5+.5)*255;im.data[i+2]=(nz/l*.5+.5)*255;im.data[i+3]=255}g.putImageData(im,0,0)});
  return tex(c,false)})();

const matCache=new Map();
const lam=h=>{let m=matCache.get(h);if(!m){m=new THREE.MeshLambertMaterial({color:C(h)});matCache.set(h,m)}return m};
const matResid=new THREE.MeshLambertMaterial({map:residTex,emissive:C('#ffd9a0'),emissiveMap:residLit,emissiveIntensity:0,vertexColors:true});
const matOffice=new THREE.MeshStandardMaterial({map:officeTex,emissive:C('#ffe6b8'),emissiveMap:officeLit,emissiveIntensity:0,roughness:.16,metalness:.7,vertexColors:true});
const matHouse=new THREE.MeshLambertMaterial({map:houseTex,emissive:C('#ffd08a'),emissiveMap:houseLit,emissiveIntensity:0,vertexColors:true});
const matShop=new THREE.MeshLambertMaterial({map:shopTex,emissive:C('#ffe0a8'),emissiveMap:shopLit,emissiveIntensity:0,vertexColors:true});
const matCorr=new THREE.MeshLambertMaterial({map:corrTex,vertexColors:true});
const matPlain=new THREE.MeshLambertMaterial({vertexColors:true});
const matSide=new THREE.MeshLambertMaterial({map:sideTex,vertexColors:true});
const matGrass=new THREE.MeshLambertMaterial({map:grassTex,vertexColors:true});
const matWater=new THREE.MeshStandardMaterial({color:C('#3fb6d9'),roughness:.04,metalness:.3,normalMap:waterNorm});
const NIGHT_MATS=[matResid,matOffice,matHouse,matShop];

// ===================== Terrain, ocean, pier =====================
function terrainH(x,z){
  const east=x-CE,north=-z-CE,west=-x-CE,south=z-CE,hill=Math.max(east,north);
  if(hill>0)return smooth(0,110,hill)*(25+fbm(x*.006+3.1,z*.006-1.7)*150)+Math.min(hill,8)*.25-(west>0?Math.min(west,60)*.08:0)-(south>0?Math.min(south,40)*.18:0);
  const beach=west>0?(west<14?0:-(west-14)*.032):0, quay=south>0?-south*.22:0;
  return Math.min(beach,quay);
}
const PIER={x0:-CE-180,x1:-CE-16,z0:-7,z1:7,y:.9};
const onPier=(x,z)=>x>PIER.x0&&x<PIER.x1+8&&z>PIER.z0&&z<PIER.z1;
function walkable(x,z){if(onPier(x,z))return true;if(Math.abs(x)<=CE&&Math.abs(z)<=CE)return true;const h=terrainH(x,z);return h>-.45&&h<2.6}
function groundY(x,z){
  if(onPier(x,z))return x>PIER.x1?PIER.y*(1-(x-PIER.x1)/8):PIER.y;
  const i=Math.floor(x/P),j=Math.floor(z/P);
  if(i>=-N&&i<N&&j>=-N&&j<N){const lx=x-i*P,lz=z-j*P;if(lx>7&&lx<63&&lz>7&&lz<63)return .3}
  if(Math.abs(x)<=CE-1&&Math.abs(z)<=CE-1)return 0;
  return Math.max(terrainH(x,z),SEA);
}
{
  const S=2800,seg=200,geo=new THREE.PlaneGeometry(S,S,seg,seg).rotateX(-PI/2);
  const pos=geo.attributes.position,cols=new Float32Array(pos.count*3);
  const sand=C('#e3cf9c'),wet=C('#b9a476'),olive=C('#8d8a52'),brown=C('#a5875c'),green=C('#5d7a44'),rock=C('#9b9184'),tmp=new THREE.Color();
  for(let i=0;i<pos.count;i++){
    const x=pos.getX(i),z=pos.getZ(i),inCity=Math.abs(x)<CE-1&&Math.abs(z)<CE-1;
    let y=inCity?-.08:terrainH(x,z);pos.setY(i,y);
    const hill=Math.max(x-CE,-z-CE);
    if(hill>0&&y>1.5){const n=fbm(x*.03,z*.03);tmp.copy(olive).lerp(brown,n);if(n<.38)tmp.lerp(green,.7);if(y>85)tmp.lerp(rock,smooth(85,120,y))}
    else if(y<-.5)tmp.copy(wet);else tmp.copy(sand);
    cols[i*3]=tmp.r;cols[i*3+1]=tmp.g;cols[i*3+2]=tmp.b;
  }
  geo.setAttribute('color',new THREE.BufferAttribute(cols,3));geo.computeVertexNormals();
  const terr=new THREE.Mesh(geo,new THREE.MeshPhongMaterial({vertexColors:true,flatShading:true,shininess:0,specular:0}));terr.receiveShadow=true;scene.add(terr);
}
waterNorm.repeat.set(220,220);
const ocean=new THREE.Mesh(new THREE.PlaneGeometry(6000,6000).rotateX(-PI/2),new THREE.MeshStandardMaterial({color:C('#1e6f86'),roughness:.12,metalness:.15,normalMap:waterNorm,normalScale:new THREE.Vector2(.35,.35)}));
ocean.position.y=SEA;scene.add(ocean);
{const size=2*HALF+ROAD;roadTex.repeat.set(size/P,size/P);const off=(-(HALF+7)+P/2)/P;roadTex.offset.set(off,off);
 const road=new THREE.Mesh(new THREE.PlaneGeometry(size,size).rotateX(-PI/2),new THREE.MeshLambertMaterial({map:roadTex}));road.position.y=.01;road.receiveShadow=true;scene.add(road)}

// Pier with a Ferris wheel at the end
const ferris=new THREE.Group();
{
  plankTex.repeat.set((PIER.x1-PIER.x0)/8,14/8);
  const deck=new THREE.Mesh(new THREE.BoxGeometry(PIER.x1-PIER.x0,.5,14),new THREE.MeshLambertMaterial({map:plankTex}));
  deck.position.set((PIER.x0+PIER.x1)/2,PIER.y-.25,0);deck.receiveShadow=true;scene.add(deck);
  const ramp=new THREE.Mesh(new THREE.BoxGeometry(8.4,.5,14),deck.material);ramp.position.set(PIER.x1+4,PIER.y/2-.25,0);ramp.rotation.z=Math.atan2(PIER.y,8);scene.add(ramp);
  const postG=new THREE.CylinderGeometry(.25,.25,5,6),posts=new THREE.InstancedMesh(postG,lam('#5b4632'),60),o=new THREE.Object3D();let k=0;
  for(let x=PIER.x0+3;x<PIER.x1&&k<60;x+=11)for(const z of[-6,6]){o.position.set(x,PIER.y-2.7,z);o.updateMatrix();posts.setMatrixAt(k++,o.matrix)}
  posts.count=k;scene.add(posts);
  for(const z of[-6.8,6.8]){const r=new THREE.Mesh(new THREE.BoxGeometry(PIER.x1-PIER.x0,.12,.12),lam('#e8e2d4'));r.position.set((PIER.x0+PIER.x1)/2,PIER.y+1,z);scene.add(r)}
  const cx=PIER.x0+26,R0=15;
  for(const z of[-3,3])for(const s of[-1,1]){const l=new THREE.Mesh(new THREE.BoxGeometry(.6,R0+3,.6),lam('#e8e2d4'));l.position.set(cx+s*5,PIER.y+(R0+3)/2,z);l.rotation.z=s*.32;scene.add(l)}
  ferris.position.set(cx,PIER.y+R0+2,0);scene.add(ferris);
  const wheel=new THREE.Group();ferris.add(wheel);ferris.userData.wheel=wheel;
  const bulbMat=new THREE.MeshLambertMaterial({color:C('#f4f1ea'),emissive:C('#ffcf6b'),emissiveIntensity:0});ferris.userData.bulbMat=bulbMat;
  for(const z of[-1.6,1.6]){const t=new THREE.Mesh(new THREE.TorusGeometry(R0,.18,6,48).rotateY(PI/2),bulbMat);t.position.x=z;wheel.add(t)}
  for(let i=0;i<16;i++){const a=i/16*TAU,sp=new THREE.Mesh(new THREE.BoxGeometry(.12,R0,.12),lam('#d9d4ca'));sp.position.set(0,Math.sin(a)*R0/2,Math.cos(a)*R0/2);sp.rotation.x=-a+PI/2;wheel.add(sp)}
  const cab=[];const cols=['#e8453c','#ffcc4d','#4ea6ff','#5fcf72','#ff7ac8','#ff8a5c'];
  for(let i=0;i<16;i++){const c=new THREE.Mesh(new THREE.BoxGeometry(1.6,1.6,2.2),lam(cols[i%6]));ferris.add(c);cab.push({m:c,a:i/16*TAU})}
  ferris.userData.cab=cab;ferris.userData.R=R0;
}
// Hillside landmark sign
{
  const c=cnv(1024,128,(g)=>{g.font='bold 116px "Arial Black",Impact,sans-serif';g.textAlign='center';g.textBaseline='middle';g.fillStyle='rgba(0,0,0,.25)';g.fillText('PALMWOOD',518,70);g.fillStyle='#f4f1ea';g.fillText('PALMWOOD',512,64)});
  const t=tex(c);const m=new THREE.Mesh(new THREE.PlaneGeometry(150,19),new THREE.MeshLambertMaterial({map:t,transparent:true,emissive:C('#ffffff'),emissiveMap:t,emissiveIntensity:0}));
  const x=-140,z=-CE-150;m.position.set(x,terrainH(x,z)+12,z);m.rotation.x=-.3;scene.add(m);NIGHT_MATS.push(m.material);
}

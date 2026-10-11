
// ===================== Skinned characters (rigged models + retargeted animation) =====================
function rtBones(root){const m={};root.traverse(o=>{if(o.isBone)m[o.name.replace(/^mixamorig:?/,'')]=o});return m}
function rtRest(root,restClip){
  const mx=new THREE.AnimationMixer(root);let act=null;
  if(restClip){act=mx.clipAction(restClip);act.play();mx.setTime(0)}
  root.updateMatrixWorld(true);const b=rtBones(root),w={},l={};
  for(const k in b){w[k]=b[k].getWorldQuaternion(new THREE.Quaternion());l[k]=b[k].quaternion.clone()}
  if(act){act.stop();mx.uncacheRoot(root)}return{w,l,b};
}
function retargetClip(src,srcClip,srcRest,tgt,tgtRest,flip,fps){
  fps=fps||30;const S=rtBones(src),T=tgtRest.b;
  const F=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),flip?PI:0),Fi=F.clone().invert();
  const order=[];const visit=o=>{if(o.isBone)order.push(o);o.children.forEach(visit)};visit(tgt);
  const tq=new Map(),vals={};for(const k in T)vals[k]=[];
  const mx=new THREE.AnimationMixer(src),act=mx.clipAction(srcClip);act.play();
  const n=Math.max(2,Math.round(srcClip.duration*fps)+1),times=[];
  const pq=new THREE.Quaternion(),tw=new THREE.Quaternion(),d=new THREE.Quaternion(),sw=new THREE.Quaternion(),inv={};
  for(const k in srcRest.w)inv[k]=srcRest.w[k].clone().invert();
  for(let i=0;i<n;i++){const t=Math.min(srcClip.duration,i/fps);times.push(t);mx.setTime(t);src.updateMatrixWorld(true);tq.clear();
    for(const bone of order){const k=bone.name.replace(/^mixamorig:?/,''),par=bone.parent,pk=par&&par.isBone?par.name.replace(/^mixamorig:?/,''):null;
      if(pk&&tq.has(pk))pq.copy(tq.get(pk));else par.getWorldQuaternion(pq);
      if(S[k]&&inv[k]){S[k].getWorldQuaternion(sw);d.copy(sw).multiply(inv[k]);d.premultiply(F).multiply(Fi);tw.copy(d).multiply(tgtRest.w[k])}
      else tw.copy(pq).multiply(tgtRest.l[k]||bone.quaternion);
      tq.set(k,tw.clone());const loc=pq.clone().invert().multiply(tw);if(vals[k])vals[k].push(loc.x,loc.y,loc.z,loc.w)}}
  act.stop();mx.uncacheRoot(src);
  const tracks=[];for(const bone of order){const k=bone.name.replace(/^mixamorig:?/,'');if(!S[k]||!vals[k]||!vals[k].length)continue;tracks.push(new THREE.QuaternionKeyframeTrack(bone.name+'.quaternion',times,vals[k]))}
  return new THREE.AnimationClip(srcClip.name,srcClip.duration,tracks);
}
const CHARS={ready:false};
let frameDt=1/60;
const SKIN_TINT=['#ffffff','#f3dcc8','#dcae8c','#b98462','#8a5a3e','#64412d'];
function loadChars(progress){
  if(!THREE.GLTFLoader||!THREE.SkeletonUtils)return Promise.resolve(false);
  const L=new THREE.GLTFLoader();let n=0;
  const load=u=>new Promise((res,rej)=>L.load(u,g=>{progress&&progress(++n/3);res(g)},undefined,rej));
  return Promise.all(['assets/male.glb','assets/michelle.glb','assets/soldier.glb'].map(load)).then(([m,f,s])=>{
    const A=(g,nm)=>g.animations.find(a=>a.name===nm);
    const sRest=rtRest(s.scene,A(s,'TPose'));
    const measure=(root)=>{const b=rtBones(root);root.updateMatrixWorld(true);const h=b.Head.getWorldPosition(new THREE.Vector3()).y,f=Math.min(b.LeftFoot.getWorldPosition(new THREE.Vector3()).y,b.RightFoot.getWorldPosition(new THREE.Vector3()).y);return{top:h,foot:f}};
    const prep=(g,key,restClip,flip,height,yaw)=>{
      const rest=rtRest(g.scene,restClip);const clips={};
      for(const nm of['Idle','Walk','Run'])clips[nm]=flip===null?A(s,nm):retargetClip(s.scene,A(s,nm),sRest,g.scene,rest,flip);
      const mm=measure(g.scene);const scale=(height*.91)/(mm.top-mm.foot);
      g.scene.traverse(o=>{if(o.isMesh){o.castShadow=false;o.receiveShadow=false;if(o.material){const ms=Array.isArray(o.material)?o.material:[o.material];for(const mt of ms){if(mt.map)mt.map.anisotropy=4;if(mt.metalness!==undefined)mt.metalness=Math.min(mt.metalness,.15)}}}});
      CHARS[key]={scene:g.scene,clips,scale,yaw,lift:-mm.foot*scale};
    };
    prep(m,'male',null,true,1.8,0);prep(f,'female',A(f,'TPose'),true,1.68,0);prep(s,'soldier',A(s,'TPose'),null,1.86,PI);
    CHARS.ready=true;return true;
  }).catch(e=>{console.warn('Character models unavailable, using simple figures',e);return false});
}
// Accessories in world-ish units, parented to a bone with its world rotation/scale cancelled
function boneAttach(inner,bone,build){
  inner.updateMatrixWorld(true);const grp=new THREE.Group();
  const q=bone.getWorldQuaternion(new THREE.Quaternion()),s=bone.getWorldScale(new THREE.Vector3()),iq=inner.parent?inner.parent.getWorldQuaternion(new THREE.Quaternion()):new THREE.Quaternion();
  grp.quaternion.copy(q).invert().multiply(iq);grp.scale.set(1/s.x,1/s.y,1/s.z);bone.add(grp);build(grp);
  grp.traverse(o=>{if(o.isMesh)o.userData.own=true});return grp;
}
function makeHuman(cfg,hi){
  const look=Object.assign({},DEF_CHAR,cfg),key=look.unit==='swat'||look.unit==='army'?'soldier':look.frame===1?'female':'male',C0=CHARS[key];
  const g=new THREE.Group(),inner=THREE.SkeletonUtils.clone(C0.scene);inner.scale.multiplyScalar(C0.scale);inner.rotation.y=C0.yaw;inner.position.y=C0.lift;g.add(inner);
  const own=[];const tint=(o,hex,dropMap)=>{const m=o.material.clone();m.color.copy(C(hex));if(dropMap){m.map=null}m.needsUpdate=true;o.material=m;own.push(m)};
  const meshes={};inner.traverse(o=>{if(o.isMesh){meshes[o.name]=o;o.castShadow=!!hi;o.frustumCulled=true}});
  if(key==='male'){
    const custom=!look.orig;
    for(const nm in meshes){const o=meshes[nm],mn=o.material.name||'';
      if(mn==='Wolf3D_Skin'||mn==='Wolf3D_Body')tint(o,SKIN_TINT[look.skin%6],false);
      else if(mn==='Wolf3D_Outfit_Top'&&custom)tint(o,CLOTH[look.topColor],true);
      else if(mn==='Wolf3D_Outfit_Bottom'&&custom)tint(o,CLOTH[look.legsColor],true);
      else if(mn==='Wolf3D_Outfit_Footwear'&&custom)tint(o,CLOTH[look.shoesColor],true);
      else if(mn==='Wolf3D_Headwear')o.visible=OPTS.hat[look.hat]==='Fedora';
      else if(mn==='Wolf3D_Beard')o.visible=!!look.beard;
      else if(mn==='Wolf3D_Teeth')o.visible=false;
    }
  }else if(key==='soldier'){for(const nm in meshes)tint(meshes[nm],look.unit==='army'?'#a9ad7c':'#5d6068',false)}
  const bones=rtBones(inner);
  // accessories
  const ht=OPTS.hat[look.hat],gl=OPTS.glasses[look.glasses],hatM=lam(CLOTH[look.hatColor]);
  if(bones.Head&&key!=='soldier'){
    boneAttach(inner,bones.Head,grp=>{
      const fem=key==='female',top=fem?.25:.235,K=fem?1.12:1.17,hairM=new THREE.MeshStandardMaterial({color:C(HAIRC[look.hairColor]),roughness:.75,metalness:0}),hs=OPTS.hair[look.hair];
      const sph=(r,sx,sy,sz,m,x,y,z,rx)=>{const o=new THREE.Mesh(new THREE.SphereGeometry(r*K,18,12,0,TAU,0,PI*.55),m);o.scale.set(sx,sy,sz);o.position.set(x,y,z);if(rx)o.rotation.x=rx;grp.add(o);return o};
      if(!fem&&ht!=='Fedora'&&ht!=='Helmet'&&ht!=='Beanie'){
        if(hs==='Buzz')sph(.1,1,.85,1.1,hairM,0,top-.1,-.012,-.45);
        if(hs==='Short'||hs==='Long'||hs==='Ponytail')sph(.104,1.04,.82,1.12,hairM,0,top-.108,-.014,-.5);
        if(hs==='Long'){const b=new THREE.Mesh(new THREE.SphereGeometry(.12,12,10),hairM);b.scale.set(1,1.5,.55);b.position.set(0,top-.22,-.1);grp.add(b)}
        if(hs==='Ponytail'){const b=new THREE.Mesh(new THREE.SphereGeometry(.045,10,8),hairM);b.scale.set(1,2.4,1);b.position.set(0,top-.2,-.15);grp.add(b)}
        if(hs==='Mohawk'){const b=new THREE.Mesh(new THREE.BoxGeometry(.04,.08,.25),hairM);b.position.set(0,top-.015,-.015);grp.add(b)}
        if(hs==='Afro'){const b=new THREE.Mesh(new THREE.SphereGeometry(.175,14,10),hairM);b.scale.set(1,.9,1.02);b.position.set(0,top-.075,-.03);grp.add(b)}}
      if(ht==='Cap'||ht==='Police cap'){sph(.106,1.02,.82,1.1,hatM,0,top-.09,-.005,-.2);const b=new THREE.Mesh(new THREE.CylinderGeometry(.105,.105,.014,18),hatM);b.scale.z=.9;b.position.set(0,top-.075,.11);grp.add(b);
        if(ht==='Police cap'){const s=new THREE.Mesh(new THREE.BoxGeometry(.035,.035,.01),lam('#d9b84a'));s.position.set(0,top-.025,.128);grp.add(s)}}
      if(ht==='Beanie')sph(.108,1.02,1.12,1.1,hatM,0,top-.1,-.005,-.25);
      if(ht==='Bucket hat'){sph(.106,1,.8,1.06,hatM,0,top-.085,0);const b=new THREE.Mesh(new THREE.CylinderGeometry(.19,.2,.014,18),hatM);b.position.set(0,top-.085,0);grp.add(b)}
      if(ht==='Helmet')sph(.12,1,1,1.1,hatM,0,top-.11,0,-.2);
      if(gl!=='None'){const m=new THREE.MeshStandardMaterial({color:C(gl==='Shades'?'#0a0a0a':'#2e2412'),metalness:.6,roughness:.15});
        for(const s of[-1,1]){const l=new THREE.Mesh(new THREE.SphereGeometry(.03,10,8),m);l.scale.set(1.1,.75,.3);l.position.set(s*.038,top-.14,.112);grp.add(l)}
        const br=new THREE.Mesh(new THREE.BoxGeometry(.14,.007,.007),lam(gl==='Shades'?'#111':'#b8963a'));br.position.set(0,top-.127,.117);grp.add(br)}
    });
  }
  if(look.chain&&bones.Spine2&&key!=='soldier')boneAttach(inner,bones.Spine2,grp=>{const t=new THREE.Mesh(new THREE.TorusGeometry(.09,.008,6,20),new THREE.MeshStandardMaterial({color:C(look.chain===1?'#e1b84a':'#d0d4d8'),metalness:1,roughness:.25}));t.rotation.x=1.2;t.position.set(0,.06,.07);grp.add(t)});
  const mixer=new THREE.AnimationMixer(inner),acts={};
  for(const nm in C0.clips){const a=mixer.clipAction(C0.clips[nm]);a.play();a.setEffectiveWeight(nm==='Idle'?1:0);acts[nm]=a}
  mixer.setTime(Math.random()*2);
  const hold=new THREE.Group();g.add(hold);
  const blob=new THREE.Mesh(blobGeo,blobMat);blob.position.y=.03;g.add(blob);
  scene.add(g);
  return{skinned:true,g,inner,mixer,acts,w:{Idle:1,Walk:0,Run:0},bones,hold,guns:{},own,acc:0,key};
}
const _a=new THREE.Vector3(),_b=new THREE.Vector3(),_c=new THREE.Vector3(),_qa=new THREE.Quaternion(),_qb=new THREE.Quaternion(),_fw=new THREE.Vector3();
function aimBone(bone,child,dir,w){
  if(!bone||!child)return;bone.getWorldPosition(_a);child.getWorldPosition(_b);_b.sub(_a).normalize();
  _qa.setFromUnitVectors(_b,dir);if(w<1)_qa.slerp(_qb.identity(),1-w);
  bone.parent.getWorldQuaternion(_qb);const pinv=_qb.clone().invert();
  bone.quaternion.premultiply(pinv.multiply(_qa).multiply(_qb));bone.updateMatrixWorld(true);
}
function animHuman(p,mode,amt,speed,stance){
  const dt=frameDt,d=camera.position.distanceTo(p.g.position);
  const tgt=amt<=.05?'Idle':(speed||amt*3)>4.2?'Run':'Walk';
  for(const nm in p.acts){const goal=nm===tgt?1:0;p.w[nm]+=(goal-p.w[nm])*Math.min(1,dt*8);p.acts[nm].setEffectiveWeight(p.w[nm])}
  if(speed){p.acts.Walk.timeScale=clamp(speed/1.45,.4,2.2);p.acts.Run.timeScale=clamp(speed/6,.6,1.5)}
  p.acc+=dt;const every=d>70?4:d>35?2:1;p.tick=(p.tick||0)+1;
  if(p.tick%every===0||mode!=='walk'||stance){p.mixer.update(p.acc);p.acc=0}
  const B=p.bones,inner=p.inner;
  inner.rotation.x=0;inner.position.y=CHARS[p.key].lift;
  const yaw=p.g.rotation.y;_fw.set(Math.sin(yaw),0,Math.cos(yaw));
  if(stance==='crouch'||stance==='slide'||mode!=='walk')p.g.updateMatrixWorld(true);
  if(stance==='crouch'){inner.position.y-=.42;
    for(const s of['Left','Right']){aimBone(B[s+'UpLeg'],B[s+'Leg'],_c.copy(_fw).multiplyScalar(.8).add(_a.set(0,-.6,0)).normalize(),1);aimBone(B[s+'Leg'],B[s+'Foot'],_c.copy(_fw).multiplyScalar(-.45).add(_a.set(0,-.9,0)).normalize(),1)}
    if(B.Spine1)aimBone(B.Spine1,B.Neck,_c.copy(_fw).multiplyScalar(.35).add(_a.set(0,1,0)).normalize(),.8)}
  else if(stance==='slide'){inner.position.y-=.25;inner.rotation.x=-1.05;
    for(const s of['Left','Right']){aimBone(B[s+'UpLeg'],B[s+'Leg'],_c.copy(_fw).add(_a.set(0,-.15,0)).normalize(),1)}}
  if(mode==='aim1'||mode==='aim2'||mode==='rpg'||mode==='punch'){
    const ad=_c.copy(_fw).add(_a.set(0,mode==='rpg'?.05:-.02,0)).normalize();const dir=ad.clone();
    aimBone(B.RightArm,B.RightForeArm,dir,1);aimBone(B.RightForeArm,B.RightHand,dir,1);
    if(mode!=='aim1'&&mode!=='punch'&&B.LeftArm&&B.RightHand){B.RightHand.getWorldPosition(_b);_b.addScaledVector(_fw,.22);B.LeftArm.getWorldPosition(_a);const ld=_b.clone().sub(_a).normalize();aimBone(B.LeftArm,B.LeftForeArm,ld,1);B.LeftForeArm.getWorldPosition(_a);aimBone(B.LeftForeArm,B.LeftHand,_b.clone().sub(_a).normalize(),1)}
  }
  if(mode==='jump'&&B.LeftUpLeg){aimBone(B.LeftUpLeg,B.LeftLeg,_c.copy(_fw).multiplyScalar(.6).add(_a.set(0,-.8,0)).normalize(),.8)}
  // gun follows the right hand
  if(B.RightHand){B.RightHand.getWorldPosition(_b);p.g.worldToLocal(_b);p.hold.position.copy(_b);const aiming=mode==='aim1'||mode==='aim2'||mode==='rpg';p.hold.rotation.set(aiming?-PI/2:-.15,0,0)}
}
function makePerson(cfg,hi){return CHARS.ready?makeHuman(cfg,hi):makeFigure(cfg,hi)}
function animPerson(p,ph,mode,amt,speed,stance){if(p.skinned)animHuman(p,mode,amt,speed,stance);else animFigure(p,ph,mode,amt)}
function disposePerson(m){if(!m.skinned){disposeFigure(m);return}scene.remove(m.g);m.mixer.stopAllAction();m.mixer.uncacheRoot(m.inner);for(const mt of m.own)mt.dispose();
  m.g.traverse(o=>{if(o.isSkinnedMesh&&o.skeleton&&o.skeleton.boneTexture){o.skeleton.boneTexture.dispose()}if(o.isMesh&&o.userData.own){o.geometry.dispose()}})}

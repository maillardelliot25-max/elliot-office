
// ===================== Audio (all synthesized) =====================
let actx=null,master,musicBus,noiseBuf,engO,engO2,engG,sirO,sirG,heliG,skidG;
function initAudio(){
  if(actx){if(actx.state==='suspended')actx.resume();return}
  try{
    actx=new(window.AudioContext||window.webkitAudioContext)();
    master=actx.createGain();master.gain.value=save.settings.vol;master.connect(actx.destination);
    musicBus=actx.createGain();musicBus.gain.value=0;musicBus.connect(master);
    noiseBuf=actx.createBuffer(1,actx.sampleRate*2,actx.sampleRate);const d=noiseBuf.getChannelData(0);for(let i=0;i<d.length;i++)d[i]=Math.random()*2-1;
    const lp=actx.createBiquadFilter();lp.type='lowpass';lp.frequency.value=600;engG=actx.createGain();engG.gain.value=0;
    engO=actx.createOscillator();engO.type='sawtooth';engO2=actx.createOscillator();engO2.type='square';const g2=actx.createGain();g2.gain.value=.4;
    engO.connect(lp);engO2.connect(g2).connect(lp);lp.connect(engG).connect(master);engO.start();engO2.start();
    sirO=actx.createOscillator();sirO.type='square';sirG=actx.createGain();sirG.gain.value=0;const sl=actx.createBiquadFilter();sl.type='lowpass';sl.frequency.value=1700;sirO.connect(sl).connect(sirG).connect(master);sirO.start();
    const hn=actx.createBufferSource();hn.buffer=noiseBuf;hn.loop=true;const hl=actx.createBiquadFilter();hl.type='lowpass';hl.frequency.value=180;heliG=actx.createGain();heliG.gain.value=0;hn.connect(hl).connect(heliG).connect(master);hn.start();
    const sn=actx.createBufferSource();sn.buffer=noiseBuf;sn.loop=true;const sb=actx.createBiquadFilter();sb.type='bandpass';sb.frequency.value=1400;sb.Q.value=2;skidG=actx.createGain();skidG.gain.value=0;sn.connect(sb).connect(skidG).connect(master);sn.start();
  }catch(e){actx=null}
}
function burst(vol,dur,freq,type='lowpass',at){if(!actx)return;const t=at||actx.currentTime,s=actx.createBufferSource();s.buffer=noiseBuf;s.playbackRate.value=rand(.9,1.1);const f=actx.createBiquadFilter();f.type=type;f.frequency.value=freq;const g=actx.createGain();g.gain.setValueAtTime(vol,t);g.gain.exponentialRampToValueAtTime(.001,t+dur);s.connect(f).connect(g).connect(at?musicBus:master);s.start(t,rand(0,1));s.stop(t+dur+.05)}
function tone(freq,dur,type,vol,at,dest,slide){if(!actx)return;const t=at||actx.currentTime,o=actx.createOscillator(),g=actx.createGain();o.type=type;o.frequency.setValueAtTime(freq,t);if(slide)o.frequency.exponentialRampToValueAtTime(slide,t+dur);g.gain.setValueAtTime(vol,t);g.gain.exponentialRampToValueAtTime(.001,t+dur);o.connect(g).connect(dest||master);o.start(t);o.stop(t+dur+.02)}
let lastCrash=0;
const sfx={
  gun(id,dist){const v=clamp(1-dist/120,.05,1);const p={pistol:[.5,.16,2200,140],heavy:[.65,.2,1700,110],smg:[.35,.09,2600,160],shotgun:[.85,.38,1000,80],rifle:[.55,.15,2100,120],battle:[.7,.2,1700,95],sniper:[1,.5,1300,70],rpg:[.6,.6,500,60]}[id]||[.4,.12,2000,140];burst(p[0]*v,p[1],p[2]);tone(p[3],.09,'sine',.32*v,0,null,40);if(id==='sniper'&&actx)burst(.25*v,.9,600,'lowpass',actx.currentTime+.12)},
  boom(d){const v=clamp(1-d/220,.08,1);burst(1.2*v,1.4,420);tone(70,.9,'sine',.8*v,0,null,25)},
  crash(imp){const t=performance.now();if(t-lastCrash<140)return;lastCrash=t;burst(clamp(imp/22,.06,.7),.35,900);tone(110,.15,'square',clamp(imp/60,.02,.12),0,null,50)},
  hit(){burst(.25,.08,700)},thud(){tone(90,.12,'sine',.25,0,null,50)},punch(){burst(.3,.07,500);tone(160,.06,'sine',.25,0,null,70)},
  pickup(){tone(880,.12,'triangle',.18);tone(1320,.18,'triangle',.15,actx&&actx.currentTime+.08)},click(){tone(1200,.04,'square',.06)},door(){burst(.25,.12,600);tone(200,.08,'square',.06)},
  reload(){if(!actx)return;const t=actx.currentTime;burst(.2,.05,3000,'highpass');tone(900,.04,'square',.05,t+.25);burst(.25,.06,2500,'highpass',t+.5)},
  radio(){if(!actx)return;const t=actx.currentTime;burst(.12,.18,2200,'bandpass');tone(1400,.06,'square',.04,t+.05)},
  slide(){burst(.3,.5,700)},
  horn(){if(!actx)return;tone(330,.45,'square',.07);tone(415,.45,'square',.06)},
};
// Radio: two procedural stations
const STATIONS=[{name:'Palm FM 98.6',bpm:104,kind:'synth'},{name:'West Coast 104',bpm:88,kind:'hiphop'},{name:'Radio off'}];
const radio={st:0,step:0,next:0};
const N2F=n=>440*Math.pow(2,(n-69)/12);
const PROG={synth:[57,53,48,55],hiphop:[50,53,48,45]};
function radioStep(st,s,t){
  const bar=Math.floor(s/16)%4,k=s%16,root=PROG[st.kind][bar],B=musicBus;
  if(st.kind==='synth'){
    if(k%4===0)tone(150,.18,'sine',.5,t,B,45);if(k===4||k===12)burst(.18,.18,1800,'highpass',t);if(k%2===0)burst(.05,.04,7000,'highpass',t);
    if(k%2===0)tone(N2F(root-12),.2,'sawtooth',.12,t,B);
    const arp=[0,3,7,12,7,3,0,7];tone(N2F(root+12+arp[k%8]+(bar===1||bar===2?(arp[k%8]===3?1:0):0)),.12,'square',.04,t,B);
    if(k===0)for(const iv of[0,4,7])tone(N2F(root+iv+(iv===4&&(bar===0)?-1:0)),1.6,'triangle',.03,t,B);
  }else{
    if(k===0||k===7||k===10)tone(120,.25,'sine',.6,t,B,40);if(k===4||k===12)burst(.25,.2,1500,'highpass',t);
    if(k%2===0)burst(k%4===2?.06:.04,.05,8000,'highpass',t+(k%4===2?.03:0));
    if(k===0||k===10)tone(N2F(root-12),.5,'sine',.3,t,B);
    if(k===0||k===6)for(const iv of[0,3,7,10])tone(N2F(root+12+iv),.35,'triangle',.025,t,B);
  }
}
function radioTick(){
  if(!actx)return;const t=actx.currentTime,on=player.car&&radio.st<2&&state==='play';
  musicBus.gain.setTargetAtTime(on?save.settings.music*.6:0,t,.3);
  if(!on){radio.next=t+.05;return}
  const st=STATIONS[radio.st],spb=60/st.bpm/4;
  if(radio.next<t)radio.next=t+.02;
  while(radio.next<t+.15){radioStep(st,radio.step,radio.next);radio.step=(radio.step+1)%64;radio.next+=spb}
}
function radioShow(){const r=$('radio');r.hidden=!player.car;r.textContent=STATIONS[radio.st].name+(coarse?'':' · R')}
function radioNext(){if(!player.car)return;radio.st=(radio.st+1)%STATIONS.length;radio.step=0;radioShow();toast(STATIONS[radio.st].name,'job',1.2)}
function audioFrame(){
  if(!actx)return;const t=actx.currentTime,c=player.car,sp=c?Math.abs(c.v):0,live=state==='play';
  const gear=sp%11/11;engO.frequency.setTargetAtTime(32+sp*2.6+gear*28+(c&&c.boost?20:0),t,.05);engO2.frequency.setTargetAtTime((32+sp*2.6+gear*28)*.5,t,.05);
  engG.gain.setTargetAtTime(c&&live&&!c.burnt?.05+Math.min(.04,sp*.001):0,t,.1);
  let nd=1e9;for(const v of vehicles)if(v.kind==='police'&&(v.driver||v.lights)&&wanted>0)nd=Math.min(nd,Math.hypot(v.x-player.x,v.z-player.z));
  if(c&&c.kind==='police')nd=0;
  sirO.frequency.setTargetAtTime(760+260*Math.sin(t*TAU*.9),t,.02);sirG.gain.setTargetAtTime(live&&nd<140?.02*(1-nd/140):0,t,.1);
  let hd=1e9;for(const h of helis)hd=Math.min(hd,Math.hypot(h.x-player.x,h.z-player.z,h.y-player.y));heliG.gain.setTargetAtTime(live&&hd<200?(.25*(1-hd/200))*(.6+.4*Math.sin(t*TAU*14)):0,t,.01);
  skidG.gain.setTargetAtTime(live&&c&&c.slip>5&&sp>4?Math.min(.12,(c.slip-5)*.02):0,t,.05);
  radioTick();
}

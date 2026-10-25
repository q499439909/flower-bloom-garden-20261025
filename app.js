import {launchCamera} from './camera-launch.js';
import {createVisionClient} from './vision-client.js';
import {createSequenceCache} from './sequence-cache.js';
import {pinchRatio,drawTracking} from './tracking.js';
import {createSwipeDetector,isOpenPalm} from './swipe.js';
import {createHandRoleTracker} from './hand-roles.js';
const $=id=>document.getElementById(id);
const canvas=$('flower'),ctx=canvas.getContext('2d'),video=$('video'),overlay=$('tracking');
const clamp=v=>Math.max(0,Math.min(1,v));
const flowers=[
 {name:'锦绣年华',latin:'Blooming Splendor',blessing:['一朵牡丹，盛开满怀锦绣，','一程岁月，珍藏所有温柔。','愿你所行皆坦途，所遇皆美好，','岁岁欢喜，年年花开。'],keywords:'圆满 · 繁盛',displayScale:1.44,path:'peony-full-display',accent:'#e4b4bd',count:169,digits:4,width:1112,height:834},
 {name:'暖阳予你',latin:'A Little Sunshine',blessing:['采一束阳光，藏进金色花瓣，','把温暖与欢喜，轻轻送到你身旁。','愿你眼里常有光，心中常有暖，','一路明媚，自在芬芳。'],keywords:'温暖 · 陪伴',displayScale:1.44,path:'rose-full-display',accent:'#e9cb79',count:169,digits:5,width:1112,height:834},
 {name:'春日来信',latin:'Letters from Spring',blessing:['春风寄来一封信，','写满温柔与新生。','愿所有美好如约而至，','所有期待次第花开。'],keywords:'希望 · 新启',displayScale:1,path:'spring-letter-display',accent:'#c7bcdf',count:95,digits:5,width:834,height:1112}
];
let selected=0,target=0,current=0,shown=-1,mode='hand';
let stream=null,active=false,starting=false,manual=false,raw=null,lastSeen=0;
let lastVideo=-1,lastDetect=0,busy=false,visionClient=null,processingVision=false,visionEpoch=0;
const defaults={hand:[.08,1.2],smile:[.08,.65]},ranges={hand:[...defaults.hand],smile:[...defaults.smile]};
const swipe=createSwipeDetector(),handRoles=createHandRoleTracker();
const transitionCanvas=$('flower-transition'),transitionCtx=transitionCanvas.getContext('2d');
let transitionPending=false,transitionStarted=null,transitionOpacity=0,playback=null,calibrationClosed=null,faceSeen=false;
function containDraw(context,source,width,height){
 const scale=Math.min(width/source.width,height/source.height),w=source.width*scale,h=source.height*scale;
 context.drawImage(source,(width-w)/2,(height-h)/2,w,h);
}
function snapshotFlower(){
 const bounds=canvas.parentElement.getBoundingClientRect();
 const snapshot=document.createElement('canvas');snapshot.width=Math.max(1,Math.round(bounds.width*devicePixelRatio));snapshot.height=Math.max(1,Math.round(bounds.height*devicePixelRatio));
 const context=snapshot.getContext('2d');context.fillStyle='#000';context.fillRect(0,0,snapshot.width,snapshot.height);containDraw(context,canvas,snapshot.width,snapshot.height);
 if(!transitionCanvas.hidden){context.globalAlpha=transitionOpacity;context.drawImage(transitionCanvas,0,0,snapshot.width,snapshot.height);}
 transitionCanvas.width=snapshot.width;transitionCanvas.height=snapshot.height;transitionCtx.drawImage(snapshot,0,0);
 transitionCanvas.hidden=false;transitionCanvas.style.opacity='1';transitionOpacity=1;transitionPending=true;transitionStarted=null;
}
function resumeInteraction(){playback=null;manual=false;lastSeen=0;raw=null;swipe.reset();$('resume').hidden=true;$('home-play').textContent='播放花开 ▷';}
function updateModeBusy(){
 for(const id of ['hand','smile','home-hand','home-smile'])$(id).disabled=busy||starting;
}
function syncHomeStatus(){
 setText('home-control-state',$('role-control').textContent.replace(/^[①②] /,'').replace('已锁定','已识别'));
 setText('home-switch-state',$('role-switch').textContent.replace(/^[①②] /,'').replace('已锁定','已识别'));
 $('home-camera').hidden=active||starting;
 if(starting||busy)setText('home-swipe-title','正在准备'+(mode==='hand'?'手势':'微笑')+'识别…');
 if(playback){setText('home-swipe-title',playback.finished?'花已盛放 · 点击恢复互动':'正在播放花开…');$('home-recognition').dataset.state='playing';}
}

function status(text){const notice=$('status');notice.textContent=text;notice.hidden=!/失败|无法启动|未找到摄像头|请在浏览器|请先开启|识别暂时|已记录|两个状态|已恢复默认|分工已重置/.test(text);}
function selectFlower(index){
 const next=(index+flowers.length)%flowers.length;if(next===selected&&shown!==-1)return;
 if(shown!==-1)snapshotFlower();selected=next;shown=-1;
 const f=flowers[selected];canvas.width=f.width;canvas.height=Math.ceil(f.height*Math.max(1,.8*f.displayScale));document.documentElement.style.setProperty('--flower-accent',f.accent);
 $('letter-name').textContent=f.name;$('letter-english').textContent=f.latin;
 $('letter-blessing').replaceChildren(...f.blessing.map(line=>{const p=document.createElement('p');p.textContent=line;return p;}));
 $('letter-keywords').textContent='关键词：'+f.keywords;
 if(!matchMedia('(prefers-reduced-motion: reduce)').matches)$('flower-letter').animate([{opacity:0,transform:'translateY(6px)'},{opacity:1,transform:'translateY(0)'}],{duration:650,easing:'ease-out'});
 canvas.setAttribute('aria-label',`随动作绽放的${f.name}`);
 for(let i=0;i<flowers.length;i++){$('flower-'+i).classList.toggle('selected',selected===i);$('flower-'+i).setAttribute('aria-pressed',String(selected===i));}
}
flowers.forEach((_,i)=>{$('flower-'+i).onclick=()=>selectFlower(i);});
$('previous-flower').onclick=()=>selectFlower(selected-1);$('next-flower').onclick=()=>selectFlower(selected+1);
selectFlower(0);
const frameUrl=(flower,index)=>`assets/${flower.path}/frame_${String(index+1).padStart(flower.digits,'0')}.jpg`;
const frameCache=createSequenceCache({onError:()=>{status('部分花朵图片加载失败，请刷新页面重试。');}});
// Prime every flower so a switch can immediately display a cached frame.
frameCache.request(flowers.flatMap(f=>[0,1,f.count-1].map(n=>frameUrl(f,n))));
let lastRequestKey='',lastPercent=-1;
function animate(now=performance.now()){
 if(playback&&!playback.finished){const progress=clamp((now-playback.start)/6000);target=progress*progress*(3-2*progress);if(progress===1){playback.finished=true;target=1;syncHomeStatus();}}
 current+=(target-current)*.16;if(Math.abs(target-current)<.001)current=target;
 const flower=flowers[selected],n=Math.round(clamp(current)*(flower.count-1));
 const nearby=[n];for(let d=1;d<=6;d++){if(n+d<flower.count)nearby.push(n+d);if(n-d>=0)nearby.push(n-d);}
 const requestKey=`${selected}:${n}`;
 if(requestKey!==lastRequestKey||!frameCache.get(frameUrl(flower,n))){frameCache.request(nearby.map(i=>frameUrl(flower,i)));lastRequestKey=requestKey;}
 let image=null,renderIndex=n;
 for(let d=0;d<(transitionPending?1:flower.count)&&!image;d++)for(const i of d===0?[n]:[n-d,n+d]){
  if(i<0||i>=flower.count)continue;
  const cached=frameCache.get(frameUrl(flower,i));if(cached){image=cached;renderIndex=i;break;}
 }
 $('loading').hidden=!!image||!transitionCanvas.hidden;
 if(image&&renderIndex!==shown){
  if(transitionPending){transitionPending=false;transitionStarted=now;}
  shown=renderIndex;const scale=.8*flower.displayScale,width=flower.width*scale,height=flower.height*scale;
  ctx.clearRect(0,0,canvas.width,canvas.height);ctx.drawImage(image,(canvas.width-width)/2,(canvas.height-height)/2,width,height);
 }
 if(transitionStarted!==null){
  const progress=matchMedia('(prefers-reduced-motion: reduce)').matches?1:clamp((now-transitionStarted)/650);
  transitionOpacity=1-progress*progress*(3-2*progress);transitionCanvas.style.opacity=String(transitionOpacity);
  if(progress===1){transitionCanvas.hidden=true;transitionStarted=null;}
 }
 const percent=Math.round(current*100);
 if(percent!==lastPercent){
  const percentage=`${percent}<small>%</small>`;$('control-percent').innerHTML=percentage;
  if(!manual)$('openness').value=percent;lastPercent=percent;
 }
 requestAnimationFrame(animate);
}animate();
async function modelForMode(){
 if(!visionClient)visionClient=createVisionClient();
 await visionClient.request('init',{mode});
}
function clearTracking(){drawTracking(overlay,null,mode,video.videoWidth||640,video.videoHeight||480);$('tracking-value').textContent='';}
function setText(id,text){if($(id).textContent!==text)$(id).textContent=text;}
function showSwipeGuide(result,roles=null){
 const second=mode==='hand'?'第二只手':'切花的手';
 const messages={
  off:['先开启摄像头',mode==='hand'?'第一只手控制花开；第二只手张掌准备切花。':'笑容控制花开；一只手张掌准备切花。'],
  paused:['手动预览中','点击「恢复摄像头控制」后，继续识别双手。'],
  first:['先伸入第一只手','先只伸入一只手，锁定为花开控制手，再伸入第二只手。'],
  waiting:[mode==='hand'?'等待第二只手':'伸入一只手准备切花',mode==='hand'?'第一只手捏合控制花开；把第二只手放入画面。':'笑容控制花开；手掌准备好后会出现绿色提示。'],
  open:[`张开${second}`,`将${second}的掌心朝向镜头，手指自然展开。`],
  arming:['正在准备切花…','保持张掌一小会儿，等下方进度条走满。'],
  ready:['可以挥动了  ← →','向左或向右挥动，进度条走满就切换花朵。'],
  switched:['已切换 · '+flowers[selected].name,'稍作停顿，等待再次出现绿色就绪提示。'],
  cooldown:['切换完成 · 稍等一下','保持手掌在画面中，很快可以再次准备。']
 };
 const [title,help]=messages[result.state]||messages.waiting;
 $('home-recognition').dataset.state=result.state;
 setText('home-swipe-title',title);
 $('home-progress-fill').style.width=`${Math.round(result.progress*100||0)}%`;
 $('home-progress').setAttribute('aria-valuenow',String(Math.round(result.progress*100||0)));
 $('swipe-guide').dataset.state=result.state;setText('swipe-title',title);setText('swipe-help',help);
 $('swipe-progress-fill').style.width=`${Math.round(result.progress*100||0)}%`;
 $('swipe-progress').setAttribute('aria-valuenow',String(Math.round(result.progress*100||0)));
 if(roles){
  setText('role-control',mode==='smile'?(faceSeen?'笑容 · 已识别':lastSeen?'笑容 · 暂时离开':'笑容 · 等待入镜'):roles.control?'① 花开手 · 已锁定':roles.assigned[0]?'① 花开手 · 暂时离开':'① 花开手 · 等待入镜');
  setText('role-switch',mode==='smile'?(roles.switcher?'手掌切花 · 已识别':'手掌切花 · 等待入镜'):roles.switcher?'② 切花手 · 已识别':roles.assigned[1]?'② 切花手 · 暂时离开':'② 切花手 · 等待入镜');
 }
 syncHomeStatus();
}
function resetHandRoles(){
 faceSeen=false;visionEpoch++;handRoles.reset();swipe.reset();clearTracking();raw=null;
 setText('role-control',mode==='hand'?'① 花开手 · 等待入镜':'笑容控制花开');
 setText('role-switch',mode==='hand'?'② 切花手 · 等待入镜':'手掌切花 · 等待入镜');
 showSwipeGuide({state:active?(manual?'paused':mode==='hand'?'first':'waiting'):'off',progress:0});
}
$('reset-hand-roles').onclick=()=>{resetHandRoles();status('分工已重置，请先只伸入一只手，再伸入第二只手。');};
async function track(now){
 requestAnimationFrame(track);
 if(!active||starting||busy||manual||processingVision||video.readyState<2||now-lastDetect<40||lastVideo===video.currentTime)return;
 if(!visionClient)return;
 lastDetect=now;lastVideo=video.currentTime;processingVision=true;
 const epoch=visionEpoch,requestedMode=mode;
 try{
  let value=null;
  const w=video.videoWidth,h=video.videoHeight;
  const bitmap=await createImageBitmap(video);
  const result=await visionClient.request('frame',{bitmap,time:now,mode:requestedMode},[bitmap]);
  if(!active||manual||mode!==requestedMode||visionEpoch!==epoch)return;
  clearTracking();const hands=result.hands;
  let roles;
  if(mode==='hand')roles=handRoles.update(hands.landmarks,hands.handedness,now);
  else roles={control:null,switcher:hands.landmarks[0]?{points:hands.landmarks[0],id:hands.handedness[0]?.[0]?.categoryName||'smile-hand'}:null,needsFirst:false,assigned:[false,!!hands.landmarks[0]]};
  let swipeState;
  if(roles.switcher){
   const points=roles.switcher.points,palm=[0,5,9,13,17].map(i=>points[i]);
   swipeState=swipe.update({x:1-palm.reduce((s,p)=>s+p.x,0)/5,y:palm.reduce((s,p)=>s+p.y,0)/5,time:now,id:roles.switcher.id,open:isOpenPalm(points,w,h)});
   if(swipeState.direction&&!playback)selectFlower(selected+swipeState.direction);
  }else{
   swipeState=swipe.update({time:now,present:false});
   if(roles.needsFirst&&swipeState.state!=='cooldown')swipeState={state:'first',progress:0};
  }
  faceSeen=!!result.expression?.faceBlendshapes?.[0]?.categories;
  showSwipeGuide(swipeState,roles);
  if(roles.control){
   drawTracking(overlay,roles.control.points,'hand',w,h,{clear:false,role:'pinch',caption:'① 花开手'});
   value=pinchRatio(roles.control.points,w,h);
  }
  if(roles.switcher){
   const cue={arming:'准备中…',ready:'已就绪 ← →',open:'请张开手掌',switched:'切换成功',cooldown:'稍等一下'}[swipeState.state]||'切花手';
   drawTracking(overlay,roles.switcher.points,'hand',w,h,{clear:false,role:'switch',caption:(mode==='hand'?'② ':'')+cue,ready:swipeState.state==='ready'});
  }
  if(mode==='smile'){
   const expression=result.expression,categories=expression?.faceBlendshapes?.[0]?.categories;
   if(categories){
    const score=name=>categories.find(c=>c.categoryName===name)?.score??0;
    value=(score('mouthSmileLeft')+score('mouthSmileRight'))/2;
    if(expression.faceLandmarks?.[0])drawTracking(overlay,expression.faceLandmarks[0],'smile',w,h,{clear:false});
   }
  }
  if(value!==null){
   raw=value;lastSeen=now;const [lo,hi]=ranges[mode];if(!playback)target=clamp((raw-lo)/(hi-lo));
   $('tracking-value').textContent=mode==='hand'?`① 花开手 · 指尖张开 ${Math.round(target*100)}%`:`笑容 ${Math.round(target*100)}%`;
   status(mode==='hand'?'第一只手已锁定控制花开；第二只手张掌，等待绿色就绪提示后挥动切花。':'嘴角控制花开；张开一只手掌，等待绿色就绪提示后挥动切花。');
   $('camera-tag').textContent=mode==='hand'?'● 按入镜顺序分配双手':'● 笑容控制花开';
  }else{
   raw=null;
   if(now-lastSeen>900){status(mode==='hand'?(roles.assigned[0]?'花开手暂时离开，花朵保持当前状态。第二只手仍可切花。':'请先只伸入一只手，锁定花开控制手，再伸入第二只手。'):'请面向镜头，让整张脸进入画面；手掌仍可准备切花。');$('camera-tag').textContent='寻找'+(mode==='hand'?'花开手':'面部')+'中';}
  }
 }catch(e){if(active&&epoch===visionEpoch){stopCamera();status('识别暂时出错，请重新开启摄像头。');console.error(e);}}finally{processingVision=false;}
}requestAnimationFrame(track);
async function setMode(next){
 if(next===mode||busy||starting)return;
 resumeInteraction();mode=next;if($('calibration-dialog').open)$('calibration-dialog').close();resetHandRoles();$('reset-hand-roles').hidden=mode!=='hand';raw=null;lastSeen=0;lastVideo=-1;
 for(const name of ['hand','smile'])for(const id of [name,'home-'+name]){$(id).classList.toggle('active',name===mode);$(id).setAttribute('aria-pressed',String(name===mode));}
 $('home-calibrate').textContent=mode==='hand'?'校准手势 ↗':'校准微笑 ↗';
 $('home-instruction').innerHTML=mode==='hand'?'第一只手：拇指与食指捏合控制花开。<br>第二只手：张掌后左右挥动切花。':'自然表情含苞，笑得越开心，花开越盛。<br>一只手张掌后左右挥动切花。';
 $('instruction').textContent=mode==='hand'?'第一只手捏合控制花开。第二只手张掌，等绿色就绪提示后左右挥动切花。':'笑容控制花开。张开一只手掌，等绿色就绪提示后左右挥动切花。';
 $('calibration-help').textContent=mode==='hand'?'先捏合拇指与食指，点击「设为合拢」；再分开两指，点击「设为盛开」。':'先保持自然表情，点击「设为合拢」；再露出大大的笑容，点击「设为盛开」。';
 if(active){busy=true;updateModeBusy();syncHomeStatus();status('正在准备'+(mode==='hand'?'手势':'笑容')+'识别…');try{await modelForMode();}catch(e){stopCamera();status('识别模型加载失败，请重新开启摄像头。');console.error(e);}finally{busy=false;updateModeBusy();}}
}
$('hand').onclick=$('home-hand').onclick=()=>setMode('hand');$('smile').onclick=$('home-smile').onclick=()=>setMode('smile');
function stopCamera(){
 active=false;resetHandRoles();$('reset-hand-roles').disabled=true;stream?.getTracks().forEach(t=>t.stop());stream=null;video.srcObject=null;raw=null;
 $('camera-placeholder').hidden=false;$('camera-tag').textContent='摄像头未开启';$('start').innerHTML='摄像头设置 <span>↗</span>';$('resume').hidden=true;manual=false;
}
const consent=$('camera-consent');
const consentMessage='用手势或笑容让花绽放。画面仅在当前浏览器处理，不上传、不录制，也不使用麦克风。';
function showCameraConsent(reason='prompt'){
 $('camera-consent-message').textContent=reason==='denied'?'摄像头权限当前被关闭。请先在浏览器的网站权限中允许摄像头，再点击下方按钮。':reason==='prompt'?consentMessage:reason;
 $('camera-allow').textContent='同意并开启';$('camera-allow').disabled=false;$('camera-later').disabled=false;
 if(!consent.open)consent.showModal();
}
async function startCamera(){
 if(active)return true;if(starting)return false;
 starting=true;updateModeBusy();syncHomeStatus();$('start').disabled=true;$('camera-allow').disabled=true;$('camera-later').disabled=true;
 $('camera-allow').textContent='正在连接…';
 try{
  if(!navigator.mediaDevices?.getUserMedia)throw new Error('请在 localhost 或 HTTPS 地址中打开此页面。');
  stream=await navigator.mediaDevices.getUserMedia({video:{width:{ideal:640},height:{ideal:480},facingMode:'user'},audio:false});
  video.srcObject=stream;await video.play();await modelForMode();
  active=true;manual=false;lastSeen=0;lastVideo=-1;resetHandRoles();$('reset-hand-roles').disabled=false;
  $('camera-placeholder').hidden=true;$('start').innerHTML='关闭摄像头 <span>×</span>';
  if(consent.open)consent.close();status('摄像头已开启，请进入画面。');return true;
 }catch(e){
  stopCamera();
  const message=e.name==='NotAllowedError'?'请在浏览器的网站权限中允许摄像头，再点击重试。':e.name==='NotFoundError'?'未找到摄像头，请连接后重试。':'无法启动：'+e.message;
  showCameraConsent(message);status(message);console.error(e);return false;
 }finally{starting=false;updateModeBusy();syncHomeStatus();$('start').disabled=false;$('camera-allow').disabled=false;$('camera-later').disabled=false;$('camera-allow').textContent='同意并开启';}
}
$('start').onclick=()=>{if(active){stopCamera();status('摄像头已关闭。');}else showCameraConsent();};
$('camera-allow').onclick=()=>startCamera();
$('camera-later').onclick=()=>{if(!starting){consent.close();syncHomeStatus();}};
$('home-camera').onclick=()=>showCameraConsent();
consent.addEventListener('cancel',event=>{if(starting)event.preventDefault();});
$('openness').oninput=e=>{resumeInteraction();manual=true;clearTracking();swipe.reset();showSwipeGuide({state:active?'paused':'off',progress:0});target=Number(e.target.value)/100;raw=null;$('resume').hidden=!active;status(active?'正在手动预览 · 点击「恢复摄像头控制」继续互动。':'正在手动预览 · 可点击花种切换，或开启摄像头互动。');};
$('resume').onclick=()=>{resumeInteraction();manual=false;raw=null;lastSeen=0;swipe.reset();showSwipeGuide({state:'waiting',progress:0});$('resume').hidden=true;status('已恢复摄像头控制。');};
for(const [id,index] of [['closed',0],['opened',1]])$(id).onclick=()=>{
 if(!active||manual||raw===null||performance.now()-lastSeen>500){status('请先开启摄像头、恢复识别，并保持'+(mode==='hand'?'手掌':'面部')+'在画面内。');return;}
 const next=[...ranges[mode]];next[index]=raw;
 if(next[1]-next[0]<.05){status('两个状态太接近。请先重置，再分别保持合拢和盛开动作进行校准。');return;}
 ranges[mode]=next;status(index===0?'已记录合拢状态，再做盛开动作并点击「设为盛开」。':'已记录盛开状态，试试现在的开花效果。');
};
$('reset').onclick=()=>{ranges[mode]=[...defaults[mode]];status('当前模式已恢复默认灵敏度。');};
$('home-play').onclick=()=>{
 if(playback){resumeInteraction();showSwipeGuide({state:active?(mode==='hand'?'first':'waiting'):'off',progress:0});return;}
 manual=false;$('resume').hidden=true;swipe.reset();current=0;target=0;playback={start:performance.now(),finished:false};
 $('home-play').textContent='恢复互动 ↗';syncHomeStatus();
};
$('home-calibrate').onclick=()=>{
 resumeInteraction();calibrationClosed=null;$('home-opened').disabled=true;
 $('home-reassign').hidden=mode!=='hand';
 $('calibration-title').textContent=mode==='hand'?'校准指尖':'校准微笑';
 $('home-calibration-help').textContent=mode==='hand'?'先捏合花开手的拇指与食指，记录合拢；再自然分开两指，记录盛开。':'先保持自然表情，记录合拢；再露出大大的笑容，记录盛开。';
 $('calibration-feedback').textContent=active?'请保持'+(mode==='hand'?'花开手':'面部')+'在镜头内。':'请先开启摄像头，再进行校准。';
 $('calibration-dialog').showModal();
};
for(const [id,index] of [['home-closed',0],['home-opened',1]])$(id).onclick=()=>{
 const feedback=$('calibration-feedback');
 if(!active||manual||raw===null||performance.now()-lastSeen>500){feedback.textContent='尚未识别到'+(mode==='hand'?'花开手，请先让第一只手进入画面。':'面部，请面向镜头。');return;}
 if(index===0){calibrationClosed=raw;$('home-opened').disabled=false;feedback.textContent=mode==='hand'?'已记录合拢。请分开拇指与食指，再记录盛开。':'已记录自然表情。请露出大大的笑容，再记录盛开。';return;}
 if(raw-calibrationClosed<.05){feedback.textContent='两个状态太接近，请'+(mode==='hand'?'将两指分开一些。':'笑得更明显一些。');return;}
 ranges[mode]=[calibrationClosed,raw];feedback.textContent='校准完成，已应用新的灵敏度。';
};
$('home-reassign').onclick=()=>{resetHandRoles();calibrationClosed=null;$('home-opened').disabled=true;$('calibration-feedback').textContent='已重置分工。先只伸入花开手，再伸入切花手。';};
$('home-reset').onclick=()=>{ranges[mode]=[...defaults[mode]];calibrationClosed=null;$('home-opened').disabled=true;$('calibration-feedback').textContent='已恢复默认灵敏度。';};
$('calibration-close').onclick=()=>$('calibration-dialog').close();
resetHandRoles();
window.addEventListener('pagehide',stopCamera);

// New visits and refreshes open on the uncluttered garden screen.
if(!location.hash){history.scrollRestoration='manual';requestAnimationFrame(()=>window.scrollTo(0,0));}

// Existing browser consent starts the camera immediately; otherwise ask on screen one.
launchCamera({
 queryPermission:async()=>{if(!navigator.permissions?.query)return 'prompt';return (await navigator.permissions.query({name:'camera'})).state;},
 start:startCamera,
 showConsent:showCameraConsent
});

async function warm(model){const canvas=new OffscreenCanvas(640,480);canvas.getContext('2d').fillRect(0,0,640,480);const bitmap=await createImageBitmap(canvas);try{model.detectForVideo(bitmap,0);}finally{bitmap.close();}}
let api,vision,hand,face;
const report=message=>self.postMessage({type:"progress",message});
async function initialize(mode){
 if(!api){report('正在加载识别引擎…');api=await import('./vendor/vision_bundle.mjs');}
 if(!vision)vision=await api.FilesetResolver.forVisionTasks('./vendor/wasm');
 if(!hand){report('正在下载并初始化手势模型…');hand=await api.HandLandmarker.createFromOptions(vision,{baseOptions:{modelAssetPath:'./models/hand_landmarker.task'},runningMode:'VIDEO',numHands:2,minHandDetectionConfidence:.55,minTrackingConfidence:.55});report('正在预热手势识别…');await warm(hand);}
 if(mode==='smile'&&!face){report('正在下载并初始化笑容模型…');face=await api.FaceLandmarker.createFromOptions(vision,{baseOptions:{modelAssetPath:'./models/face_landmarker.task'},runningMode:'VIDEO',numFaces:1,outputFaceBlendshapes:true,minFaceDetectionConfidence:.55,minTrackingConfidence:.55});report('正在预热笑容识别…');await warm(face);}
}
async function handle({id,type,mode,bitmap,time}){
 try{
  if(type==='init'){await initialize(mode);self.postMessage({id,result:{ready:true}});return;}
  if(type==='frame'){
   const started=performance.now();
   const hands=hand.detectForVideo(bitmap,time);
   const expression=mode==='smile'?face.detectForVideo(bitmap,time):null;
   self.postMessage({id,result:{hands,expression,inferenceMs:performance.now()-started}});
  }
 }catch(error){self.postMessage({id,error:error.message||String(error)});}
 finally{bitmap?.close();}
}
// Use a classic worker so the MediaPipe WASM loader can call importScripts.
let pipeline=Promise.resolve();
self.onmessage=event=>{pipeline=pipeline.then(()=>handle(event.data));};

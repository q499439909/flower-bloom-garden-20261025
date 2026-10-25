async function warm(model){const canvas=new OffscreenCanvas(640,480);canvas.getContext('2d').fillRect(0,0,640,480);const bitmap=await createImageBitmap(canvas);try{model.detectForVideo(bitmap,0);}finally{bitmap.close();}}
let api,vision,hand,face,deliveryAPI,delivery,runtimePromise;
const report=message=>self.postMessage({type:'progress',message});
const progress=new Map();let reportedPercent=0;
async function binary(path){
 const packed=typeof DecompressionStream==='function',resource=path.replace(/^\.\//,'')+(packed?'.gz':'');
 const expectedBytes=deliveryAPI.PACKED_ASSET_BYTES[resource]||0;
 progress.set(resource,{loaded:0,total:expectedBytes});
 const bytes=await delivery.read(resource,{expectedBytes,onProgress:(loaded,total)=>{
  progress.set(resource,{loaded,total:expectedBytes||total||loaded});
  const parts=[...progress.values()],size=parts.reduce((sum,part)=>sum+part.total,0),done=parts.reduce((sum,part)=>sum+part.loaded,0);
  reportedPercent=Math.max(reportedPercent,Math.min(100,Math.floor(done/Math.max(1,size)*100)));
  report('识别资源准备中 '+reportedPercent+'%');
 }});
 return packed?deliveryAPI.inflateGzip(bytes):bytes;
}
async function runtime(){
 if(runtimePromise)return runtimePromise;
 runtimePromise=(async()=>{
  api=await import('./vendor/vision_bundle.mjs');
  const fileset=await api.FilesetResolver.forVisionTasks('./vendor/wasm');
  const wasm=await binary(fileset.wasmBinaryPath);
  vision={...fileset,wasmBinaryPath:URL.createObjectURL(new Blob([wasm],{type:'application/wasm'}))};
 })().catch(error=>{runtimePromise=null;throw error;});
 return runtimePromise;
}
async function initialize(mode){
 if(!deliveryAPI){deliveryAPI=await import('./asset-delivery.js?v=delivery1');delivery=deliveryAPI.createAssetDelivery();}
 progress.clear();reportedPercent=0;
 if(!hand){
  report('正在准备手势识别资源…');
  const [modelAssetBuffer]=await Promise.all([binary('models/hand_landmarker.task'),runtime()]);
  report('正在初始化手势识别…');
  hand=await api.HandLandmarker.createFromOptions(vision,{baseOptions:{modelAssetBuffer},runningMode:'VIDEO',numHands:2,minHandDetectionConfidence:.55,minTrackingConfidence:.55});
  await warm(hand);
 }
 if(mode==='smile'&&!face){
  report('正在准备笑容识别资源…');const modelAssetBuffer=await binary('models/face_landmarker.task');
  report('正在初始化笑容识别…');
  face=await api.FaceLandmarker.createFromOptions(vision,{baseOptions:{modelAssetBuffer},runningMode:'VIDEO',numFaces:1,outputFaceBlendshapes:true,minFaceDetectionConfidence:.55,minTrackingConfidence:.55});await warm(face);
 }
}
async function handle({id,type,mode,bitmap,time}){
 try{
  if(type==='init'){await initialize(mode);self.postMessage({id,result:{ready:true}});return;}
  if(type==='frame'){
   const started=performance.now(),hands=hand.detectForVideo(bitmap,time),expression=mode==='smile'?face.detectForVideo(bitmap,time):null;
   self.postMessage({id,result:{hands,expression,inferenceMs:performance.now()-started}});
  }
 }catch(error){self.postMessage({id,error:error.message||String(error)});}
 finally{bitmap?.close();}
}
let pipeline=Promise.resolve();self.onmessage=event=>{pipeline=pipeline.then(()=>handle(event.data));};

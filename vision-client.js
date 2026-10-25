export function createVisionClient({onProgress=()=>{}}={}){
 let worker=null,nextId=0;const pending=new Map(),initializing=new Map();
 function reset(error){
  worker?.terminate();worker=null;initializing.clear();
  for(const entry of pending.values()){clearTimeout(entry.timeout);entry.reject(error);}pending.clear();
 }
 function ensureWorker(){
  if(worker)return worker;
  const current=worker=new Worker(new URL('./vision-worker.js?v=delivery1',import.meta.url));
  current.onmessage=({data})=>{
   if(worker!==current)return;
   if(data.type==='progress'){onProgress(data.message);return;}
   const entry=pending.get(data.id);if(!entry)return;clearTimeout(entry.timeout);pending.delete(data.id);
   if(data.error)entry.reject(new Error(data.error));else entry.resolve(data.result);
  };
  current.onerror=error=>{if(worker===current)reset(new Error(error.message||'后台识别启动失败'));};
  return current;
 }
 return {
  request(type,data={},transfer=[]){
   if(type==='init'&&initializing.has(data.mode))return initializing.get(data.mode);
   const promise=new Promise((resolve,reject)=>{
   const id=++nextId,current=ensureWorker();
   const timeout=setTimeout(()=>reset(new Error('后台识别等待超时，请检查网络后重新开启摄像头。')),type==='init'?180000:10000);
   pending.set(id,{resolve,reject,timeout});
   try{current.postMessage({id,type,...data},transfer);}catch(error){clearTimeout(timeout);pending.delete(id);reject(error);}
  });
   if(type==='init'){initializing.set(data.mode,promise);const clear=()=>{if(initializing.get(data.mode)===promise)initializing.delete(data.mode);};promise.then(clear,clear);}
   return promise;
  }
 };
}

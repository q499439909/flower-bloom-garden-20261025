export function createVisionClient(){
 const worker=new Worker(new URL('./vision-worker.js',import.meta.url));
 const pending=new Map();let nextId=0;
 worker.onmessage=({data})=>{
  const entry=pending.get(data.id);if(!entry)return;
  clearTimeout(entry.timeout);pending.delete(data.id);
  if(data.error)entry.reject(new Error(data.error));else entry.resolve(data.result);
 };
 worker.onerror=error=>{
  for(const entry of pending.values()){clearTimeout(entry.timeout);entry.reject(new Error(error.message||'后台识别启动失败'));}
  pending.clear();
 };
 return {
  request(type,data={},transfer=[]){return new Promise((resolve,reject)=>{
   const id=++nextId;
   const timeout=setTimeout(()=>{pending.delete(id);reject(new Error('后台识别等待超时，请重新开启摄像头。'));},type==='init'?60000:10000);
   pending.set(id,{resolve,reject,timeout});
   try{worker.postMessage({id,type,...data},transfer);}catch(error){clearTimeout(timeout);pending.delete(id);reject(error);}
  });}
 };
}

export const DELIVERY_VERSION='delivery-v1';
export const PACKED_ASSET_BYTES={'models/hand_landmarker.task.gz':5813795,'models/face_landmarker.task.gz':3331700,'vendor/wasm/vision_wasm_internal.wasm.gz':2899604,'vendor/wasm/vision_wasm_nosimd_internal.wasm.gz':2896260};
export const DELIVERY_MIRROR='https://cdn.jsdelivr.net/gh/q499439909/flower-bloom-garden-20261025@delivery-v1/';
export function createAssetDelivery({baseURL=new URL('.',import.meta.url).href,mirrorURL=DELIVERY_MIRROR,fetchImpl=globalThis.fetch,cacheStorage=globalThis.caches,hedgeMs=1200,timeoutMs=45000}={}){
 async function cacheForAssets(){try{return await cacheStorage?.open('flower-assets-'+DELIVERY_VERSION);}catch{return null;}}
 async function read(path,{onProgress=()=>{},expectedBytes=0}={}){
  const key=new URL(path,baseURL).href,cache=await cacheForAssets();
  const valid=bytes=>bytes.length>0&&(!expectedBytes||bytes.length===expectedBytes)&&(!path.endsWith('.gz')||(bytes[0]===31&&bytes[1]===139));
  try{const stored=await cache?.match(key);if(stored){const bytes=new Uint8Array(await stored.arrayBuffer());if(valid(bytes)){onProgress(bytes.length,bytes.length);return bytes;}await cache.delete(key);}}catch{/* Storage failures must not prevent loading. */}
  return new Promise((resolve,reject)=>{
   let finished=false,backupStarted=false,failures=0,lastError;const controllers=[];
   const cleanup=()=>{clearTimeout(hedge);clearTimeout(deadline);controllers.forEach(controller=>controller.abort());};
   const fail=error=>{if(finished)return;finished=true;cleanup();reject(error);};
   const run=async url=>{
    const controller=new AbortController();controllers.push(controller);
    try{
     const response=await fetchImpl(url,{signal:controller.signal,credentials:'omit'});
     if(!response.ok)throw new Error('资源请求失败：'+response.status);
     const total=Number(response.headers.get('Content-Length'))||0,chunks=[];let size=0;
     if(response.body){const reader=response.body.getReader();while(true){const {value,done}=await reader.read();if(done)break;chunks.push(value);size+=value.length;onProgress(size,total);}}
     else{const bytes=new Uint8Array(await response.arrayBuffer());chunks.push(bytes);size=bytes.length;}
     const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
     if(!valid(bytes))throw new Error('资源内容无效');if(finished)return;
     finished=true;cleanup();onProgress(size,size);resolve(bytes);
     if(cache)cache.put(key,new Response(bytes)).catch(()=>{});
    }catch(error){
     if(finished)return;lastError=error;failures++;
     if(!backupStarted)startBackup();else if(failures>=2)fail(lastError);
    }
   };
   const startBackup=()=>{if(backupStarted||finished)return;backupStarted=true;run(new URL(path,mirrorURL).href);};
   const hedge=setTimeout(startBackup,hedgeMs);
   const deadline=setTimeout(()=>fail(new Error('资源加载超时，请检查网络后重试。')),timeoutMs);
   run(key);
  });
 }
 return {read};
}
export async function inflateGzip(bytes){
 const stream=new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
 return new Uint8Array(await new Response(stream).arrayBuffer());
}

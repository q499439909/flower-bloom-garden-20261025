// Keep only a bounded set of decoded full-resolution frames in memory.
const loadBitmap=async url=>{
 const image=new Image();image.src=url;await image.decode();
 return createImageBitmap(image);
};
export function createSequenceCache({capacity=48,concurrency=4,load=loadBitmap,onError=()=>{}}={}){
 const entries=new Map();let running=0,clock=0;
 function trim(){
  const ready=[...entries].filter(([,e])=>e.state==='ready').sort((a,b)=>a[1].used-b[1].used);
  while(ready.length>capacity){const [url,e]=ready.shift();e.image.close?.();entries.delete(url);}
  const queued=[...entries].filter(([,e])=>e.state==='queued').sort((a,b)=>b[1].priority-a[1].priority);
  for(const [url] of queued.slice(48))entries.delete(url);
 }
 function pump(){
  trim();
  while(running<concurrency){
   const next=[...entries].filter(([,e])=>e.state==='queued').sort((a,b)=>b[1].priority-a[1].priority)[0];
   if(!next)return;
   const [url,entry]=next;entry.state='loading';running++;
   Promise.resolve().then(()=>load(url)).then(image=>{entry.image=image;entry.state='ready';entry.used=++clock;},error=>{entry.state='error';onError(error,url);}).finally(()=>{running--;trim();pump();});
  }
 }
 return {
  request(urls){
   const priority=++clock;
   urls.forEach((url,index)=>{
    const entry=entries.get(url);
    if(entry){if(entry.state==='queued')entry.priority=priority-index*.01;return;}
    entries.set(url,{state:'queued',priority:priority-index*.01,used:0,image:null});
   });pump();
  },
  get(url){const entry=entries.get(url);if(entry?.state!=='ready')return null;entry.used=++clock;return entry.image;}
 };
}

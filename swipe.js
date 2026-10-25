const clamp=v=>Math.max(0,Math.min(1,v));
// Explicit preparation gives people a visible cue before movement counts.
export function createSwipeDetector(){
 let identity=null,openedAt=null,anchor=null,samples=[],cooldownUntil=0,lastOpen=null,lastSeen=null;
 const clear=()=>{openedAt=null;anchor=null;samples=[];};
 const result=(state,progress=0,direction=0,remaining=0)=>({state,progress,direction,remaining});
 return {
  reset(){identity=null;cooldownUntil=0;lastOpen=null;lastSeen=null;clear();},
  update({x=0,y=0,time,id=null,open=false,present=true}){
   if(time<cooldownUntil)return result('cooldown',1,0,cooldownUntil-time);
   if(!present){
    if(lastSeen!==null&&time-lastSeen<=240&&identity!==null){
     if(anchor)return result('ready');
     if(openedAt!==null)return result('arming',clamp((time-openedAt)/180));
    }
    identity=null;lastOpen=null;clear();return result('waiting');
   }
   lastSeen=time;
   if(id!==identity){clear();identity=id;}
   if(!open){
    // Tolerate a single low-confidence palm classification after arming.
    if(lastOpen!==null&&time-lastOpen<180){
     if(anchor)return result('ready');
     if(openedAt!==null)return result('arming',clamp((time-openedAt)/180));
    }
    clear();return result('open');
   }
   lastOpen=time;
   if(openedAt===null)openedAt=time;
   if(!anchor){
    const preparation=(time-openedAt)/180;
    if(preparation<1)return result('arming',clamp(preparation));
    anchor={x,y,time};samples=[anchor];return result('ready');
   }
   samples=samples.filter(p=>time-p.time<=1000);samples.push({x,y,time});
   const start=samples[0],dx=x-start.x,dy=y-start.y,elapsed=time-start.time;
   if(Math.abs(dy)>.23){anchor={x,y,time};samples=[anchor];return result('ready');}
   if(elapsed>=80&&Math.abs(dx)>=.13){
    cooldownUntil=time+800;clear();return result('switched',1,dx>0?1:-1,800);
   }
   return result('ready',clamp(Math.abs(dx)/.13));
  }
 };
}
export function isOpenPalm(p,width,height){
 const distance=(a,b)=>Math.hypot((a.x-b.x)*width,(a.y-b.y)*height);
 return [8,12,16,20].filter(i=>distance(p[i],p[0])>distance(p[i-2],p[0])*1.06).length>=3;
}

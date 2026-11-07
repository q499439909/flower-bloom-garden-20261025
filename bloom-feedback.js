import {BLOOM_HOLD_MS} from './bloom-experience.js?v=feedback2';

export function bloomGlowEffect(){
 const duration=BLOOM_HOLD_MS+800;
 return {
  keyframes:[
   {opacity:0,transform:'translate(-50%,-50%) scale(.92)',offset:0},
   {opacity:.24,transform:'translate(-50%,-50%) scale(1.02)',offset:400/duration},
   {opacity:.24,transform:'translate(-50%,-50%) scale(1.12)',offset:BLOOM_HOLD_MS/duration},
   {opacity:0,transform:'translate(-50%,-50%) scale(1.22)',offset:1}
  ],
  options:{duration,easing:'linear'}
 };
}

export function bloomProgressFeedback(frameIndex,count,phase){
 const percent=frameIndex>=count-1?100:Math.max(0,Math.min(99,Math.round(frameIndex/(count-1)*100)));
 const note=phase==='holding'?'为你盛放':phase==='revealed'?'祝福已送达':percent>=94?'将绽 · 保持片刻':'盛放时，祝福显现';
 return {percent,note};
}

// Keep camera noise out of the numeric label without delaying the flower itself.
export function createProgressDisplay({intervalMs=320,settleMs=220,deadband=2}={}){
 let filtered=0,displayed=0,lastTime=null,lastCommit=-Infinity;
 return {
  reset(){filtered=displayed=0;lastTime=null;lastCommit=-Infinity;},
  update(percent,time){
   const value=Math.max(0,Math.min(100,percent));
   const elapsed=lastTime===null?0:Math.max(0,time-lastTime);lastTime=time;
   filtered+=(value-filtered)*(1-Math.exp(-elapsed/settleMs));
   if(value===100){filtered=displayed=100;lastCommit=time;return displayed;}
   if(time-lastCommit<intervalMs)return displayed;
   const next=Math.min(99,Math.round(filtered));
   if(Math.abs(next-displayed)>=deadband||(value===0&&next===0)){
    displayed=next;lastCommit=time;
   }
   return displayed;
  }
 };
}

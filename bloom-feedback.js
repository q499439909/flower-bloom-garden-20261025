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

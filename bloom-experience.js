const clamp=value=>Math.max(0,Math.min(1,value));
export const BLOOM_HOLD_MS=2000;

// One round belongs to one selected flower or one explicitly requested replay.
export function createBloomExperience({threshold=.94,stableMs=500,holdMs=BLOOM_HOLD_MS,neutralThreshold=.18,neutralMs=180,freshMs=750}={}){
 let phase,aboveSince,neutralSince,holdUntil,input,inputAt,lastUpdate,revealed;
 function reset({requireNeutral=false}={}){
  phase=requireNeutral?'waiting':'interactive';aboveSince=neutralSince=null;
  holdUntil=0;input=null;inputAt=lastUpdate=null;revealed=false;
 }
 reset();
 return {
  reset,
  get revealed(){return revealed;},
  get waitingForNeutral(){return phase==='waiting';},
  clearInput(){input=null;inputAt=null;aboveSince=neutralSince=null;},
  sample(value,time){
   if(!Number.isFinite(value))return;
   if(inputAt!==null&&time-inputAt>freshMs)neutralSince=null;
   input=clamp(value);inputAt=time;
   if(phase==='waiting'){
    if(input<=neutralThreshold){neutralSince??=time;if(time-neutralSince>=neutralMs)phase='interactive';}
    else neutralSince=null;
   }
  },
  cancelHold(){
   if(phase==='holding'||phase==='finishing')phase=revealed?'revealed':'interactive';
   aboveSince=null;
  },
  update({progress,time,autoplay=false,allowCompletion=true}={}){
   let celebrate=false,released=false;
   const fresh=inputAt!==null&&time-inputAt<=freshMs;
   if(lastUpdate!==null&&time-lastUpdate>freshMs)aboveSince=null;
   lastUpdate=time;
   if(phase==='interactive'){
    const qualifying=allowCompletion&&progress>=threshold&&(autoplay||(fresh&&input>=threshold));
    if(qualifying){aboveSince??=time;if(time-aboveSince>=stableMs)phase='finishing';}
    else aboveSince=null;
   }
   // Reveal only when the actual decoded last frame is on screen.
   if(phase==='finishing'&&allowCompletion&&progress>=.999){
    phase='holding';revealed=true;holdUntil=time+holdMs;celebrate=true;
   }
   if(phase==='holding'&&time>=holdUntil){phase='revealed';released=true;}
   const target=phase==='waiting'?0:phase==='holding'||phase==='finishing'?1:fresh?input:null;
   return {phase,target,revealed,celebrate,released,holding:phase==='holding',waitingForNeutral:phase==='waiting'};
  }
 };
}

const center=p=>{const ids=[0,5,9,13,17];return {x:ids.reduce((s,i)=>s+p[i].x,0)/5,y:ids.reduce((s,i)=>s+p[i].y,0)/5};};
// Roles are assigned by arrival, not by left/right classification or detector order.
// Keep empty slots reserved when a previously assigned hand leaves the camera.
export function createHandRoleTracker(){
 let slots=[];
 const assign=(d,time,role)=>({id:role,label:d.label,position:d.position,lastSeen:time});
 return {
  reset(){slots=[];},
  update(landmarks,handedness,time){
   const detections=landmarks.map((points,index)=>({points,index,position:center(points),label:handedness[index]?.[0]?.categoryName||'Unknown'}));
   if(!slots.length){
    if(detections.length!==1)return {control:null,switcher:null,needsFirst:true,assigned:[false,false]};
    slots[0]=assign(detections[0],time,'first');
    return {control:{...detections[0],id:'first'},switcher:null,needsFirst:false,assigned:[true,false]};
   }
   const cost=(slot,d)=>{
    const distance=Math.hypot(slot.position.x-d.position.x,slot.position.y-d.position.y);
    const same=slot.label===d.label||slot.label==='Unknown'||d.label==='Unknown';
    // Before the second arrival, separate a new hand from the first slot.
    // Once both roles exist, handedness is only a soft hint: a fast moving
    // switch hand must not disappear just because its left/right label flickers.
    if(!slots[1]&&!same&&(time-slot.lastSeen>500||distance>.20))return Infinity;
    return Math.min(distance,.65)+(same?0:.16);
   };
   let best={cost:Infinity,matches:[]};
   function solve(i,used,total,matches){
    if(i===slots.length){if(total<best.cost)best={cost:total,matches:[...matches]};return;}
    solve(i+1,used,total+.8,[...matches,-1]);
    for(let j=0;j<detections.length;j++)if(!used.has(j)){
     const c=cost(slots[i],detections[j]);if(!Number.isFinite(c))continue;
     solve(i+1,new Set([...used,j]),total+c,[...matches,j]);
    }
   }
   solve(0,new Set(),0,[]);
   const matches=best.matches;
   if(!slots[1]){
    const extra=detections.findIndex((_,i)=>!matches.includes(i));
    if(extra>=0){slots[1]=assign(detections[extra],time,'second');matches[1]=extra;}
   }
   const visible=slots.map((slot,i)=>{
    const d=detections[matches[i]];if(!d)return null;
    slot.position=d.position;slot.lastSeen=time;
    return {...d,id:slot.id};
   });
   return {control:visible[0]||null,switcher:visible[1]||null,needsFirst:false,assigned:[!!slots[0],!!slots[1]]};
  }
 };
}

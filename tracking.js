export const HAND_CONNECTIONS = [
 [0,1],[1,2],[2,3],[3,4],[0,5],[5,6],[6,7],[7,8],
 [5,9],[9,10],[10,11],[11,12],[9,13],[13,14],[14,15],[15,16],
 [13,17],[0,17],[17,18],[18,19],[19,20]
];
export function pinchRatio(points,width,height){
 const distance=(a,b)=>Math.hypot((a.x-b.x)*width,(a.y-b.y)*height);
 return distance(points[4],points[8])/Math.max(1,distance(points[0],points[9]));
}
export function drawTracking(canvas,points,mode,width,height,{clear=true,role="pinch",caption="",ready=false}={}){
 if(canvas.width!==width)canvas.width=width;
 if(canvas.height!==height)canvas.height=height;
 const c=canvas.getContext('2d');if(clear)c.clearRect(0,0,width,height);
 if(!points)return;
 const unit=width/640,xy=i=>[(1-points[i].x)*width,points[i].y*height];
 const line=(a,b,color,size,dash=[])=>{c.beginPath();c.setLineDash(dash);c.strokeStyle=color;c.lineWidth=size*unit;c.moveTo(...xy(a));c.lineTo(...xy(b));c.stroke();c.setLineDash([]);};
 const dot=(i,color,radius)=>{c.beginPath();c.arc(...xy(i),radius*unit,0,Math.PI*2);c.fillStyle=color;c.fill();c.strokeStyle='#102822';c.lineWidth=1.5*unit;c.stroke();};
 if(mode==='hand'){
  for(const [a,b] of HAND_CONNECTIONS)line(a,b,role==='switch'?(ready?'#8dffb4':'#8ac7ff'):'#76f3c9',2.5);
  for(let i=0;i<21;i++)dot(i,'#ddfff2',4);
  if(role==='pinch'&&caption){const [x,y]=xy(0);c.font=`${18*unit}px sans-serif`;c.fillStyle='#d9fff0';c.fillText(caption,Math.max(5,Math.min(width-120*unit,x-40*unit)),Math.min(height-10,y+28*unit));}
  if(role==='switch'){const [x,y]=xy(0);c.font=`${18*unit}px sans-serif`;c.fillStyle=ready?'#d7ffdf':'#cbe5ff';c.fillText(caption||'← 挥动切换 →',Math.max(5,Math.min(width-145*unit,x-65*unit)),Math.min(height-10,y+28*unit));return;}
  line(4,8,'#ffe181',4,[8*unit,5*unit]);
  for(const [i,label] of [[4,'拇指尖'],[8,'食指尖']]){dot(i,'#ffe181',7);const [x,y]=xy(i);c.font=`${17*unit}px sans-serif`;c.lineWidth=4*unit;c.strokeStyle='#18322d';c.fillStyle='#fff2ba';const tx=Math.max(8,Math.min(width-75*unit,x+11*unit)),ty=Math.max(23*unit,y-12*unit);c.strokeText(label,tx,ty);c.fillText(label,tx,ty);}
 }else{
  const lips=[61,40,37,0,267,270,291,321,314,17,84,91,61];
  for(let i=1;i<lips.length;i++)line(lips[i-1],lips[i],'#76f3c9',2.5);
  for(const i of new Set(lips))dot(i,'#ddfff2',3);
  for(const i of [61,291])dot(i,'#ffe181',6);
 }
}

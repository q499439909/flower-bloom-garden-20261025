// Background tolerance covers low-chroma compression blocks.
// Preserve bright petal highlights, then soften only the immediate paper boundary.
const clamp=v=>Math.max(0,Math.min(1,v));
export function removePaperPixels(data,w,h){
 const count=w*h;
 const mask=new Uint8Array(count),queue=new Int32Array(count);let head=0,tail=0;
 const difference=i=>{const k=i*4;return (data[k]-data[k+1]-6)**2+(data[k+1]-data[k+2]-6)**2;};
 function visit(i){if(mask[i])return;mask[i]=1;const k=i*4;if(data[k+2]>130&&data[k]<242&&difference(i)<=64){mask[i]=2;queue[tail++]=i;}}
 for(let x=0;x<w;x++){visit(x);visit((h-1)*w+x);}for(let y=0;y<h;y++){visit(y*w);visit(y*w+w-1);}
 while(head<tail){const i=queue[head++],x=i%w;if(x>0)visit(i-1);if(x<w-1)visit(i+1);if(i>=w)visit(i-w);if(i<count-w)visit(i+w);}
 for(let i=0;i<count;i++){if(mask[i]===2)data[i*4+3]=0;else if(mask[i]===1&&data[i*4]<242&&difference(i)<196){const d=Math.sqrt(difference(i));data[i*4+3]=Math.round(255*clamp((d-8)/6));}}
 return data;
}

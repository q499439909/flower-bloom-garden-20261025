// Browser video decoding keeps the complete sequence without hundreds of image requests.
export function frameIndexAt(time,count,fps=30){return Math.max(0,Math.min(count-1,Math.floor(time*fps+1e-6)));}
export function createVideoSequence({url,count,fps=30,createVideo=()=>document.createElement('video'),mount=video=>document.body.append(video),onError=()=>{}}){
 const video=createVideo();let generation=0,requested=false,waiting=false,failure=null;
 video.muted=true;video.playsInline=true;video.preload='auto';video.setAttribute('aria-hidden','true');
 video.style.cssText='position:fixed;left:0;top:0;width:1px;height:1px;opacity:.001;pointer-events:none';
 video.addEventListener('waiting',()=>{waiting=true;});video.addEventListener('playing',()=>{waiting=false;});
 video.addEventListener('error',()=>{failure=new Error('花开资源加载失败，请检查网络后刷新重试。');onError(failure);});
 video.src=url;mount(video);video.load();
 function waitFor(type,ready,epoch){
  if(failure)return Promise.reject(failure);if(ready())return Promise.resolve();
  return new Promise((resolve,reject)=>{
   const finish=error=>{clearTimeout(timer);video.removeEventListener(type,done);video.removeEventListener('error',failed);error?reject(error):resolve();};
   const done=()=>finish(epoch!==generation?new DOMException('播放已取消','AbortError'):null),failed=()=>finish(failure||new Error('花开资源加载失败。'));
   const timer=setTimeout(()=>finish(new Error('花开资源加载超时，请检查网络后重试。')),60000);
   video.addEventListener(type,done);video.addEventListener('error',failed);
  });
 }
 return {
  get frame(){return video.readyState>=2&&!video.seeking?{source:video,index:frameIndexAt(video.currentTime,count,fps)}:null;},
  get position(){return frameIndexAt(video.currentTime,count,fps)/(count-1);},
  get ended(){return video.ended;},get buffering(){return waiting||video.readyState<3;},
  seek(index){
   if(requested||video.seeking||video.readyState<2)return;
   if(frameIndexAt(video.currentTime,count,fps)!==index)video.currentTime=(index+.25)/fps;
  },
  async play(){
   const epoch=++generation;requested=true;waiting=true;
   await waitFor('loadeddata',()=>video.readyState>=2,epoch);
   if(epoch!==generation)return false;
   if(video.currentTime!==0){video.currentTime=0;await waitFor('seeked',()=>!video.seeking,epoch);}
   if(epoch!==generation)return false;
   video.playbackRate=count/(fps*6);await video.play();waiting=false;return epoch===generation;
  },
  pause(){generation++;requested=false;video.pause();waiting=false;}
 };
}

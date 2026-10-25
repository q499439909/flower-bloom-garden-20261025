export async function launchCamera({queryPermission,start,showConsent}){
 let permission='prompt';
 try{permission=await queryPermission();}catch{/* Some browsers do not expose camera permission queries. */}
 if(permission==='granted')return start();
 showConsent(permission);return false;
}

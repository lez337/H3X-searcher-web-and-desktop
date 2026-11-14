'use strict';
function appUrl(value,{development=false}={}){
  const url=new URL(value);
  const local=development&&url.protocol==='http:'&&['127.0.0.1','localhost'].includes(url.hostname);
  if((url.protocol!=='https:'&&!local)||url.username||url.password||url.pathname!=='/'||url.search||url.hash)throw Error('H3X requires an HTTPS site origin.');
  return url.origin;
}
function trustedFrame(event,window,origin){
  return !!window&&!window.isDestroyed()&&event.sender===window.webContents&&event.senderFrame===window.webContents.mainFrame&&new URL(event.senderFrame.url).origin===origin;
}
function allowPermission(permission,requestingUrl,isMainFrame,origin){
  if(permission!=='clipboard-sanitized-write'||!isMainFrame)return false;
  try{return new URL(requestingUrl).origin===origin}catch{return false;}
}
module.exports={appUrl,trustedFrame,allowPermission};

'use strict';
const {contextBridge,ipcRenderer}=require('electron');
const origin=process.argv.find(arg=>arg.startsWith('--h3x-origin='))?.slice('--h3x-origin='.length);
if(process.isMainFrame&&location.origin===origin){
  const call=(channel,payload)=>ipcRenderer.invoke(channel,payload);
  contextBridge.exposeInMainWorld('h3xDesktop',Object.freeze({
    telegram:(action,payload)=>{
      if(!['status','restore','begin','beginQr','verify','send','replies','logout'].includes(action))return Promise.reject(Error('Unknown Telegram action.'));
      return call('telegram:'+action,payload);
    },
    searchLocal:payload=>call('native:search',payload),
    resetSession:()=>call('native:reset'),
    legacyWorkspace:()=>call('native:legacy-workspace'),
    openExternal:url=>call('external:open',url),
    updateStatus:()=>call('updates:status'),
    configureUpdates:value=>call('updates:configure',value),
    checkUpdates:()=>call('updates:check'),
    installUpdate:()=>call('updates:install')
  }));
}

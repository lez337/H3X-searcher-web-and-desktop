'use strict';

// Releases callers immediately on stop, even for integrations without native abort.
function abortable(operation,signal){
 if(!signal)return Promise.resolve().then(operation);
 signal.throwIfAborted();
 return new Promise((resolve,reject)=>{
  const abort=()=>reject(signal.reason||new Error('Search stopped.'));
  signal.addEventListener('abort',abort,{once:true});
  Promise.resolve().then(()=>{signal.throwIfAborted();return operation()}).then(resolve,reject).finally(()=>signal.removeEventListener('abort',abort));
 });
}
function registerSearchControl({ipcMain,search,workflow}){
 const jobs=new Map();
 async function run(event,payload={},batch=false){
  const owner=event.sender.id;
  if(jobs.has(owner))throw Error('A normal search is already running.');
  const runId=payload.runId||payload.usernameRunId;
  if(typeof runId!=='string'||!/^[a-zA-Z0-9-]{1,80}$/.test(runId))throw Error('Invalid search identifier.');
  const controller=new AbortController();jobs.set(owner,{runId,controller});
  const destroyed=()=>controller.abort();event.sender.once('destroyed',destroyed);
  const task={...payload,signal:controller.signal};
  try{return batch?await workflow(task,p=>abortable(()=>search(p,event),controller.signal)):await abortable(()=>search(task,event),controller.signal)}
  finally{event.sender.removeListener('destroyed',destroyed);jobs.delete(owner)}
 }
 ipcMain.handle('search:run',(event,payload)=>run(event,payload));
 ipcMain.handle('search:batch',(event,payload)=>run(event,payload,true));
 ipcMain.handle('search:cancel',(event,{runId}={})=>{const job=jobs.get(event.sender.id);if(!job||job.runId!==runId)return false;job.controller.abort();return true});
 return jobs;
}
module.exports={abortable,registerSearchControl};

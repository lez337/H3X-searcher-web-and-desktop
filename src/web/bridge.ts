import {investigation} from './shared.js';
import {loadWorkspace,saveWorkspace,read,log,accountId} from './storage';
import {download,pickFiles} from './files';
import {presentHostedReport,cancelHostedReportDialog} from './share-events';
import {readableLogs,trackActivity} from '../activity';
type Listener=(value:any)=>void;
const listeners={username:new Set<Listener>(),deep:new Set<Listener>(),file:new Set<Listener>()};
const subscribe=(kind:keyof typeof listeners,callback:Listener)=>{listeners[kind].add(callback);return()=>{listeners[kind].delete(callback)}};
const emit=(kind:keyof typeof listeners,value:any)=>listeners[kind].forEach(callback=>callback(value));
const runs=new Map<string,AbortController>();
export function clearSessionKeys(){window.h3xDesktop?.resetSession().catch(()=>{});cancelHostedReportDialog();for(const controller of runs.values())controller.abort();usernameController?.abort();fileWorker?.terminate();fileWorker=undefined;fileResolve?.({canceled:true});fileResolve=undefined;}
export async function requestJson(path:string,body?:any){
  const response=await fetch(path,{method:body===undefined?'GET':'POST',credentials:'same-origin',headers:{...(body===undefined?{}:{'Content-Type':'application/json'}),...(accountId()?{'X-H3X-Account':accountId()!}:{})},body:body===undefined?undefined:JSON.stringify(body)});
  const value=await response.json();if(!response.ok){if(response.status===401&&path!=='/api/login')window.dispatchEvent(new Event('h3x-auth-required'));throw Object.assign(Error(value.error||'Request failed.'),{status:response.status})}return value;
}
async function rpc(action:string,payload:any={},signal?:AbortSignal,onEvent?:(type:string,data:any)=>void){
  const response=await fetch('/api/rpc',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json',...(accountId()?{'X-H3X-Account':accountId()!}:{})},body:JSON.stringify({action,payload}),signal});
  if(!response.ok){const error=await response.json();if(response.status===401)window.dispatchEvent(new Event('h3x-auth-required'));throw Object.assign(Error(error.error||'Request failed.'),{status:response.status})}
  if(!response.headers.get('content-type')?.includes('ndjson'))return response.json();
  const reader=response.body!.getReader(),decoder=new TextDecoder();let buffer='',result:any,received=false;
  const handle=(line:string)=>{if(!line.trim())return;const event=JSON.parse(line);if(event.type==='error')throw Error(event.data.message);if(event.type==='result'){result=event.data;received=true}else onEvent?.(event.type,event.data)};
  try{while(true){const next=await reader.read();if(next.done)break;buffer+=decoder.decode(next.value,{stream:true});let index;while((index=buffer.indexOf('\n'))>=0){handle(buffer.slice(0,index));buffer=buffer.slice(index+1)}}buffer+=decoder.decode();if(buffer.trim())handle(buffer)}finally{reader.releaseLock()}
  if(!received)throw Error('The server connection ended before results completed.');return result;
}
let usernameController:AbortController|undefined;
async function usernameScan(options:any,parent?:AbortSignal){
  if(usernameController)throw Error('A username search is already running.');
  const controller=new AbortController();usernameController=controller;
  const abort=()=>controller.abort();parent?.addEventListener('abort',abort,{once:true});if(parent?.aborted)controller.abort();
  const started=Date.now(),results:any[]=[],counts:any={match:0,possible:0,not_found:0,inconclusive:0,skipped:0};
  let selection:any={ids:[],eligible:0,stats:{snapshot:{}}};
  const snapshot=(batch:any[]=[])=>({runId:options.runId,query:options.query.replace(/^@/,''),results:batch,counts:{...counts},total:selection.ids.length,eligible:selection.eligible,completed:results.length,elapsedMs:Date.now()-started});
  try{
    selection=await rpc('usernameSelect',options,controller.signal);emit('username',snapshot());
    for(let offset=0;offset<selection.ids.length&&!controller.signal.aborted;offset+=5){
      const batch=await rpc('usernameBatch',{query:options.query,runId:options.runId,ids:selection.ids.slice(offset,offset+5)},controller.signal);
      results.push(...batch.results);for(const hit of batch.results)counts[hit.status]++;emit('username',snapshot(batch.results));
    }
  }catch(error){if(!controller.signal.aborted)throw error}
  finally{parent?.removeEventListener('abort',abort);usernameController=undefined;emit('username',{...snapshot(),finished:true,canceled:controller.signal.aborted})}
  return {...snapshot(results),snapshot:selection.stats.snapshot,canceled:controller.signal.aborted};
}
function usernameEvidence(hit:any){return {id:'username-'+hit.id,source:'H3X Username',profileType:'username',query:hit.username,fields:{username:hit.username,site:hit.site,url:hit.url,status:hit.status==='match'?'Profile match':'Possible profile',detection_reason:hit.reason,categories:hit.categories.join(', '),identity:'Shared handle only; account ownership unverified'}};}
async function searchBatch(payload:any){
  const controller=new AbortController();runs.set(payload.runId,controller);let usernameRun:any;
  const items:any[]=[],status:any[]=[],notices:string[]=[];const pendingItems=new Map<string,any>();let meta:any={};
  try{
    const selected=(payload.providers||[]).filter((id:string)=>!['whatsmyname','telegram','ghunt'].includes(id));
    for(let offset=0;offset<selected.length&&!controller.signal.aborted;offset+=4){
      pendingItems.clear();
      const response=await rpc('searchBatch',{...payload,providers:selected.slice(offset,offset+4)},controller.signal,(type,data)=>{if(type==='providerResult')for(const item of data.result.items)pendingItems.set(item.id,item)});
      pendingItems.clear();
      items.push(...response.items);status.push(...(response.meta?.providerStatus||[]));meta={...meta,...response.meta,oathPagination:response.meta?.oathPagination||meta.oathPagination};if(response.notice)notices.push(response.notice);
    }
    if(payload.providers.includes('whatsmyname')&&!controller.signal.aborted){
      const info=await rpc('inspectQuery',{query:payload.query,type:payload.settings?.searchQueryType},controller.signal);
      if(info.type==='username'){
        const saved=payload.settings?.usernameSearchOptions||{};
        usernameRun=await usernameScan({...saved,limit:saved.limit??100,query:info.query,runId:payload.runId},controller.signal);
        items.push(...usernameRun.results.filter((hit:any)=>['match','possible'].includes(hit.status)).map(usernameEvidence));
        status.push({id:'whatsmyname',label:'Username search',status:'complete',count:usernameRun.counts.match+usernameRun.counts.possible});
      }else status.push({id:'whatsmyname',label:'Username search',status:'skipped',count:0,message:'Enter a username to check public profiles.'});
    }
    if(window.h3xDesktop){
      const state=await loadWorkspace();
      for(const provider of payload.providers.filter((id:string)=>['telegram','ghunt'].includes(id))){
        if(controller.signal.aborted)break;
        try{const response=await window.h3xDesktop.searchLocal({...payload,provider,bots:state.bots});items.push(...response.items);status.push({id:provider,label:provider,status:'complete',count:response.items.length});if(response.notice)notices.push(response.notice)}
        catch(error){status.push({id:provider,label:provider,status:'error',count:0,message:(error as Error).message})}
      }
    }
  }catch(error){items.push(...pendingItems.values());if(!controller.signal.aborted){if(!items.length)throw error;notices.push((error as Error).message)}}
  finally{runs.delete(payload.runId)}
  return {query:payload.query,items,meta:{...meta,canceled:controller.signal.aborted,providerStatus:status,usernameRun},notice:controller.signal.aborted?'Search stopped; completed results retained.':notices.join(' · ')};
}
let fileWorker:Worker|undefined;
async function scanFile(options:any){
  const files=await pickFiles('.txt,.log,.csv,.tsv,.json,.jsonl,.ndjson,.zip',true);if(!files.length)return null;
  if(files.reduce((sum,file)=>sum+file.size,0)>100*1024*1024)throw Error('Selected files exceed the 100 MB browser limit.');
  if(files.length>100)throw Error('Select up to 100 files.');
  return new Promise<any>((resolve,reject)=>{
    fileWorker=new Worker(new URL('./file-worker.ts',import.meta.url),{type:'module'});
    fileWorker.onmessage=event=>{if(event.data.type==='progress')emit('file',event.data.data);else{fileWorker?.terminate();fileWorker=undefined;event.data.type==='error'?reject(Error(event.data.message)):resolve(event.data.data)}};
    fileWorker.onerror=()=>{fileWorker?.terminate();fileWorker=undefined;reject(Error('File scan failed.'))};
    fileWorker.postMessage({files,options});fileResolve=resolve;
  });
}
let fileResolve:((value:any)=>void)|undefined;
const geocodeCache=new Map<string,any>();let geocodeQueue=Promise.resolve(),lastGeocode=0;
async function geocode(query:string,refresh=false){
  const key=query.trim().toLowerCase();if(geocodeCache.has(key)&&!refresh)return geocodeCache.get(key);
  const task=geocodeQueue.catch(()=>{}).then(async()=>{const wait=1100-(Date.now()-lastGeocode);if(wait>0)await new Promise(resolve=>setTimeout(resolve,wait));lastGeocode=Date.now();const result=await rpc('geocode',{query,refresh});geocodeCache.set(key,result);if(geocodeCache.size>200)geocodeCache.delete(geocodeCache.keys().next().value!);return result});
  geocodeQueue=task;return task;
}
async function deepSearch(p:any){
  const controller=new AbortController();runs.set(p.runId,controller);
  const items=new Map<string,any>(),warnings:string[]=[];let completed=0,limited=false;
  let tasks=p.plan.tasks;
  try{
    if(!Array.isArray(p.plan.tasks)||!p.plan.tasks.length||p.plan.tasks.length>84)throw Error('Choose up to 84 deep-search tasks.');
    tasks=p.plan.tasks.flatMap((task:any)=>task.provider==='oathnet'&&Array.isArray(task.terms)?task.terms.map((term:string)=>({...task,terms:[term]})):[task]);
    for(const task of tasks){
      if(controller.signal.aborted)break;
      if(task.provider==='ghunt'&&window.h3xDesktop){
        try{const result=await window.h3xDesktop.searchLocal(task);for(const item of result.items)items.set(item.id,item);if(result.notice)warnings.push(result.notice);completed++;emit('deep',{runId:p.runId,completed,total:tasks.length,records:items.size,items:result.items});}
        catch(error){warnings.push((error as Error).message);completed++;}
        continue;
      }
      let page=1;const seenPages=new Set<string>();
      while(!controller.signal.aborted){
       const plan={...p.plan,longSearch:false,pages:p.plan.longSearch?1:p.plan.pages,tasks:[task],...(task.provider==='brixhub'?{startPage:page}:{})};
       const result=await rpc('deepSearch',{...p,plan},controller.signal,(type,progress)=>{
         if(type==='deepProgress'){for(const item of progress.items||[])items.set(item.id,item);emit('deep',{...progress,completed:completed+progress.completed,total:tasks.length,records:items.size})}
       });
       for(const item of result.items)items.set(item.id,item);warnings.push(...result.warnings);
       if(!p.plan.longSearch){limited||=result.limited;break}
       if(task.provider!=='brixhub'||!result.nextPage){limited||=result.limited;break}
       const fingerprint=JSON.stringify(result.items.map((item:any)=>item.id).sort());
       if(seenPages.has(fingerprint)){limited=true;warnings.push('BrixHub repeated a page; pagination stopped.');break}
       seenPages.add(fingerprint);page=result.nextPage;
      }
      completed++;
      if(!p.plan.longSearch&&items.size>=5000){limited=true;warnings.push('Web deep search retained the first 5,000 records.');break}
    }
  }catch(error){if(!controller.signal.aborted){if(!items.size)throw error;warnings.push((error as Error).message)}}
  finally{runs.delete(p.runId)}
  return {items:p.plan.longSearch?[...items.values()]:[...items.values()].slice(0,5000),completed,total:tasks.length,canceled:controller.signal.aborted,warnings,limited};
}
const desktop=async()=>{throw Error('This integration requires the Windows desktop application.')};
let creatingReport=false;
export const bridge:Window['h3x']={
  load:loadWorkspace,save:saveWorkspace,
  credentials:()=>requestJson('/api/account/credentials'),
  setCredential:async(name,value)=>{if(typeof value!=='string'||value.length>1024||/[\r\n\x00]/.test(value))throw Error('Invalid API key.');await requestJson('/api/account/credentials',{name,value:value.trim()});return true},
  logs:async()=>await read('logs')||[],exportLogs:async()=>download(readableLogs(await read('logs')||[]),'H3X-activity.txt'),
  prepareEvidence:async p=>investigation.prepare(p.fields,p.excluded,p.current),
  importCase:async({excluded}={})=>{const [file]=await pickFiles('.txt,.json');if(!file)return null;if(file.size>8*1024*1024)throw Error('Import exceeds 8 MB.');const text=(await file.text()).replace(/^\uFEFF/,'');if(file.name.toLowerCase().endsWith('.json')){const value=JSON.parse(text);return Array.isArray(value.people)?{record:value}:{fields:investigation.clean(value,excluded)}}return investigation.parseText(text,excluded)},
  exportCase:async({record,excluded,format='txt'})=>{
    const state=await loadWorkspace();
    if(format==='html'){
      if(creatingReport)throw Error('Finish the current report link before creating another.');creatingReport=true;
      try{const report=await requestJson('/api/reports',{record,excluded,settings:{hiddenFields:state.settings.hiddenFields,txtHeaderArt:state.settings.txtHeaderArt,txtFooterArt:state.settings.txtFooterArt}});return await presentHostedReport(report)}finally{creatingReport=false}
    }
    return download(investigation.textReport(record,excluded,state.settings),`H3X-${String(record.title||'case').replace(/[^a-z0-9_-]/gi,'_').slice(0,40)}.txt`);
  },
  exportSearch:async({items})=>{const state=await loadWorkspace(),excluded=[...(state.settings.excludedFields||investigation.defaults),...(state.settings.hiddenFields||[])];return download(investigation.decorateText(items.map((item:any)=>[item.source||'Result',...Object.entries(investigation.clean(item.fields,excluded)).map(([key,value])=>`${key} : ${typeof value==='object'?JSON.stringify(value):value}`)].join('\n')).join('\n\n'),state.settings),'H3X-results.txt')},
  openExports:async()=>{throw Error('Web exports are saved to your browser’s Downloads folder.')},
  inspectQuery:(query,type='auto')=>rpc('inspectQuery',{query,type}),providerMatches:query=>rpc('providerMatches',{query}),
  searchBatch,search:p=>rpc('search',p),
  cancelSearch:async runId=>{const controller=runs.get(runId);controller?.abort();return !!controller},
  deepSearch,
  cancelDeepSearch:async runId=>{const controller=runs.get(runId);controller?.abort();return !!controller},onDeepProgress:callback=>subscribe('deep',callback),
  usernameCatalog:refresh=>rpc('usernameCatalog',{refresh}),scanUsername:usernameScan,cancelUsernameScan:async()=>{usernameController?.abort();return true},onUsernameProgress:callback=>subscribe('username',callback),
  geocode,
  scanFile,cancelFileScan:async()=>{if(!fileWorker)return false;fileWorker.terminate();fileWorker=undefined;fileResolve?.({canceled:true});fileResolve=undefined;return true},onFileProgress:callback=>subscribe('file',callback),
  openExternal:async value=>{const url=new URL(value);if(!['http:','https:'].includes(url.protocol)||url.username||url.password)throw Error('Invalid external URL.');if(window.h3xDesktop)return window.h3xDesktop.openExternal(url.href);window.open(url.href,'_blank','noopener,noreferrer');return true},
  clipboard:async value=>{await navigator.clipboard.writeText(String(value));return true},
  telegram:async(action,payload)=>window.h3xDesktop?window.h3xDesktop.telegram(action,payload):['status','restore'].includes(action)?{connected:false,available:false,error:'Telegram account sessions require the desktop application.'}:desktop(),
  stealerTree:p=>rpc('stealerTree',p),openBotReplies:desktop,checkTool:async()=>false,runGhunt:desktop,
  updateStatus:async()=>window.h3xDesktop?window.h3xDesktop.updateStatus():({phase:'idle',message:'Reload H3X to use the latest deployed version.',version:'0.3.1 Web',supported:false,repository:'',enabled:false,progress:0}),
  configureUpdates:async value=>window.h3xDesktop?window.h3xDesktop.configureUpdates(value):desktop(),checkUpdates:async()=>window.h3xDesktop?window.h3xDesktop.checkUpdates():desktop(),installUpdate:async()=>window.h3xDesktop?window.h3xDesktop.installUpdate():desktop()
};
const activityActions:Partial<Record<keyof Window['h3x'],[string,string]>>={
 save:['Workspace save','workspace'],setCredential:['API key update','account'],
 importCase:['Investigation import','investigations'],exportCase:['Investigation export','investigations'],exportSearch:['Results export','search'],
 searchBatch:['Search','search'],search:['Provider search','search'],cancelSearch:['Stop search','search'],
 deepSearch:['Deep search','search'],cancelDeepSearch:['Stop deep search','search'],
 scanUsername:['Username scan','username'],cancelUsernameScan:['Stop username scan','username'],
 scanFile:['File scan','files'],cancelFileScan:['Stop file scan','files'],geocode:['Location lookup','map'],
 openExternal:['Open external link','workspace'],clipboard:['Copy to clipboard','workspace'],
 telegram:['Telegram operation','integrations'],stealerTree:['Stealer tree lookup','search'],runGhunt:['GHunt search','integrations'],
 configureUpdates:['Update settings','updates'],checkUpdates:['Update check','updates'],installUpdate:['Update installation','updates']
};
for(const [key,[label,scope]] of Object.entries(activityActions)){
 const name=key as keyof Window['h3x'],run=bridge[name] as (...args:any[])=>Promise<any>;
 Object.assign(bridge,{[name]:(...args:any[])=>{
  const id=accountId();
  return trackActivity(label,scope,()=>run(...args),(event,detail,level,source,duration)=>{
   if(id&&accountId()===id)void log(event,detail,level,source,duration).catch(()=>{});
  });
 }});
}
window.h3x=bridge;

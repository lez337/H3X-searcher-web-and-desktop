export type LogEntry={id?:string;time:string;event:string;detail:string;level?:string;scope?:string;durationMs?:number};
type Writer=(event:string,detail:string,level:string,scope:string,durationMs?:number)=>void;

export function activityResult(value:any){
 const canceled=value===null||value?.canceled===true||value?.meta?.canceled===true;
 const providers=Array.isArray(value?.meta?.providerStatus)?value.meta.providerStatus:[];
 const failures=providers.filter((p:any)=>p.status==='error').length;
 const warnings=(Array.isArray(value?.warnings)?value.warnings.length:0)+(value?.notice?1:0)+failures;
 const detail=[canceled?'Stopped or canceled; any completed results are retained.':value===false?'No change was made.':'Operation finished.',
  Array.isArray(value?.items)?`${value.items.length} records returned.`:'',
  Array.isArray(value?.results)?`${value.results.length} sites checked.`:'',
  typeof value?.filesScanned==='number'?`${value.filesScanned} files scanned.`:'',
  Array.isArray(value?.hits)?`${value.hits.length} matches found.`:'',
  providers.length?`${providers.length} providers reported; ${failures} failed.`:'',
  ...providers.map((p:any)=>`${p.label||p.id}: ${['complete','error','skipped'].includes(p.status)?p.status:'finished'}${typeof p.count==='number'?` · ${p.count} records`:''}${p.cached?' · cached':''}${p.limited?' · result limit reached':''}`),
  warnings?`${warnings} warnings; review the results for details.`:'',
  value?.limited?'The result limit was reached.':''].filter(Boolean).join('\n');
 return {detail,level:canceled||warnings||value?.limited?'warning':'info',outcome:canceled?'canceled':warnings||value?.limited?'finished with warnings':value===false?'finished without changes':'completed'};
}

export async function trackActivity<T>(label:string,scope:string,run:()=>Promise<T>,write:Writer){
 const started=Date.now();
 // Logging must never turn a successful operation into a failure.
 const record=(event:string,detail:string,level:string,durationMs?:number)=>{try{write(event,detail,level,scope,durationMs)}catch{}};
 record(`${label} started`,'Operation in progress.','info');
 try{const result=await run(),summary=activityResult(result);record(`${label} ${summary.outcome}`,summary.detail,summary.level,Date.now()-started);return result}
 catch(error){
  const canceled=error instanceof Error&&error.name==='AbortError';
  // Provider errors can echo credentials or records; keep raw responses out of history.
  const status=(error as {status?:number})?.status;
  const reason=status===401?'Your session expired. Sign in again.':status===403?'Access was denied. Check account permissions.':status===429?'The service rate limit was reached. Wait before retrying.':typeof status==='number'?`The server returned HTTP ${status}. Review the on-screen error.`:error instanceof TypeError?'The request could not finish. Check the connection and retry.':'The operation could not finish. Review the on-screen error and retry.';
  record(`${label} ${canceled?'canceled':'failed'}`,canceled?'The operation was stopped.':reason,canceled?'warning':'error',Date.now()-started);
  throw error;
 }
}

export const logLevel=(entry:LogEntry)=>entry.level||'info';
export const logScope=(entry:LogEntry)=>entry.scope||'workspace';
export function filterLogs(entries:LogEntry[],query:string,level:string,scope:string){
 const needle=query.trim().toLowerCase();
 return entries.filter(e=>(level==='all'||logLevel(e)===level)&&(scope==='all'||logScope(e)===scope)&&`${e.time} ${e.event} ${e.detail} ${logScope(e)} ${logLevel(e)}`.toLowerCase().includes(needle)).slice().reverse();
}
export function readableLogs(entries:LogEntry[]){
 return entries.map(e=>`[${e.time}] ${logLevel(e).toUpperCase()} | ${logScope(e)} | ${e.event}${e.durationMs!=null?` | ${e.durationMs} ms`:''}\n${e.detail||'No additional details.'}`).join('\n\n');
}

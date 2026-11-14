import {useEffect,useState,type FormEvent} from 'react';
import {Download,Upload} from 'lucide-react';
import App from '../App';
import {clearSessionKeys,requestJson} from './bridge';
import {loadWorkspace,saveWorkspace,openWorkspace,closeWorkspace,legacyWorkspace,syncStatus,accountId,refreshWorkspace,type SyncStatus} from './storage';
import InstallApp from './InstallApp';
import {download,pickFiles} from './files';
import {validateState} from './state.mjs';
import ReportShareDialog from './ReportShareDialog';
import SharedInvestigation from './SharedInvestigation';
import HostedReports from './HostedReports';
import AccountMenu,{AccountSettings} from './AccountMenu';
import LoginScreen from './LoginScreen';

export function WebWorkspace(){
  const [message,setMessage]=useState('');
  async function backup(){try{download(JSON.stringify(await loadWorkspace(),null,2),'H3X-workspace.json','application/json');setMessage('Workspace backup downloaded.')}catch(error){setMessage((error as Error).message)}}
  async function replace(state:any){
    if(!window.confirm('Replace this account’s workspace? Download a backup first to keep your current investigations.'))return;
    await saveWorkspace(state);location.reload();
  }
  async function restore(){try{
    const [file]=await pickFiles('.json');if(!file)return;if(file.size>8*1024*1024)throw Error('Workspace exceeds 8 MB.');
    await replace(validateState(JSON.parse(await file.text())));
  }catch(error){setMessage((error as Error).message)}}
  async function importBrowser(){try{
    const state=await legacyWorkspace();if(!state){setMessage('No previous browser workspace was found on this device.');return;}await replace(state);
  }catch(error){setMessage((error as Error).message)}}
  async function importDesktop(){try{
    const state=await window.h3xDesktop!.legacyWorkspace();if(!state){setMessage('No previous Windows workspace was found. You can restore a workspace.json backup instead.');return;}await replace(validateState(state));
  }catch(error){setMessage((error as Error).message)}}
  return <div className="web-workspace">
    <section className="panel"><header><h2>Workspace backups</h2><p>Save a copy of your investigations or restore a previous workspace.</p></header>
      <div className="workspace-action"><div><h3>Download a backup</h3><p>Keep a copy of your current workspace on this device.</p></div><button className="primary" onClick={backup}><Download size={15}/>Download backup</button></div>
      <div className="workspace-action"><div><h3>Restore a backup</h3><p>Choose a backup file. Restoring replaces this account’s current workspace.</p></div><button onClick={restore}><Upload size={15}/>Restore backup</button></div>
    </section>
    <section className="panel"><h2>Import a previous workspace</h2>
      <div className="workspace-action"><div><h3>From this browser</h3><p>Move a previous browser workspace into this account. This replaces the current workspace.</p></div><button onClick={importBrowser}>Import browser workspace</button></div>
      {window.h3xDesktop&&<div className="workspace-action"><div><h3>From Windows</h3><p>Move a previous Windows workspace into this account. This replaces the current workspace.</p></div><button onClick={importDesktop}>Import Windows workspace</button></div>}
    </section>
    {message&&<p className="workspace-message" role="status">{message}</p>}
    <InstallApp/>
  </div>;
}
function WorkspaceApp(){
  useEffect(()=>{
    let running=false;
    const refresh=async()=>{if(running||document.visibilityState==='hidden')return;running=true;try{await refreshWorkspace()}catch{/* Saving remains authoritative; retry on the next poll. */}finally{running=false}};
    const timer=setInterval(refresh,2000);window.addEventListener('focus',refresh);window.addEventListener('online',refresh);document.addEventListener('visibilitychange',refresh);
    return()=>{clearInterval(timer);window.removeEventListener('focus',refresh);window.removeEventListener('online',refresh);document.removeEventListener('visibilitychange',refresh)};
  },[]);
  const [showReports,setShowReports]=useState(false);
  const [ready,setReady]=useState(false),[account,setAccount]=useState<{id:string;name:string}|null>(null),[name,setName]=useState(''),[key,setKey]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const [remember,setRemember]=useState(true);
  const [mode,setMode]=useState<'login'|'create'>('login'),[created,setCreated]=useState<{name:string;key:string}|null>(null),[saved,setSaved]=useState(false),[copied,setCopied]=useState(false),[sync,setSync]=useState<SyncStatus>(syncStatus);
  useEffect(()=>{
    let canceled=false;
    requestJson('/api/session').then(async value=>{if(canceled||!value.authenticated)return;await openWorkspace(value.account.id);if(!canceled)setAccount(value.account)}).catch(error=>{if(!canceled)setError(error.message)}).finally(()=>{if(!canceled)setReady(true)});
    const expired=()=>{clearSessionKeys();closeWorkspace();setAccount(null);setError('Your session ended or the account changed. Sign in again.');};
    const status=(event:Event)=>setSync((event as CustomEvent<SyncStatus>).detail);
    const beforeUnload=(event:BeforeUnloadEvent)=>{if(accountId()&&syncStatus().status!=='saved'){event.preventDefault();event.returnValue='';}};
    window.addEventListener('h3x-auth-required',expired);window.addEventListener('h3x-sync-status',status);window.addEventListener('beforeunload',beforeUnload);
    return()=>{canceled=true;window.removeEventListener('h3x-auth-required',expired);window.removeEventListener('h3x-sync-status',status);window.removeEventListener('beforeunload',beforeUnload)};
  },[]);
  async function signIn(loginName:string,loginKey:string){const value=await requestJson('/api/login',{name:loginName,key:loginKey,remember});await openWorkspace(value.account.id);setName(value.account.name);setMode('login');setKey('');setCreated(null);setAccount(value.account)}
  async function submit(event:FormEvent){event.preventDefault();setBusy(true);setError('');try{
    if(mode==='create'){const value=await requestJson('/api/accounts',{name});setCreated({name:value.account.name,key:value.key});setSaved(false);setCopied(false)}
    else await signIn(name,key);
  }catch(error){setError((error as Error).message)}finally{setBusy(false)}}
  async function continueCreated(){if(!created||!saved)return;setBusy(true);setError('');try{await signIn(created.name,created.key)}catch(error){setError((error as Error).message)}finally{setBusy(false)}}
  async function copyKey(){try{await navigator.clipboard.writeText(created!.key);setCopied(true)}catch{setError('Copy is unavailable. Select the key and save it manually.')}}
  async function logout(){setBusy(true);setError('');try{
    const pending:Promise<unknown>[]=[];window.dispatchEvent(new CustomEvent('h3x-save-now',{detail:pending}));await Promise.all(pending);
    await requestJson('/api/logout',{});clearSessionKeys();closeWorkspace();setAccount(null);
  }catch(error){setError((error as Error).message)}finally{setBusy(false)}}
  if(account)return <><App accountSettings={<AccountSettings account={account} sync={sync} busy={busy} onLogout={logout} onReports={()=>setShowReports(true)}/>} accountControl={onSettings=><AccountMenu account={account} sync={sync} onSettings={onSettings}/>}/><ReportShareDialog/>{showReports&&<HostedReports onClose={()=>setShowReports(false)}/>}{(error||sync.status==='error')&&<div className="web-account-error" role="alert">{error||sync.message}<button onClick={async()=>download(JSON.stringify(await loadWorkspace(),null,2),'H3X-unsaved-workspace.json','application/json')}><Download size={14}/>Download backup</button></div>}</>;
  return <LoginScreen ready={ready} busy={busy} error={error} mode={mode} name={name} accountKey={key} remember={remember} created={created} saved={saved} copied={copied} onMode={value=>{setMode(value);setKey('');setError('')}} onName={setName} onKey={setKey} onRemember={setRemember} onSaved={setSaved} onCopy={copyKey} onContinue={continueCreated} onSubmit={submit}/>;
}
export default function WebApp(){
  const match=window.location.pathname.match(/^\/reports\/([0-9a-f-]{36})\/?$/);
  return match?<SharedInvestigation id={match[1]}/>:<WorkspaceApp/>;
}

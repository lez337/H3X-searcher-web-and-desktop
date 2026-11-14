import {useEffect,useRef,useState,type FormEvent} from 'react';
import {UserRound,Settings,LogOut,FileCode2,KeyRound,Copy,Check} from 'lucide-react';
import {requestJson} from './bridge';
import type {SyncStatus} from './storage';
import AccountApiKey from './AccountApiKey';

type Account={id:string;name:string};
export default function AccountMenu({account,sync,onSettings}:{account:Account;sync:SyncStatus;onSettings:()=>void}){
  return <div className="web-account-dock"><button type="button" className="web-account-trigger" aria-label={'Open settings for '+account.name} onClick={onSettings}><span className="web-account-avatar"><UserRound size={18}/></span><span className="web-account-label"><strong>{account.name}</strong>{sync.status!=='saved'&&<small className={'web-sync '+sync.status}>{sync.status==='error'?'Save failed':'Saving…'}</small>}</span><Settings size={15}/></button></div>;
}
export function AccountSettings({account,sync,busy,onLogout,onReports}:{account:Account;sync:SyncStatus;busy:boolean;onLogout:()=>void;onReports:()=>void}){
  const [current,setCurrent]=useState(''),[newKey,setNewKey]=useState(''),[working,setWorking]=useState(false),[saved,setSaved]=useState(false),[copied,setCopied]=useState(false),[error,setError]=useState('');
  const dialog=useRef<HTMLDialogElement>(null);
  const close=()=>{if(!saved)return;setNewKey('');setError('');setSaved(false);setCopied(false);};
  useEffect(()=>{if(newKey)dialog.current?.showModal();else dialog.current?.close();},[newKey]);
  async function rotate(event:FormEvent){
    event.preventDefault();setWorking(true);setError('');
    try{const value=await requestJson('/api/account/key',{currentKey:current});setNewKey(value.key);setCurrent('');setSaved(false);setCopied(false)}catch(error){setError((error as Error).message)}finally{setWorking(false)}
  }
  async function copy(){try{await navigator.clipboard.writeText(newKey);setCopied(true)}catch{setError('Select the code and copy it manually.')}}
  return <div className="account-settings">
    <section className="panel"><h2>Account</h2><div className="web-account-identity"><span className="web-account-avatar"><UserRound size={22}/></span><div><small>Account name</small><strong>{account.name}</strong></div></div>
      {sync.status==='error'&&<p className="web-login-error" role="alert">{sync.message}</p>}
      <div className="web-account-actions"><button disabled={working} onClick={onReports}><FileCode2 size={16}/>My HTML links</button><button disabled={busy||working} onClick={onLogout}><LogOut size={16}/>{busy?'Signing out…':'Sign out'}</button></div>
    </section>
    <section className="panel"><h2>Login & security</h2>
      <form className="web-account-code" onSubmit={rotate}><p>Generating a new login code replaces your current code and signs out your other sessions.</p><label htmlFor="current-login-code">Current login code</label><input id="current-login-code" type="password" autoComplete="current-password" inputMode="numeric" pattern="[0-9]{8}" minLength={8} maxLength={8} required value={current} disabled={working} onChange={event=>setCurrent(event.target.value)}/><button type="submit" disabled={working||!/^\d{8}$/.test(current)}><KeyRound size={15}/>{working?'Generating…':'Generate new login code'}</button></form>
      {error&&!newKey&&<p className="web-login-error" role="alert">{error}</p>}
    </section>
    <section className="panel"><AccountApiKey key={account.id}/></section>
    <dialog ref={dialog} className="web-account-dialog" aria-labelledby="account-dialog-title" onCancel={event=>event.preventDefault()}>
      <h2 id="account-dialog-title">Save your new login code</h2>
      <section className="web-account-code"><p>Your old code no longer works. Other sessions have been signed out. This code is shown once.</p><label htmlFor="replacement-login-code">New 8-digit login code</label><div className="report-code-row"><input id="replacement-login-code" readOnly value={newKey} onFocus={event=>event.currentTarget.select()}/><button onClick={copy}>{copied?<Check size={15}/>:<Copy size={15}/>} {copied?'Copied':'Copy code'}</button></div><label className="web-account-saved"><input type="checkbox" checked={saved} onChange={event=>setSaved(event.target.checked)}/>I saved my new login code</label><button className="primary" disabled={!saved} onClick={close}>Done<Check size={15}/></button></section>
      {error&&<p className="web-login-error" role="alert">{error}</p>}
    </dialog>
  </div>;
}

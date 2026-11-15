import {useState,type FormEvent} from 'react';
import {ArrowRight,Check,Copy,Eye,EyeOff,KeyRound,UserRound,X} from 'lucide-react';

type Props={ready:boolean;busy:boolean;error:string;mode:'login'|'create';name:string;accountKey:string;remember:boolean;created:{name:string;key:string}|null;saved:boolean;copied:boolean;
  onMode:(mode:'login'|'create')=>void;onName:(name:string)=>void;onKey:(key:string)=>void;onRemember:(value:boolean)=>void;onSaved:(value:boolean)=>void;onCopy:()=>void;onContinue:()=>void;onSubmit:(event:FormEvent)=>void};
export default function LoginScreen(p:Props){
  const [visible,setVisible]=useState(false);
  if(!p.ready)return <main className="web-login auth-page"><div className="auth-loading" role="status"><div className="auth-brand">H<span>3</span>X</div><span className="search-spinner" aria-hidden="true"/><p>Loading workspace…</p></div></main>;
  return <main className="web-login auth-page">
    <section className="web-login-card auth-card">
      <a className="auth-brand" href="/" aria-label="H3X home">H<span>3</span>X</a>
      <h1>{p.created?'Save your key':p.mode==='login'?'Log in':'Create account'}</h1>
      {p.created?<div className="web-created-account">
        <label htmlFor="created-account-key">{p.created.name} · 8-digit account key</label>
        <div className="report-code-row"><input id="created-account-key" className="web-created-key" readOnly value={p.created.key} onFocus={event=>event.currentTarget.select()}/><button type="button" onClick={p.onCopy}>{p.copied?<Check size={16}/>:<Copy size={16}/>} {p.copied?'Copied':'Copy'}</button></div>
        <label className="web-saved-key"><input type="checkbox" checked={p.saved} disabled={p.busy} onChange={e=>p.onSaved(e.target.checked)}/>I saved my account key</label>
        <button className="primary auth-submit" disabled={!p.saved||p.busy} onClick={p.onContinue}>{p.busy?'Opening…':'Open workspace'}<ArrowRight size={16}/></button>
      </div>:<>
        <div className="web-auth-tabs" role="group" aria-label="Account access"><button type="button" aria-pressed={p.mode==='login'} disabled={p.busy} onClick={()=>p.onMode('login')}>Log in</button><button type="button" aria-pressed={p.mode==='create'} disabled={p.busy} onClick={()=>p.onMode('create')}>Create account</button></div>
        <form onSubmit={p.onSubmit}>
          <label htmlFor="account-name">Account name</label><div className="web-key-input"><UserRound size={16}/><input id="account-name" autoComplete="username" autoCapitalize="none" spellCheck={false} minLength={3} maxLength={32} pattern="[a-zA-Z0-9][a-zA-Z0-9_.\-]{2,31}" value={p.name} onChange={e=>p.onName(e.target.value)} placeholder="Account name" required disabled={!p.ready||p.busy}/></div>
          {p.mode==='login'&&<><label htmlFor="account-key">8-digit account key</label><div className="web-key-input"><KeyRound size={16}/><input id="account-key" type={visible?'text':'password'} inputMode="numeric" pattern="[0-9]{8}" minLength={8} maxLength={8} autoComplete="current-password" value={p.accountKey} onChange={e=>p.onKey(e.target.value)} placeholder="Account key" required disabled={!p.ready||p.busy}/><button className="auth-reveal" type="button" aria-label={visible?'Hide account key':'Show account key'} aria-pressed={visible} onClick={()=>setVisible(!visible)}>{visible?<EyeOff size={16}/>:<Eye size={16}/>}</button></div></>}
          <label className="auth-remember"><input type="checkbox" checked={p.remember} disabled={p.busy} onChange={e=>p.onRemember(e.target.checked)}/>Remember me</label>
          <button className="primary auth-submit" disabled={!p.ready||p.busy||p.name.trim().length<3||(p.mode==='login'&&!/^\d{8}$/.test(p.accountKey))}>{!p.ready?'Connecting…':p.busy?(p.mode==='create'?'Creating…':'Signing in…'):p.mode==='create'?'Create account':'Log in'}<ArrowRight size={16}/></button>
        </form>
      </>}
      {p.error&&<p className="web-login-error auth-error" role="alert"><X size={14}/>{p.error}</p>}
    </section>
  </main>;
}

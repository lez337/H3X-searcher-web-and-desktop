import {useEffect,useState} from 'react';
import {Bell,BellOff} from 'lucide-react';

export default function Notifications({message,onDismiss,onLogs}:{message:string;onDismiss:(message:string)=>void;onLogs:()=>void}){
 const [muted,setMuted]=useState(false);
 useEffect(()=>{if(!message)return;const timer=setTimeout(()=>onDismiss(''),5000);return()=>clearTimeout(timer)},[message,onDismiss]);
 return <div className="notification-center">
  <div role="status">{message&&!muted&&<button type="button" className="notification-message" title="View logs" onClick={()=>{onDismiss('');onLogs()}}>{message}</button>}</div>
  <button type="button" className="notification-bell" aria-label={muted?'Unmute notifications':'Mute notifications'} aria-pressed={muted} title={muted?'Unmute notifications':'Mute notifications'} onClick={()=>{setMuted(!muted);onDismiss('')}}>{muted?<BellOff size={18}/>:<Bell size={18}/>}</button>
 </div>;
}

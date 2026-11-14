import {useEffect,useState} from 'react';

type InstallPrompt=Event&{prompt:()=>Promise<void>;userChoice:Promise<{outcome:string}>};
// Capture the browser event even before Settings is opened.
let availablePrompt:InstallPrompt|null=null;
window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();availablePrompt=event as InstallPrompt;window.dispatchEvent(new Event('h3x-install-available'))});
window.addEventListener('appinstalled',()=>{availablePrompt=null});
export default function InstallApp(){
  const [prompt,setPrompt]=useState<InstallPrompt|null>(availablePrompt),[installed,setInstalled]=useState(()=>window.matchMedia('(display-mode: standalone)').matches),[error,setError]=useState('');
  useEffect(()=>{
    const available=()=>setPrompt(availablePrompt);
    const done=()=>{setInstalled(true);setPrompt(null)};
    window.addEventListener('h3x-install-available',available);window.addEventListener('appinstalled',done);
    return()=>{window.removeEventListener('h3x-install-available',available);window.removeEventListener('appinstalled',done)};
  },[]);
  async function install(){if(!prompt)return;try{await prompt.prompt();await prompt.userChoice;availablePrompt=null;setPrompt(null)}catch{setError('Open your browser menu and choose Install H3X.')}}
  if(window.h3xDesktop)return <section className="web-connected-app"><h3>Connected Windows app</h3><p>This app and the website use the same account and deployed interface. Investigations save to the cloud. Reload or reopen H3X after a deployment to load new features.</p></section>;
  return <section className="web-connected-app"><h3>One app on desktop and web</h3><p>Install H3X from this website to open it in its own desktop window. Both versions use the same features and account workspace. Reopen the app to load deployed feature updates. An internet connection is required.</p>{installed?<p>H3X is running as an installed app.</p>:prompt?<button onClick={install}>Install H3X on this device</button>:<p>In Chrome or Edge, open the browser menu and choose <strong>Install H3X</strong> or <strong>Install this site as an app</strong>. On iPhone or iPad, use Share → Add to Home Screen.</p>}<p>The connected Windows app opens this same workspace. To transfer investigations from the older offline app, restore its workspace.json backup here.</p>{error&&<p role="alert">{error}</p>}</section>;
}

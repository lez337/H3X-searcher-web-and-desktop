'use strict';
const {app,BrowserWindow,ipcMain,session,shell,safeStorage,net}=require('electron');
const fs=require('node:fs/promises');
const path=require('node:path');
const {appUrl,trustedFrame,allowPermission}=require('./policy.cjs');
// Retain the original native Telegram/update profile while account investigations move to the cloud.
const dataDirectory=path.join(app.getPath('appData'),'h3x-searcher-v2');
require('node:fs').mkdirSync(dataDirectory,{recursive:true});app.setPath('userData',dataDirectory);
const development=!app.isPackaged&&process.argv.includes('--dev');
const origin=appUrl(development?(process.env.H3X_DEV_URL||'http://127.0.0.1:5173'):require('./config.json').appUrl,{development});
let mainWindow;
const userFile=name=>path.join(app.getPath('userData'),name);
const nativeIpc={handle(channel,handler){ipcMain.handle(channel,(event,...args)=>{
  if(!trustedFrame(event,mainWindow,origin))throw Error('Untrusted desktop request.');
  return handler(event,...args);
});}};
const {TelegramConnection}=require('../electron/telegram.cjs');
const telegram=new TelegramConnection({
  read:async()=>{try{const bytes=await fs.readFile(userFile('telegram.dpapi'));if(!safeStorage.isEncryptionAvailable())throw Error('Windows credential encryption is unavailable.');return JSON.parse(safeStorage.decryptString(bytes))}catch(error){if(error.code==='ENOENT')return null;throw error}},
  write:async value=>{
    const file=userFile('telegram.dpapi');
    if(!value){await fs.rm(file,{force:true});return;}
    if(!safeStorage.isEncryptionAvailable())throw Error('Windows credential encryption is unavailable.');
    await fs.mkdir(app.getPath('userData'),{recursive:true});await fs.writeFile(file+'.tmp',safeStorage.encryptString(JSON.stringify(value)));await fs.rename(file+'.tmp',file);
  }
});
for(const action of ['status','restore','begin','beginQr','verify','send','replies','logout'])nativeIpc.handle('telegram:'+action,async(_,payload)=>{
  try{return await telegram[action](payload||{})}catch(error){throw Error(String(error.errorMessage||error.message||'Telegram request failed.').replace(/\+\d{7,15}/g,'[phone]').slice(0,200))}
});
nativeIpc.handle('native:search',async(_,payload)=>{
  const providers=require('../electron/public-providers.cjs');
  if(payload?.provider==='ghunt')return providers.searchGhunt({query:payload.query,settings:payload.settings});
  if(payload?.provider==='telegram')return providers.searchTelegram({query:payload.query,settings:payload.settings,bots:payload.bots||[]},telegram);
  throw Error('Unknown local provider.');
});
nativeIpc.handle('external:open',async(_,value)=>{
  const url=new URL(value);if(!['https:','http:'].includes(url.protocol)||url.username||url.password)throw Error('Invalid external URL.');
  await shell.openExternal(url.href);return true;
});
nativeIpc.handle('native:reset',async()=>{telegram.cancelQr();await telegram.client?.disconnect();telegram.client=null;telegram.config=null;});
nativeIpc.handle('native:legacy-workspace',async()=>{
  const file=userFile('workspace.json');
  try{if((await fs.stat(file)).size>8*1024*1024)throw Error('Old workspace exceeds 8 MB.');return JSON.parse(await fs.readFile(file,'utf8'));}
  catch(error){if(error.code==='ENOENT')return null;throw error;}
});
async function createWindow(){
  const accountSession=session.fromPartition('persist:h3x-account',{cache:false});
  accountSession.setPermissionRequestHandler((contents,permission,callback,details)=>callback(contents===mainWindow?.webContents&&allowPermission(permission,details.requestingUrl,details.isMainFrame,origin)));
  accountSession.setPermissionCheckHandler((contents,permission,_requestingOrigin,details)=>contents===mainWindow?.webContents&&allowPermission(permission,details.requestingUrl,details.isMainFrame,origin));
  mainWindow=new BrowserWindow({width:1500,height:950,minWidth:850,minHeight:650,title:'H3X Searcher',backgroundColor:'#09090b',icon:path.join(__dirname,'../build/icon.ico'),autoHideMenuBar:true,webPreferences:{session:accountSession,preload:path.join(__dirname,'preload.cjs'),additionalArguments:['--h3x-origin='+origin],contextIsolation:true,nodeIntegration:false,sandbox:true,webSecurity:true}});
  mainWindow.setMenu(null);
  const external=value=>{try{const url=new URL(value);if(['http:','https:'].includes(url.protocol)&&!url.username&&!url.password)shell.openExternal(url.href).catch(()=>{});}catch{}};
  mainWindow.webContents.setWindowOpenHandler(({url})=>{external(url);return {action:'deny'}});
  const navigate=(event,url)=>{try{if(new URL(url).origin===origin)return}catch{}event.preventDefault();};
  mainWindow.webContents.on('will-navigate',navigate);mainWindow.webContents.on('will-redirect',navigate);
  mainWindow.webContents.on('will-attach-webview',event=>event.preventDefault());
  mainWindow.webContents.on('did-fail-load',(_event,code,_description,url,isMainFrame)=>{
    if(isMainFrame&&code!==-3&&url.startsWith(origin)){
      const html='<html><body style="background:#09090b;color:#eee;font:16px system-ui;padding:10vw"><h1>Connect to your workspace</h1><p>H3X needs an internet connection to load your account and investigations.</p><a style="color:#ddd" href="'+origin+'">Try again</a></body></html>';
      mainWindow.loadURL('data:text/html;charset=utf-8,'+encodeURIComponent(html)).catch(()=>{});
    }
  });
  mainWindow.on('close',()=>{accountSession.flushStorageData();accountSession.cookies.flushStore().catch(()=>{})});
  await mainWindow.loadURL(origin).catch(()=>{});
}
app.whenReady().then(async()=>{require('../electron/updates.cjs').setupUpdates({app,ipcMain:nativeIpc,net});await createWindow();});
app.on('activate',()=>{if(BrowserWindow.getAllWindows().length===0)createWindow();});
app.on('before-quit',()=>{telegram.cancelQr();telegram.client?.disconnect().catch(()=>{});});
app.on('window-all-closed',()=>{if(process.platform!=='darwin')app.quit();});

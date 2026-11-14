import freeProviders from '../electron/free-providers.cjs';

export const credentialNames=['oathnet',...freeProviders.catalog.filter(p=>p.credential).map(p=>p.id)];
const encoder=new TextEncoder();
export function validateCredential(name,value){
  if(!credentialNames.includes(name))throw Error('Unknown provider credential.');
  if(typeof value!=='string'||value.length>1024||/[\r\n\x00]/.test(value))throw Error('Invalid provider key.');
  return value.trim();
}
async function encryptionKey(env){
  if(!/^[a-f0-9]{64}$/i.test(env.H3X_CREDENTIALS_KEY||''))throw Error('Account key storage is not configured. Set the H3X_CREDENTIALS_KEY Worker secret.');
  return crypto.subtle.importKey('raw',Buffer.from(env.H3X_CREDENTIALS_KEY,'hex'),'AES-GCM',false,['encrypt','decrypt']);
}
export async function encryptCredential(env,accountId,name,value){
  const iv=crypto.getRandomValues(new Uint8Array(12));
  const data=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:encoder.encode(accountId+':'+name)},await encryptionKey(env),encoder.encode(value));
  return {version:1,iv:Buffer.from(iv).toString('hex'),data:Buffer.from(data).toString('base64')};
}
export async function decryptCredential(env,accountId,name,sealed){
  const key=await encryptionKey(env);
  try{
    const data=await crypto.subtle.decrypt({name:'AES-GCM',iv:Buffer.from(sealed.iv,'hex'),additionalData:encoder.encode(accountId+':'+name)},key,Buffer.from(sealed.data,'base64'));
    return new TextDecoder().decode(data);
  }catch{throw Error('Could not unlock the account provider key. Check the H3X_CREDENTIALS_KEY Worker secret.');}
}

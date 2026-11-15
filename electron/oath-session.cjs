'use strict';
const {createHash}=require('node:crypto');
// shortcut: reuse is local to this Worker instance; use account storage if cross-instance reuse is needed.
const sessions=new Map();
async function oathSession(query,key,{signal,request=fetch,now=Date.now}={}){
 signal?.throwIfAborted();
 if(!key)throw Error('Add an OathNet API key in Settings.');
 const id=createHash('sha256').update(key+'\0'+query).digest('hex');
 for(const [id,entry] of sessions)if(entry.expires<=now())sessions.delete(id);
 if(sessions.has(id))return sessions.get(id).promise;
 const entry={expires:now()+59*60*1000};
 entry.promise=(async()=>{
  const response=await request('https://oathnet.org/api/service/search/init',{method:'POST',redirect:'error',headers:{'x-api-key':key,'Content-Type':'application/json'},body:JSON.stringify({query}),signal:signal?AbortSignal.any([signal,AbortSignal.timeout(20000)]):AbortSignal.timeout(20000)});
  if(!response.ok)throw Error(`OathNet session initialization failed (HTTP ${response.status}).`);
  let body;try{body=await response.json()}catch{throw Error('OathNet returned an invalid search session.');}
  const session=body.data?.session;
  if(body.success===false||typeof session?.id!=='string'||!session.id.trim())throw Error('OathNet did not return a valid search session.');
  const expires=Date.parse(session.expires_at);
  if(Number.isFinite(expires))entry.expires=Math.min(entry.expires,expires);
  if(entry.expires<=now())throw Error('OathNet returned an expired search session.');
  return session.id;
 })();
 if(sessions.size>=500)sessions.delete(sessions.keys().next().value);
 sessions.set(id,entry);
 try{return await entry.promise}catch(error){if(sessions.get(id)===entry)sessions.delete(id);throw error}
}
module.exports={oathSession};

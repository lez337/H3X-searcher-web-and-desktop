import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../dist/server/index.js';
import {accountEnvironment,fixtureCookie,fixtureName} from './fixtures/account-session.mjs';
import {accountName,accountProviderKeys,resolveAccount} from '../worker/accounts.mjs';

const route='/api/account/credentials';
function call(env,path,body,cookie=fixtureCookie,headers={}){return worker.fetch(new Request('https://h3x.example'+path,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json',Cookie:cookie,...headers},...body===undefined?{}:{body:JSON.stringify(body)}}),env);}
test('Provider keys persist encrypted and only their owning account can use them',async()=>{
  const env=accountEnvironment(),key='synthetic-account-oath-key';
  assert.equal((await call(env,route,{name:'oathnet',value:key})).status,200);
  const status=await call(env,route);assert.equal((await status.json()).oathnet,true);
  const storage=env.H3X_ACCOUNTS.context(accountName(fixtureName).id).storage;
  const sealed=await storage.get('credential:oathnet');assert.equal(sealed.version,1);assert.ok(!JSON.stringify(sealed).includes(key));
  const account=await resolveAccount(new Request('https://h3x.example',{headers:{Cookie:fixtureCookie}}),env);
  assert.equal((await accountProviderKeys(env,account)).oathnet,key);
  for(const path of ['/api/workspace','/api/session',route])assert.ok(!(await (await call(env,path)).text()).includes(key));
  const created=await (await call(env,'/api/accounts',{name:'OtherAccount'})).json();
  const login=await call(env,'/api/login',{name:'OtherAccount',key:created.key}),otherCookie=login.headers.get('Set-Cookie').split(';')[0];
  assert.equal((await (await call(env,route,undefined,otherCookie)).json()).oathnet,false);
  assert.equal((await call(env,route,{name:'oathnet',value:'other-key'},otherCookie,{'X-H3X-Account':account.id})).status,401);
  assert.equal((await call(env,route,{name:'oathnet',value:''})).status,200);
  assert.equal((await (await call(env,route)).json()).oathnet,false);assert.equal(await storage.get('credential:oathnet'),undefined);
});
test('Credential writes validate input, require a session and fail closed without encryption configuration',async()=>{
  const env=accountEnvironment();
  assert.equal((await call(env,route,{name:'oathnet',value:'fixture'},'')).status,401);
  for(const body of [{name:'unknown',value:'fixture'},{name:'oathnet',value:'bad\nkey'},{name:'oathnet',value:'x'.repeat(1025)}])assert.equal((await call(env,route,body)).status,400);
  delete env.H3X_CREDENTIALS_KEY;
  const response=await call(env,route,{name:'oathnet',value:'never-store-plaintext'});assert.equal(response.status,400);assert.match((await response.json()).error,/H3X_CREDENTIALS_KEY/);
  assert.equal((await (await call(env,route)).json()).oathnet,false);
});
test('Account API searches use the account OathNet key, ignoring global and client overrides',async()=>{
  const env=accountEnvironment(),key='synthetic-owned-provider-key';env.OATHNET_API_KEY='wrong-global-key';
  await call(env,route,{name:'oathnet',value:key});
  const api=await (await call(env,'/api/account/api-key',{action:'create'})).json();
  const original=globalThis.fetch,keys=[];
  globalThis.fetch=async(url,options)=>{
    if(String(url).startsWith('https://api.brixhub.ru/'))return Response.json({data:{results:[]}});
    keys.push(new Headers(options.headers).get('x-api-key'));
    return new Response('{}',{status:401});
  };
  try{
    const response=await call(env,'/api/v1/discord/search',{userId:'123456789012345678',username:'fictional.user'},'',{Authorization:'Bearer '+api.key});
    assert.equal(response.status,200);const data=await response.text();assert.ok(keys.length>=1);assert.ok(keys.every(value=>value===key));assert.ok(!data.includes(key));assert.ok(!data.includes(env.OATHNET_API_KEY));
    assert.equal((await call(env,route,{name:'oathnet',value:'overwrite'},'',{Authorization:'Bearer '+api.key})).status,401);
  }finally{globalThis.fetch=original}
});
test('Remember me issues a thirty-day revocable cookie and matching server-side expiry',async()=>{
  const env=accountEnvironment(),created=await (await call(env,'/api/accounts',{name:'RememberOwner'})).json(),before=Date.now();
  const response=await call(env,'/api/login',{name:'RememberOwner',key:created.key,remember:true});
  assert.match(response.headers.get('set-cookie'),/Max-Age=2592000/);
  for(const flag of ['HttpOnly','Secure','SameSite=Strict'])assert.ok(response.headers.get('set-cookie').includes(flag));
  const meta=await env.H3X_ACCOUNTS.context(created.account.id).storage.get('account');assert.ok(meta.sessions[0].expires>=before+30*86400000);
  const cookie=response.headers.get('set-cookie').split(';')[0];await call(env,'/api/logout',{},cookie);assert.equal((await call(env,'/api/workspace',undefined,cookie)).status,401);
});

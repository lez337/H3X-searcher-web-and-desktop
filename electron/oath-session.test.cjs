const {test}=require('node:test'),assert=require('node:assert/strict');
const {oathSession}=require('./oath-session.cjs');
const {searchOath}=require('./providers.cjs');
const {searchProfile}=require('./oath-profiles.cjs');

test('sessions reuse concurrent requests, isolate keys and queries, and expire',async()=>{
 let calls=0,time=1000;
 const options={now:()=>time,request:async(url,options)=>{
  calls++;assert.equal(url,'https://oathnet.org/api/service/search/init');assert.equal(options.method,'POST');
  assert.deepEqual(Object.keys(JSON.parse(options.body)),['query']);
  return Response.json({data:{session:{id:'sess_'+calls,expires_at:new Date(time+60000).toISOString()}}});
 }};
 assert.deepEqual(await Promise.all([oathSession('alice','owner-a',options),oathSession('alice','owner-a',options)]),['sess_1','sess_1']);
 assert.equal(await oathSession('bob','owner-a',options),'sess_2');assert.equal(await oathSession('alice','owner-b',options),'sess_3');
 time+=60001;assert.equal(await oathSession('alice','owner-a',options),'sess_4');
});

test('failed or malformed session initialization never starts a dataset search',async()=>{
 const old=global.fetch;
 try{
  for(const response of [()=>Response.json({success:false}),()=>Response.json({data:{session:{id:''}}}),()=>new Response('{}',{status:429})]){
   let calls=0;global.fetch=async url=>{calls++;assert.ok(url.endsWith('/search/init'));return response()};
   await assert.rejects(searchOath({query:'failed',settings:{oathFamily:'stealer'}},'failure-key'),/session/);assert.equal(calls,1);
  }
 }finally{global.fetch=old}
});

test('datasets, pagination and account lookups share sessions and omit unrequested parameters',async()=>{
 const old=global.fetch,calls=[];
 global.fetch=async(url,options)=>{
  calls.push({url:new URL(url),options});
  if(url.endsWith('/search/init'))return Response.json({data:{session:{id:'sess_shared'}}});
  assert.equal(new URL(url).searchParams.get('search_id'),'sess_shared');
  return Response.json({data:url.includes('/steam?')?null:{items:[]}});
 };
 try{
  await searchOath({query:'example_user',settings:{oathOptions:{wildcard:false}}},'shared-key');
  await searchOath({query:'example_user',settings:{oathFamily:'stealer',cursor:'next',oathOptions:{has_log_id:false}}},'shared-key');
  await searchProfile({query:'example_user',profileKind:'steam'},'shared-key');
  assert.equal(calls.filter(c=>c.url.pathname.endsWith('/init')).length,1);
  for(const {url} of calls.filter(c=>c.url.pathname.endsWith('/search')&&!c.url.searchParams.has('cursor')))assert.deepEqual([...url.searchParams.keys()].sort(),['page_size','q','search_id']);
  const page=calls.find(c=>c.url.searchParams.has('cursor'));assert.equal(page.url.searchParams.get('has_log_id'),'false');
 }finally{global.fetch=old}
});

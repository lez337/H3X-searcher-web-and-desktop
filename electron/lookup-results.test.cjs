const test=require('node:test');
const assert=require('node:assert/strict');
const providers=require('./providers.cjs');

test('OathNet defaults to both datasets and reports a partial dataset failure',async()=>{
 const previous=global.fetch,requested=[];
 global.fetch=async url=>{requested.push(url);if(url.includes('/stealer/'))throw Error('Service unavailable');return {ok:true,text:async()=>JSON.stringify({data:{items:[{name:'Example'}]}})}};
 try{
  const result=await providers.searchOath({query:'example',settings:{}},'test-key');
  assert.equal(requested.length,2);
  assert.equal(result.items.length,1);
  assert.deepEqual(result.meta.datasets.map(d=>d.status),['complete','error']);
  assert.match(result.notice,/stealer unavailable: Service unavailable/);
  const {searchWorkflow}=require('./search-workflow.cjs');
  const batch=await searchWorkflow({providers:['oathnet'],query:'example',settings:{oathProfiles:false}},async()=>result);
  assert.equal(batch.items.length,1);
  assert.equal(batch.meta.providerStatus.find(s=>s.id==='oathnet-stealer').status,'error');
  assert.equal(batch.meta.providerStatus.find(s=>s.id==='oathnet-breach').status,'complete');
 }finally{global.fetch=previous}
});

test('OathNet default combined search preserves stealer cards and log references',async()=>{
 const previous=global.fetch;
 global.fetch=async url=>({ok:true,text:async()=>JSON.stringify({data:{items:url.includes('/stealer/')?[{log_id:'example-log'}]:[]}})});
 try{
  const result=await providers.searchOath({query:'example'},'test-key');
  assert.equal(result.items.length,1);
  assert.match(result.items[0].source,/stealer/);
  assert.equal(result.items[0].logId,'example-log');
 }finally{global.fetch=previous}
});

test('lookup rows preserve text source labels and separate log references',async()=>{
 const previous=global.fetch;
 global.fetch=async()=>({ok:true,text:async()=>JSON.stringify({data:{items:[{name:'Example',log_id:'example-log'}],results:[{name:'Example'}]},login:'example',handle:'example.org'})});
 try{
  const results=[
   await providers.searchOath({query:'example',settings:{oathFamily:'breach'}},'test-key'),
   await providers.searchOath({query:'example',settings:{oathFamily:'stealer'}},'test-key'),
   await providers.searchBrix({query:'example',settings:{}}),
   await providers.searchGithub({query:'example'}),
   await providers.searchRdap({query:'example.org'})
  ];
  for(const result of results){
   assert.equal(result.items.length,1);
   const item=result.items[0];
   assert.equal(typeof item.source,'string');
   assert.ok(item.source.length>0);
   assert.doesNotThrow(()=>item.source.replace(/oathnet/gi,'OathNet'));
   assert.ok(item.id.startsWith(item.source+'-'));
  }
  assert.equal(results[1].items[0].logId,'example-log');
  assert.equal(results[0].items[0].logId,undefined);
 }finally{global.fetch=previous}
});
const {searchWorkflow}=require('./search-workflow.cjs');

test('Oath pagination survives mixed providers and advances only unfinished datasets',async()=>{
 const previous=global.fetch,calls=[];
 global.fetch=async url=>{
  const u=new URL(url),family=u.pathname.includes('/stealer/')?'stealer':'breach',cursor=u.searchParams.get('cursor');calls.push({family,cursor});
  if(family==='stealer')assert.equal(u.searchParams.get('country[]'),'FR');
  return {ok:true,text:async()=>JSON.stringify({data:{items:[{id:family+(cursor||'first'),log_id:'fixture-log',password:'private'}],next_cursor:family==='stealer'&&!cursor?'stealer-page-2':null}})};
 };
 const search=task=>task.provider==='oathnet'?providers.searchOath(task,'fixture-key'):Promise.resolve({items:[],meta:{}});
 try{
  const first=await searchWorkflow({providers:['oathnet','brixhub'],query:'example',settings:{oathProfiles:false,oathFilters:{country:['FR']}}},search);
  assert.deepEqual(first.meta.oathPagination.cursors,{stealer:'stealer-page-2'});
  const next=await searchWorkflow({providers:['oathnet'],query:first.query,settings:{...first.meta.oathPagination.settings,oathCursors:first.meta.oathPagination.cursors}},search);
  assert.equal(calls.length,3);assert.deepEqual(calls[2],{family:'stealer',cursor:'stealer-page-2'});
  assert.equal(next.items.length,1);assert.equal(next.items[0].logId,'fixture-log');assert.equal(next.items[0].fields.password,'[redacted]');
  assert.ok(!first.items.some(item=>item.id===next.items[0].id));assert.equal(next.meta.oathPagination,undefined);
 }finally{global.fetch=previous}
});

test('Oath pagination retains failed dataset cursors for retry',async()=>{
 const previous=global.fetch;
 global.fetch=async url=>{if(url.includes('/stealer/'))throw Error('Unavailable');return {ok:true,text:async()=>JSON.stringify({data:{items:[]}})}};
 try{
  const result=await searchWorkflow({providers:['oathnet'],query:'example',settings:{oathProfiles:false}},task=>providers.searchOath(task,'fixture-key'));
  assert.deepEqual(result.meta.oathPagination.cursors,{stealer:''});
  assert.match(result.notice,/stealer unavailable/);
 }finally{global.fetch=previous}
});

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

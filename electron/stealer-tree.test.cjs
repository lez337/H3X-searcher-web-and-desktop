const {test}=require('node:test');
const assert=require('node:assert/strict');
const {loadRedactedTree}=require('./stealer-tree.cjs');
test('manifest loader returns original structure with personal names, IDs and file contents',async()=>{
  const old=global.fetch;const requests=[];
  global.fetch=async(url,options)=>{if(url.endsWith('/search/init'))return Response.json({data:{session:{id:'sess_tree'}}});requests.push(url);assert.equal(options.headers['x-api-key'],'test-key');return {ok:true,json:async()=>({victim_tree:{id:'private',name:'Private',type:'directory',children:[{name:'passwords.txt',type:'file',size_bytes:123,content:'secret'}]}})}};
  try{
    const {tree}=await loadRedactedTree('log/reference','test-key');
    assert.deepEqual(requests,['https://oathnet.org/api/service/v2/victims/log%2Freference?search_id=sess_tree']);
    assert.deepEqual(tree,{id:'private',name:'Private',type:'directory',children:[{name:'passwords.txt',type:'file',size_bytes:123,content:'secret'}]});
  }finally{global.fetch=old}
});
test('manifest loader handles unavailable logs without exposing provider response bodies',async()=>{
  await assert.rejects(loadRedactedTree('', 'key'),/No stealer log/);
  await assert.rejects(loadRedactedTree('log', ''),/API key/);
  const old=global.fetch;
  try{
    global.fetch=async()=>({ok:false,status:403});await assert.rejects(loadRedactedTree('log','key'),/HTTP 403/);
    global.fetch=async url=>Response.json(url.endsWith('/search/init')?{data:{session:{id:'sess_missing_tree'}}}:{});await assert.rejects(loadRedactedTree('log','key'),/did not return a file tree/);
  }finally{global.fetch=old}
});

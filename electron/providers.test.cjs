const test=require('node:test');
const assert=require('node:assert/strict');
const p=require('./providers.cjs');

test('automatic BrixHub search collects 300 records with unique IDs despite saved page size',async()=>{
 const old=global.fetch,requests=[];
 global.fetch=async(url,opts)=>{const body=JSON.parse(opts.body);requests.push(body);return Response.json({data:{results:Array.from({length:100},(_,i)=>({email:`user${(body.page-1)*100+i}@example.org`}))},meta:{page:body.page,pages:8}})};
 try{
  const out=await p.searchBrix({query:'person@example.org',settings:{brixAutoSearch:true,pageSize:20}});
  assert.deepEqual(requests.map(body=>[body.page,body.per_page]),[[1,100],[2,100],[3,100]]);
  assert.equal(out.items.length,300);assert.equal(new Set(out.items.map(item=>item.id)).size,300);
 }finally{global.fetch=old}
});

test('automatic BrixHub search stops repeated pages and retains records on later failure',async()=>{
 const old=global.fetch;let calls=0;
 const results=Array.from({length:100},(_,i)=>({email:`user${i}@example.org`}));
 global.fetch=async()=>{calls++;return Response.json({data:{results},meta:{pages:8}})};
 try{
  const options={query:'person@example.org',settings:{brixAutoSearch:true}};
  assert.equal((await p.searchBrix(options)).items.length,100);assert.equal(calls,2);
  calls=0;global.fetch=async()=>{if(++calls>1)throw Error('Page unavailable');return Response.json({data:{results},meta:{pages:8}})};
  const out=await p.searchBrix(options);assert.equal(out.items.length,100);assert.match(out.notice,/completed results retained/);
 }finally{global.fetch=old}
});
test('redacts credentials while preserving contact fields',()=>{
  const value=p.mask({email:'person@example.org',password:'hunter2',phone:'+1 555 123 4567',discord_id:'123456789012345678'});
  assert.equal(value.password,'[redacted]');assert.equal(value.email,'person@example.org');assert.equal(value.phone,'+1 555 123 4567');assert.equal(value.discord_id,'123456789012345678');
});
test('BrixHub only sends documented fields and parses result envelope',async()=>{
  const old=global.fetch;let request;
  global.fetch=async(url,opts)=>{request={url,opts};return {ok:true,text:async()=>JSON.stringify({data:{results:[{email:'person@example.org',password:'secret'}]},meta:{total:1,page:1,pages:1}})}};
  try{const out=await p.searchBrix({query:'person@example.org',settings:{brixField:'email',pageSize:20,brixFilters:{ville:'Paris',unknown:'ignored'}}});const body=JSON.parse(request.opts.body);assert.equal(request.url,'https://api.brixhub.ru/api/v1/search');assert.equal(body.email,'person@example.org');assert.equal(body.ville,'Paris');assert.equal(body.unknown,undefined);assert.equal(out.items[0].fields.password,'[redacted]')}finally{global.fetch=old}
});
test('OathNet sends key in header and never exposes it in result',async()=>{
  const old=global.fetch;let request;
  global.fetch=async(url,opts)=>{if(url.endsWith('/search/init'))return Response.json({data:{session:{id:'sess_provider'}}});request={url,opts};return {ok:true,text:async()=>JSON.stringify({success:true,data:{items:[{email:'person@example.org',token:'private'}],meta:{total:1}}})}};
  try{const out=await p.searchOath({query:'person@example.org',settings:{oathFamily:'breach'}},'test-key');assert.match(request.url,/\/service\/v2\/breach\/search/);assert.equal(request.opts.headers['x-api-key'],'test-key');assert.equal(out.items[0].fields.token,'[redacted]')}finally{global.fetch=old}
});
test('BrixHub normal names search all name fields and both first/last orders',async()=>{
  const old=global.fetch,requests=[];
  global.fetch=async(url,opts)=>{requests.push(JSON.parse(opts.body));return {ok:true,text:async()=>JSON.stringify({data:{results:[]}})}};
  try{
    await p.searchBrix({query:'Dupont Jean Paul',settings:{brixField:'auto',brixFilters:{ville:'Paris'}}});
    assert.equal(requests.length,9);
    assert.ok(requests.some(body=>body.nom_famille==='Dupont'&&body.prenom==='Jean Paul'));
    assert.ok(requests.some(body=>body.prenom==='Dupont'&&body.nom_famille==='Jean Paul'));
    for(const field of ['prenom','nom_famille','nom_affichage','nom_naissance','nom_utilisateur'])assert.ok(requests.some(body=>body[field]==='Dupont Jean Paul'));
    assert.ok(requests.every(body=>body.ville==='Paris'));
  }finally{global.fetch=old}
});

test('BrixHub ignores stale explicit field settings and detects the query',async()=>{
 const old=global.fetch;let body;
 global.fetch=async(url,opts)=>{body=JSON.parse(opts.body);return {ok:true,text:async()=>JSON.stringify({data:{results:[]}})}};
 try{await p.searchBrix({query:'person@example.org',settings:{brixField:'telephone'}});assert.equal(body.email,'person@example.org');assert.equal(body.telephone,undefined)}finally{global.fetch=old}
});
test('OathNet forwards search controls, repeated filters and structured trees',async()=>{
 const old=global.fetch;let url;
 global.fetch=async(u)=>{if(u.endsWith('/search/init'))return Response.json({data:{session:{id:'sess_controls'}}});url=new URL(u);return {ok:true,text:async()=>JSON.stringify({data:{items:[]}})}};
 const filter={and:[{field:'email',operator:'eq',value:'person@example.org'}]};
 try{await p.searchOath({query:'example',settings:{oathFamily:'stealer',oathOptions:{logic:'and',wildcard:true,sort:'indexed_at:desc'},oathFilters:{email:['a@example.org','b@example.org'],filter}}},'key');assert.equal(url.searchParams.get('wildcard'),'true');assert.equal(url.searchParams.get('logic'),'and');assert.deepEqual(url.searchParams.getAll('email[]'),['a@example.org','b@example.org']);assert.deepEqual(JSON.parse(url.searchParams.get('filter')),filter)}finally{global.fetch=old}
});

test('OathNet validates structured operators, arrays, patterns and nesting',()=>{
 assert.doesNotThrow(()=>p.validateFilter({and:[{field:'country',operator:'in',value:['FR','IT']},{field:'email',operator:'exists',value:false}]}));
 for(const filter of [{field:'country',operator:'in',value:'FR'},{field:'ip',operator:'contains',value:'192'},{field:'email',operator:'wildcard',value:'*a*'},{field:'email',operator:'exists',value:'true'},{and:Array.from({length:51},()=>({field:'email',operator:'eq',value:'a@b.com'}))},{and:[{or:[{and:[{field:'email',operator:'eq',value:'a@b.com'}]}]}]}])assert.throws(()=>p.validateFilter(filter));
});

test('BrixHub forwards the added screenshot filter fields',async()=>{
 const old=global.fetch;let body;
 global.fetch=async(url,opts)=>{body=JSON.parse(opts.body);return {ok:true,text:async()=>JSON.stringify({data:{results:[]}})}};
 try{const filters={adresse:'10 rue de la Paix',nom_naissance:'Martin',date_naissance:'1990-06-15',steam_id:'steam:123',fivem_license:'license:abc',nir:'123',iban:'FR76',bic:'TEST',vin:'AB-123-CD'};await p.searchBrix({query:'test_user',settings:{brixFilters:filters}});for(const [key,value] of Object.entries(filters))assert.equal(body[key],value)}finally{global.fetch=old}
});

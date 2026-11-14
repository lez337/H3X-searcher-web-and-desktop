const {test}=require('node:test');
const assert=require('node:assert/strict');
const {parseSearchCommands,searchCommands}=require('../src/searchCommands.ts');
const {searchBrix,searchOath}=require('./providers.cjs');

test('slash filters translate to both providers without changing saved settings',()=>{
 const base={brixFilters:{ville:'Lyon'},oathFilters:{city:['Lyon']},page:3};
 const result=parseSearchCommands('/name "Jean Dupont" /city Paris /country FR /age 18-30 /limit 50',base);
 assert.equal(result.error,'');assert.equal(result.query,'');
 assert.deepEqual(result.settings.brixFilters,{ville:'Paris',nom_affichage:'Jean Dupont',pays:'FR'});
 assert.deepEqual(result.settings.oathFilters.name,['Jean Dupont']);
 assert.deepEqual(result.settings.oathFilters.filter,{and:[{field:'age',operator:'gte',value:'18'},{field:'age',operator:'lte',value:'30'}]});
 assert.equal(result.settings.pageSize,50);assert.deepEqual(base,{brixFilters:{ville:'Lyon'},oathFilters:{city:['Lyon']},page:3});
});
test('plain queries, URLs, apostrophes, quoted slashes, aliases and repeated filters survive parsing',()=>{
 for(const input of ['https://example.org/path','Jean O\'Connor','/tmp/file','email@example.org'])assert.equal(parseSearchCommands(input,{}).query,input);
 const result=parseSearchCommands('example.org /address "10 /city Street" /surname O\'Connor /email a@example.org /email b@example.org /first-name Jean',{});
 assert.equal(result.error,'');assert.equal(result.query,'example.org');assert.equal(result.settings.brixFilters.adresse,'10 /city Street');assert.equal(result.settings.brixFilters.nom_famille,"O'Connor");assert.equal(result.settings.brixFilters.prenom,'Jean');assert.deepEqual(result.settings.oathFilters.email,['a@example.org','b@example.org']);
});
test('options and username settings accept typed values; invalid commands fail clearly',()=>{
 const result=parseSearchCommands('test /type username /flexible off /profiles on /family breach /wildcard true /page 2 /sites all /concurrency max /site github',{});
 assert.equal(result.error,'');assert.equal(result.settings.searchQueryType,'username');assert.equal(result.settings.flexible,false);assert.equal(result.settings.oathOptions.wildcard,true);assert.equal(result.settings.usernameSearchOptions.concurrency,'max');
 for(const input of ['/name','/name "unfinished','/name ""','/unknown hi','/age 30-18','/age 1.5','/age 131','/limit 12','/page -1','/type wrong','/flexible maybe','/family wrong','/concurrency 101'])assert.ok(parseSearchCommands(input,{}).error,input);
 const names=searchCommands.flatMap(c=>[c.name,...c.aliases||[]]);assert.equal(new Set(names).size,names.length,'command aliases are unambiguous');
});

test('username command settings use current saved options and ignore legacy scan limits',()=>{
 const legacy={usernameSearchOptions:{limit:2000,category:'social',siteFilter:'old',concurrency:5}};
 assert.deepEqual(parseSearchCommands('Jane',legacy).settings.usernameSearchOptions,{limit:'all',category:'',siteFilter:'',concurrency:10,schemaVersion:2});
 const current={usernameSearchOptions:{...legacy.usernameSearchOptions,schemaVersion:2}};
 assert.deepEqual(parseSearchCommands('Jane',current).settings.usernameSearchOptions,current.usernameSearchOptions);
 assert.equal(parseSearchCommands('Jane /sites 500',legacy).settings.usernameSearchOptions.limit,500);
 assert.equal(legacy.usernameSearchOptions.limit,2000);
});
test('age comparisons combine with saved structured rules',()=>{
 const prior={field:'city',operator:'eq',value:'Paris'};
 for(const age of ['25','>=18','<=30','>20','<70']){
  const result=parseSearchCommands('/age '+age,{oathFilters:{filter:prior}});assert.equal(result.error,'');assert.deepEqual(result.settings.oathFilters.filter.and[0],prior);
 }
});
test('translated slash filters reach provider request bodies and parameters',async()=>{
 const previous=global.fetch,requests=[];
 global.fetch=async(url,options)=>{requests.push({url:String(url),options});return {ok:true,text:async()=>JSON.stringify({data:{items:[],results:[]}})}};
 try{
  const result=parseSearchCommands('/name "Jean Dupont" /city Paris /age >=18 /family breach /limit 50',{});
  await searchBrix({query:result.query,settings:result.settings});
  assert.equal(JSON.parse(requests[0].options.body).nom_affichage,'Jean Dupont');assert.equal(JSON.parse(requests[0].options.body).ville,'Paris');
  await searchOath({query:result.query,settings:result.settings},'test-key');
  const params=new URL(requests.at(-1).url).searchParams;assert.equal(params.get('name[]'),'Jean Dupont');assert.equal(params.get('city[]'),'Paris');assert.equal(params.get('page_size'),'50');assert.equal(JSON.parse(params.get('filter')).operator,'gte');assert.equal(params.has('q'),false);
 }finally{global.fetch=previous;}
});

test('/name searches every BrixHub name field and both orders, preserving filters and deduplicating records',async()=>{
 const previous=global.fetch,requests=[];
 global.fetch=async(url,options)=>{
  const body=JSON.parse(options.body);requests.push(body);
  const record=requests.length%2?{email:'jean@example.org',name:'Jean Dupont'}:{name:'Jean Dupont',email:'jean@example.org'};
  return {ok:true,text:async()=>JSON.stringify({data:{results:[record,{variant:JSON.stringify(body)}]},meta:{pages:3}})};
 };
 try{
  const parsed=parseSearchCommands('/name "Jean Dupont" /city Paris /country FR /page 2',{});
  const result=await searchBrix({query:parsed.query,settings:parsed.settings});
  for(const field of ['nom_affichage','prenom','nom_famille','nom_naissance','nom_utilisateur'])assert.ok(requests.some(body=>body[field]==='Jean Dupont'),field);
  assert.ok(requests.some(body=>body.prenom==='Jean'&&body.nom_famille==='Dupont'));
  assert.ok(requests.some(body=>body.prenom==='Dupont'&&body.nom_famille==='Jean'));
  assert.equal(requests.length,7);
  for(const body of requests){assert.equal(body.ville,'Paris');assert.equal(body.pays,'FR');assert.equal(body.page,2);if(body.prenom||body.nom_famille||body.nom_naissance||body.nom_utilisateur)assert.equal(body.nom_affichage,undefined);}
  assert.equal(result.items.length,8);assert.equal(new Set(result.items.map(item=>item.id)).size,8);assert.equal(result.meta.pages,3);assert.equal(result.meta.total,null);
  assert.equal(parsed.settings.brixFilters.nom_affichage,'Jean Dupont');
 }finally{global.fetch=previous;}
});

test('BrixHub broad names retain successes when a variant fails and never overwrite explicit first-name filters',async()=>{
 const previous=global.fetch,requests=[];
 global.fetch=async(url,options)=>{
  const body=JSON.parse(options.body);requests.push(body);
  if(body.nom_naissance)throw Error('Unavailable');
  return {ok:true,text:async()=>JSON.stringify({data:{results:[{name:'Jean Dupont'}]}})};
 };
 try{
  const parsed=parseSearchCommands('/name Dupont /first_name Jean',{});
  const result=await searchBrix({query:parsed.query,settings:parsed.settings});
  assert.equal(requests.length,4);assert.ok(requests.every(body=>body.prenom==='Jean'));
  assert.equal(result.items.length,1);assert.equal(result.meta.nameSearchErrors,1);assert.match(result.notice,/completed results retained/);
 }finally{global.fetch=previous;}
});

test('normal BrixHub auto and manual names expand while explicit fields and OathNet stay precise',async()=>{
 const previous=global.fetch,requests=[];
 global.fetch=async(url,options)=>{requests.push({url:String(url),body:options?.body?JSON.parse(options.body):null});return {ok:true,text:async()=>JSON.stringify({data:{results:[{name:'Jhon Doe'}],items:[]}})}};
 try{
  for(const settings of [{},{searchQueryType:'name'}]){
   requests.length=0;const result=await searchBrix({query:'Jhon Doe',settings});
   assert.equal(requests.length,7);assert.equal(result.items.length,1);
   assert.ok(requests.some(({body})=>body.prenom==='Jhon'&&body.nom_famille==='Doe'));
   assert.ok(requests.some(({body})=>body.prenom==='Doe'&&body.nom_famille==='Jhon'));
  }
  requests.length=0;await searchBrix({query:'Jhon',settings:{searchQueryType:'name'}});assert.equal(requests.length,5);
  for(const [type,field] of [['first_name','prenom'],['last_name','nom_famille'],['username','nom_utilisateur']]){
   requests.length=0;await searchBrix({query:'Jhon',settings:{searchQueryType:type}});assert.equal(requests.length,1);assert.equal(requests[0].body[field],'Jhon');
  }
  requests.length=0;await searchBrix({query:'Jhon Doe',terms:{prenom:'Jhon',nom_famille:'Doe'},settings:{}});assert.equal(requests.length,1);
  requests.length=0;await searchOath({query:'Jhon Doe',settings:{oathFamily:'breach'}},'test-key');assert.equal(requests.length,1);assert.equal(new URL(requests[0].url).searchParams.get('q'),'Jhon Doe');
 }finally{global.fetch=previous;}
});

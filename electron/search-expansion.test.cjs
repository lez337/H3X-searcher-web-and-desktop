const {test}=require('node:test'),assert=require('node:assert/strict');
const {runDeepSearch}=require('./people-deep.cjs');
const {searchBrix,searchOath}=require('./providers.cjs');
const {searchWorkflow}=require('./search-workflow.cjs');
const {groupPeople}=require('../src/peopleModel.ts');
const {deepTerms,makeDeepPlan,deepDefaults,classifyDeepHits,nextDeepSearchTerms}=require('../src/peopleDeepModel.ts');
const {hiddenField,visibleFields}=require('../src/fieldVisibility.ts');
const {textReport}=require('./investigation.cjs');
test('long search paginates beyond 300, deduplicates tasks and stops repeated pages',async()=>{
 const task={provider:'brixhub',query:'test@example.org',field:'email',filtered:false,filters:{}};let calls=0;
 const result=await runDeepSearch({tasks:[task,{...task}],pages:0,longSearch:true},{brix:async p=>{calls++;const page=Math.min(p.settings.page,5);return {items:[{fields:{email:'test@example.org',page}}],meta:{pages:20}}}});
 assert.equal(calls,6);assert.equal(result.items.length,5);assert.match(result.warnings.join(' '),/repeated a page/);
});
test('IP alone never matches identity; IP tasks require independent identity filters',()=>{
 const item=fields=>({id:'a',source:'Test',fields});const seed=groupPeople([item({name:'Alex Example',email:'alex@example.org',phone:'+33612345678',ip:'8.8.8.8'})])[0];
 const matches=classifyDeepHits(seed,[item({name:'Other Person',ip:'8.8.8.8'})]);assert.equal(matches.same.length,0);assert.equal(matches.related.length,0);
 const plan=makeDeepPlan(seed,deepTerms(seed),{...deepDefaults,longSearch:true},{});const ips=plan.tasks.filter(t=>t.field==='adresse_ip');assert.ok(ips.length);assert.ok(ips.every(t=>t.filtered&&t.filters.email==='alex@example.org'));assert.ok(plan.tasks.filter(t=>t.provider==='oathnet').every(t=>!t.terms.includes('8.8.8.8')));
});
test('filters-only requests omit query and guessed identity fields',async()=>{
 const old=global.fetch;const calls=[];global.fetch=async(url,options)=>{if(url.endsWith('/search/init'))return Response.json({data:{session:{id:'sess_filter'}}});calls.push({url,options});return {ok:true,text:async()=>JSON.stringify({data:{results:[],items:[]}})}};
 try{await searchBrix({query:'',settings:{brixFilters:{nom_famille:'Example',ville:'Paris'}}});const body=JSON.parse(calls[0].options.body);assert.equal(body.nom_famille,'Example');assert.equal(body.nom_utilisateur,undefined);
 await searchOath({query:'',settings:{oathFamily:'breach',oathFilters:{last_name:['Example']}}},'key');const url=new URL(calls[1].url);assert.equal(url.searchParams.has('q'),false);assert.equal(url.searchParams.get('last_name[]'),'Example');
 await assert.rejects(searchBrix({query:'',settings:{}}),/at least one/);await assert.rejects(searchOath({query:'',settings:{oathFamily:'breach'}},'key'),/at least one/);
 }finally{global.fetch=old}
});
test('username provider runs after dataset and profile enrichment',async()=>{
 const calls=[];await searchWorkflow({providers:['whatsmyname','oathnet','github'],query:'example_user',settings:{}},async p=>{calls.push(p.provider);return {items:[],meta:{}}});assert.equal(calls.at(-1),'whatsmyname');assert.equal(calls.filter(p=>p==='whatsmyname').length,1);
});
test('hidden fields support wildcards, camelCase and nested data and never reach TXT export',()=>{
 assert.equal(hiddenField('createdAt',['created_at']),true);assert.equal(hiddenField('internal_note',['internal_*']),true);assert.equal(hiddenField('x(a)',['x(a)']),true);
 assert.deepEqual(visibleFields({name:'Alex',created_at:'x',nested:{internal_note:'x',email:'a@b.c'}},['created_at','internal_*']),{name:'Alex',nested:{email:'a@b.c'}});
 const out=textReport({people:[{name:'Alex',email:'secret@example.org',evidence:[]}]},[],{hiddenFields:['email']});assert.equal(out.includes('secret@example.org'),false);
});

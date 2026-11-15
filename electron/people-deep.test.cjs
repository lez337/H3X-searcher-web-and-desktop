'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {groupPeople}=require('../src/peopleModel.ts');
const {deepDefaults,deepTerms,makeDeepPlan,pendingDeepPlan,trustedDeepHits,reviewDeepFacts,reviewedPerson,discoveredContacts,classifyDeepHits,deepReviewGroups,deepRecordGroups,reviewedPeople,classifyDeepNetwork,nextDeepSearchTerms}=require('../src/peopleDeepModel.ts');
const {exportSearchPerson}=require('../src/peopleExport.ts');
const {prepare,textReport}=require('./investigation.cjs');
const {validatePlan,cleanRecord,recordItem,oathBulk,runDeepSearch,registerDeepSearch}=require('./people-deep.cjs');
const {searchBrix}=require('./providers.cjs');
const item=(id,fields,source='OathNet · breach')=>({id,source,fields});
const seed=()=>groupPeople([item('seed',{name:'Alex Example',email:'alex@example.org',phone:'+33 6 12 34 56 78',dob:'1990-06-15',city:'Paris',country:'FR'})])[0];

test('plans one broad Oath bulk plus explicit filtered and unfiltered Brix terms',()=>{
 const person=seed(),terms=deepTerms(person),plan=makeDeepPlan(person,terms,{...deepDefaults,related:false},{oathFilters:{city:['Lyon']},oathOptions:{cursor:'old',search_id:'old'},brixFilters:{ville:'Lyon'}});
 validatePlan(plan);assert.equal(plan.tasks.filter(t=>t.provider==='oathnet').length,1);
 const filtered=plan.tasks.find(t=>t.provider==='brixhub'&&t.field==='email'&&t.filtered),broad=plan.tasks.find(t=>t.provider==='brixhub'&&t.field==='email'&&!t.filtered);
 assert.equal(filtered.filters.nom_affichage,'Alex Example');assert.equal(filtered.filters.date_naissance,'1990-06-15');assert.equal(filtered.filters.ville,'Paris');assert.equal(filtered.filters.email,undefined);assert.deepEqual(broad.filters,{});
 assert.ok(!terms.some(t=>['date_of_birth','city','country'].includes(t.key)));
 const saved=makeDeepPlan(person,terms,{...deepDefaults,savedFilters:true,mode:'filtered'}, {oathFilters:{city:['Lyon']},oathOptions:{cursor:'old'}});
 assert.deepEqual(saved.tasks.find(t=>t.provider==='oathnet'&&t.filtered).filters.city,['Lyon']);
 assert.deepEqual(plan.tasks.find(t=>t.provider==='oathnet'&&!t.filtered).filters,{});
});

test('Oath savings remove the extra pass while filtered-only and opting out retain their filters',()=>{
 const person=seed(),terms=deepTerms(person),settings={oathFilters:{city:['Lyon']},oathOptions:{sort:'-indexed_at'}};
 const plan=makeDeepPlan(person,terms,{...deepDefaults,savedFilters:true},settings);
 const oath=plan.tasks.filter(task=>task.provider==='oathnet');
 assert.equal(oath.length,1);assert.equal(oath[0].filtered,false);assert.deepEqual(oath[0].filters,{});
 assert.deepEqual(new Set(oath[0].terms),new Set(terms.map(term=>term.value)));
 const both=makeDeepPlan(person,terms,{...deepDefaults,saveOath:false,savedFilters:true},settings).tasks.filter(task=>task.provider==='oathnet');
 assert.equal(both.length,2);assert.deepEqual(both.find(task=>task.filtered).filters.city,['Lyon']);
 const filtered=makeDeepPlan(person,terms,{...deepDefaults,mode:'filtered',savedFilters:true},settings).tasks.find(task=>task.provider==='oathnet');
 assert.equal(filtered.filtered,true);assert.deepEqual(filtered.filters.city,['Lyon']);assert.equal(filtered.options.sort,'-indexed_at');
});

test('follow-up ledger deduplicates Oath identifiers across reordered and overlapping batches without hiding different filters',()=>{
 const requests=new Set(),task={provider:'oathnet',family:'breach',terms:[' alex@example.org ','Alex Example','alex@example.org'],filters:{city:['Paris'],country:['FR']},filtered:false};
 const initial={pages:1,tasks:[task]};
 assert.deepEqual(pendingDeepPlan(initial,requests).tasks[0].terms,['alex@example.org','Alex Example']);
 const next={...initial,tasks:[{...task,filters:{country:['FR'],city:['Paris']},terms:['Alex Example','next@example.org','alex@example.org']}]};
 assert.deepEqual(pendingDeepPlan(next,requests).tasks[0].terms,['next@example.org']);
 assert.equal(pendingDeepPlan(next,requests).tasks.length,0);
 assert.equal(pendingDeepPlan({...initial,tasks:[{...task,filters:{city:['Lyon']}}]},requests).tasks.length,1);
 assert.equal(pendingDeepPlan(initial,new Set()).tasks[0].terms.length,2,'Search again gets a fresh ledger');
 assert.equal(initial.tasks[0].terms.length,3,'preview remains unchanged');
});

test('runner submits overlapping Oath terms only once per query configuration',async()=>{
 const calls=[],task={provider:'oathnet',family:'breach',terms:['alex@example.org','Alex Example'],filters:{},filtered:false};
 const out=await runDeepSearch({pages:1,tasks:[task,{...task,terms:['Alex Example','next@example.org']},{...task,terms:['alex@example.org']},{...task,terms:['alex@example.org'],filters:{country:['FR']}}]},{oath:async task=>{
  calls.push(task);return {items:[]};
 }});
 assert.deepEqual(calls.map(task=>task.terms),[['alex@example.org','Alex Example'],['next@example.org'],['alex@example.org']]);
 assert.equal(out.completed,4);assert.equal(out.warnings.length,0);
});

test('no duplicate passes or conflicting seed terms; explicit split names become a full-name query',()=>{
 const [person]=groupPeople([item('split',{first_name:'Alex',last_name:'Example',email:'a@example.org',username:'alex'})]);
 assert.ok(deepTerms(person).some(t=>t.value==='Alex Example'));
 const username=deepTerms(person).filter(t=>t.key==='username');
 const plan=makeDeepPlan({...person,details:person.details.filter(d=>d.key==='username')},username,{...deepDefaults,brix:false},{});
 assert.equal(plan.tasks.length,1);
 const conflicting={...person,details:person.details.map(d=>({...d,conflict:true}))};assert.deepEqual(deepTerms(conflicting),[]);
});

test('strong matches need two identity signals and block name or birth conflicts',()=>{
 const rows=[
  item('email-name',{email:'ALEX@example.org',name:'EXAMPLE Alex',city:'Lyon'}),
  item('phone-birth',{telephone:'06 12 34 56 78',dob:'15/06/1990'}),
  item('name-birth',{first_name:'Alex',last_name:'Example',dob:'1990-06-15',email:'new@example.org'}),
  item('two-contacts',{email:'alex@example.org',phone:'+33612345678'}),
  item('name-only',{name:'Alex Example'}),item('contact-only',{email:'alex@example.org'}),
  item('bad-name',{name:'Sam Other',email:'alex@example.org',dob:'1990-06-15'}),
  item('bad-birth',{name:'Alex Example',email:'alex@example.org',dob:'1980-01-01'}),
  item('username-only',{username:'alex',city:'Paris'}),item('dob-only',{dob:'1990-06-15'}),
 ];
 const result=trustedDeepHits(seed(),rows);assert.deepEqual(result.hits.map(h=>h.item.id),['email-name','phone-birth','name-birth','two-contacts']);assert.equal(result.rejected,6);
});

test('follow-up contacts never become new identity anchors that drift from the original person',()=>{
 const accepted=item('accepted',{name:'Alex Example',email:'alex@example.org',other:{email:'new@example.org'}});
 const hit=trustedDeepHits(seed(),[accepted]).hits,found=discoveredContacts(seed(),hit,deepTerms(seed()));assert.ok(found.some(t=>t.value==='new@example.org'));
 const foreign=item('foreign',{email:'new@example.org',name:'Sam Other'});assert.equal(trustedDeepHits(seed(),[foreign]).hits.length,0);
 assert.equal(trustedDeepHits(seed(),[item('new-contact-only',{email:'new@example.org'})]).hits.length,0);
});

test('shared contacts and surname/address correlations surface different people as separate possible connections',()=>{
 const [person]=groupPeople([item('origin',{first_name:'Alex',last_name:'Example',phone:'+33612345678',email:'alex@example.org',dob:'1990-06-15',address:'10 Example Street',username:'alexex'})]);
 const records=[
  item('relative',{prenom:'Nina',nom_famille:'Example',telephone:'06 12 34 56 78',dob:'1960-02-20'}),
  item('household',{first_name:'Sam',last_name:'Example',address:'10 EXAMPLE STREET'}),
  item('shared-email',{name:'Different Person',email:'alex@example.org'}),
  item('handle-surname',{first_name:'Nina',last_name:'Example',username:'alexex'}),
  item('surname-only',{name:'Someone Example'}),item('address-only',{address:'10 Example Street'}),item('username-only',{username:'alexex'}),
 ];
 const matches=classifyDeepHits(person,records);assert.equal(matches.same.length,0);
 assert.deepEqual(matches.related.map(match=>match.item.id),['relative','household','shared-email','handle-surname']);
 assert.ok(matches.related[0].reasons.includes('Same seed phone'));assert.ok(matches.related[0].reasons.includes('Surname agrees'));assert.ok(matches.related[0].conflicts.includes('Different full name'));
 assert.deepEqual(matches.unmatched.map(match=>match.item.id),['surname-only','address-only','username-only']);
 const groups=deepReviewGroups(person,matches,[]);assert.equal(groups.length,7);assert.ok(groups.slice(1).every(group=>group.rows.every(row=>!row.keep)));
 assert.equal(groups.filter(group=>group.person.items.some(item=>item.id==='relative')||group.person.items.some(item=>item.id==='handle-surname')).length,1);
 assert.equal(groups[0].rows.some(row=>row.value==='Nina'),false);
});

test('correlations use newly discovered strong-match contacts without recursively adopting related identities',()=>{
 const records=[item('same',{name:'Alex Example',email:['alex@example.org','linked@example.org']}),item('linked',{name:'Other Person',email:['linked@example.org','further@example.org']}),item('unlinked',{name:'Third Person',email:'further@example.org'})];
 const matches=classifyDeepHits(seed(),records);assert.deepEqual(matches.same.map(hit=>hit.item.id),['same']);assert.deepEqual(matches.related.map(hit=>hit.item.id),['linked']);assert.deepEqual(matches.unmatched.map(hit=>hit.item.id),['unlinked']);
 assert.ok(matches.related[0].reasons.includes('Email shared with a same-person result'));
});

test('related contact passes relax automatic identity restrictions, preserve saved filters and keep other query shapes intact',()=>{
 const person=seed(),plan=makeDeepPlan(person,deepTerms(person),{...deepDefaults,savedFilters:true},{brixFilters:{pays:'FR'}});
 const contact=plan.tasks.find(task=>task.provider==='brixhub'&&task.field==='telephone'&&task.filtered);
 assert.deepEqual(contact.filters,{pays:'FR'});assert.equal(plan.tasks.find(task=>task.provider==='brixhub'&&task.field==='nom_affichage'&&task.filtered).filters.date_naissance,'1990-06-15');
 const broad=makeDeepPlan(person,deepTerms(person),deepDefaults,{});assert.equal(broad.tasks.filter(task=>task.provider==='brixhub'&&task.field==='email').length,1);
});

test('selected related and unmatched reports export independently, retain edits and correlation context, and respect exclusions',async()=>{
 const records=[item('nina',{first_name:'Nina',last_name:'Example',phone:'+33612345678',dob:'1960-02-20',city:'Lyon'}),item('unknown',{name:'Unlinked Person',email:'unlinked@example.org',city:'Nice'})];
 let groups=deepReviewGroups(seed(),classifyDeepHits(seed(),records),['city']);
 groups=groups.map(group=>group.kind==='same'?group:{...group,rows:group.rows.filter(row=>row.key!=='phone').map(row=>({...row,keep:true,value:row.value==='Nina'?'Nina edited':row.value,edited:row.value==='Nina'}))});
 const reviewed=reviewedPeople(groups);assert.equal(reviewed.length,3);assert.match(reviewed[1].reviewContext,/Possible connection/);assert.match(reviewed[2].reviewContext,/Unmatched record/);
 const current=i=>({id:'p'+i,name:'Person '+(i+1),phone:'',email:'',username:'',address:'',notes:'',evidence:[]});
 const saved=await Promise.all(reviewed.map((person,i)=>exportSearchPerson(person,current(i),async p=>prepare(p.fields,p.excluded,p.current),['city'],'Deep search')));
 assert.equal(saved[0].dateOfBirth,'1990-06-15');assert.equal(saved[1].dateOfBirth,'1960-02-20');assert.equal(saved[1].phone,'');assert.match(JSON.stringify(saved[1]),/Nina edited/);assert.doesNotMatch(JSON.stringify(saved),/Lyon|Nice/);assert.match(saved[1].notes,/Possible connection/);assert.match(saved[2].notes,/Unmatched record/);
 const hidden=reviewedPeople(groups.filter(group=>group.kind==='same'));assert.equal(hidden.length,1);
 const excluded=await exportSearchPerson(reviewed[1],current(1),async p=>prepare(p.fields,p.excluded,p.current),['notes'],'Deep search');assert.equal(excluded.notes,'');
});

test('repeated provider searches never corroborate new facts; two families do and alternatives stay unchecked',()=>{
 const first=item('first',{name:'Alex Example',email:'alex@example.org',occupation:'Designer',dob:'1990-06-15',age:35});
 const repeat=item('repeat',first.fields,'OathNet - profiles');
 const rows=reviewDeepFacts(seed(),trustedDeepHits(seed(),[first,repeat]).hits,[]);
 assert.equal(rows.find(r=>r.key==='occupation').corroborated,false);assert.equal(rows.find(r=>r.key==='occupation').keep,false);
 const second=item('second',{...first.fields,age:36},'BrixHub');
 const corroborated=reviewDeepFacts(seed(),trustedDeepHits(seed(),[first,second]).hits,[]);
 assert.equal(corroborated.find(r=>r.key==='occupation').keep,true);assert.ok(corroborated.filter(r=>r.key==='age').every(r=>r.conflict&&!r.keep));
 assert.equal(corroborated.filter(r=>r.key==='email').length,1);
});

test('reviewed edits and deletions survive evidence mapping and the investigation TXT report',async()=>{
 const person=seed(),a=item('a',{name:'Alex Example',email:'alex@example.org',occupation:'Designer',created_at:'private-time'}),b=item('b',a.fields,'BrixHub');
 let rows=reviewDeepFacts(person,trustedDeepHits(person,[a,b]).hits,['created_at']);assert.ok(!rows.some(r=>r.key==='created_at'));
 rows=rows.filter(r=>r.key!=='phone').map(r=>r.key==='occupation'?{...r,value:'Architect',edited:true}:r);
 const reviewed=reviewedPerson(person,rows),current={id:'p',name:'Person 1',phone:'',email:'',username:'',address:'',notes:'',evidence:[]};
 const saved=await exportSearchPerson(reviewed,current,async payload=>prepare(payload.fields,payload.excluded,payload.current),[],'Deep search');
 const output=JSON.stringify(saved);assert.ok(!output.includes('Designer'));assert.ok(!output.includes('33612345678'));assert.ok(output.includes('Architect'));
 const report=textReport({title:'Deep review',people:[saved]},[]);assert.match(report,/Architect/);assert.doesNotMatch(report,/Designer|private-time|6 12 34/);
});

test('Oath batches use one session per identifier and paginate with explicit filters',async()=>{
 const calls=[],filter={field:'email',operator:'eq',value:'alex@example.org'};
 const result=await oathBulk({terms:[' alex@example.org ','Alex Example','alex@example.org'],filters:{filter,country:['FR'],city:[]},options:{sort:'-indexed_at',search_id:'stale',cursor:'stale'}},'batch-key',{fetcher:async(url,options)=>{
  calls.push({url,options});
  if(url.endsWith('/search/init'))return Response.json({data:{session:{id:'sess_'+JSON.parse(options.body).query}}});
  const params=new URL(url).searchParams;
  assert.equal(params.get('search_id'),'sess_'+params.get('q'));assert.equal(params.get('filter'),JSON.stringify(filter));assert.deepEqual(params.getAll('country[]'),['FR']);assert.equal(params.has('city[]'),false);assert.equal(params.get('sort'),'-indexed_at');
  return Response.json({data:{items:[{name:'Alex',password:'private'}],next_cursor:params.get('q')==='alex@example.org'&&!params.has('cursor')?'page-2':null}});
 }});
 assert.equal(calls.filter(c=>c.url.endsWith('/search/init')).length,2);assert.equal(calls.length,5);assert.equal(result.items.length,3);assert.equal(result.items[0].fields.password,undefined);
});

test('session batches cap records, reject repeated cursors and preserve cancellation',async()=>{
 const session=url=>url.endsWith('/search/init');let calls=0;
 const result=await oathBulk({terms:['cap'],filters:{}},'cap-key',{fetcher:async url=>{
  if(session(url))return Response.json({data:{session:{id:'sess_cap'}}});
  calls++;return Response.json({data:{items:Array.from({length:100},(_,i)=>({name:'Alex '+i})),next_cursor:'cursor-'+calls}});
 }});
 assert.equal(calls,10);assert.equal(result.items.length,1000);assert.equal(result.limited,true);
 await assert.rejects(oathBulk({terms:['repeat'],filters:{}},'repeat-key',{fetcher:async url=>Response.json({data:session(url)?{session:{id:'sess_repeat'}}:{items:[],next_cursor:'same'}})}),/repeated search cursor/);
 const controller=new AbortController();controller.abort();
 await assert.rejects(oathBulk({terms:['cancel'],filters:{}},'key',{signal:controller.signal,fetcher:async()=>{throw Error('must not fetch')}}),/abort/i);
});

test('session batches reject provider failures and oversized responses',async()=>{
 for(const status of [400,401,403,429,500])await assert.rejects(oathBulk({terms:['error'],filters:{}},'error-key',{fetcher:async url=>url.endsWith('/search/init')?Response.json({data:{session:{id:'sess_error'}}}):Response.json({message:'Rejected error-key'},{status})}),new RegExp('HTTP '+status));
 await assert.rejects(oathBulk({terms:['error'],filters:{}},'error-key',{fetcher:async()=>({ok:true,headers:{get:()=>String(9000000)}})}),/8 MB/);
});

test('runner limits concurrency, paginates BrixHub explicitly and preserves partial results on provider failure',async()=>{
 const plan={pages:3,tasks:[{provider:'brixhub',query:'alex@example.org',field:'email',filtered:false,filters:{}},{provider:'oathnet',terms:['alex@example.org'],family:'breach',filtered:false,filters:{}},{provider:'brixhub',query:'alex',field:'nom_utilisateur',filtered:false,filters:{}}]};
 let active=0,max=0;const pages=[];
 const out=await runDeepSearch(plan,{brix:async payload=>{active++;max=Math.max(max,active);await new Promise(resolve=>setTimeout(resolve,1));active--;if(payload.query==='alex')throw Error('Rate limited');pages.push(payload.settings.page);assert.deepEqual(payload.terms,{email:'alex@example.org'});return {items:[item('x',{email:'alex@example.org',password:'private'})],meta:{pages:2}}},oath:async()=>({items:[item('duplicate',{password:'private',email:'alex@example.org'},'BrixHub')]})});
 assert.ok(max<=2);assert.equal(out.completed,3);assert.equal(out.items.length,1);assert.equal(out.items[0].fields.password,undefined);assert.equal(out.warnings.length,1);assert.deepEqual(pages.slice(0,2),[1,2]);
});

test('stop aborts queued work while retaining previously retrieved pages',async()=>{
 const controller=new AbortController(),tasks=Array.from({length:5},()=>({provider:'brixhub',query:'alex',field:'nom_utilisateur',filtered:false,filters:{}}));let calls=0;
 const out=await runDeepSearch({tasks,pages:3},{signal:controller.signal,brix:async()=>{calls++;controller.abort();return {items:[item('x',{name:'Alex Example'})],meta:{pages:5}}}});
 assert.equal(calls,1);assert.equal(out.items.length,1);assert.equal(out.canceled,true);
});

test('new records stream once per page before later tasks finish',async()=>{
 const events=[],tasks=[{provider:'brixhub',query:'alex',field:'nom_utilisateur',filtered:false,filters:{}}];
 const out=await runDeepSearch({tasks,pages:3},{progress:event=>events.push(event),brix:async payload=>{
  if(payload.settings.page===2){assert.equal(events.flatMap(e=>e.items||[]).length,1);assert.equal(events.at(-1).completed,0)}
  return {items:[item('x',{name:'Alex Example'})],meta:{pages:2}};
 }});
 assert.equal(events.flatMap(e=>e.items||[]).length,1);assert.equal(out.items.length,1);
});

test('deep cards display one person across source records and export the reviewed edits',()=>{
 const person=seed(),items=[item('one',{name:'Alex Example',email:'alex@example.org',occupation:'Designer'}),item('two',{name:'Alex Example',email:'alex@example.org',occupation:'Designer'},'BrixHub')];
 const groups=deepRecordGroups(person,classifyDeepHits(person,items),[]);
 assert.equal(groups.length,1);assert.equal(groups[0].person.items.length,2);
 assert.ok(groups.every(group=>!group.rows.some(row=>row.key==='phone')));
 assert.ok(groups.every(group=>group.rows.find(row=>row.key==='occupation').keep));
 groups[0].rows.find(row=>row.key==='occupation').value='Architect';
 const reviewed=reviewedPeople(groups);
 assert.equal(reviewed.length,1);
 assert.equal(reviewed[0].details.find(row=>row.key==='occupation').value,'Architect');
 assert.ok(!reviewed[0].details.some(row=>row.key==='occupation'&&row.value==='Designer'));
 assert.ok(!reviewed[0].details.some(row=>row.key==='phone'));
 assert.deepEqual(deepRecordGroups(person,{same:[],related:[],unmatched:[]},[]),[]);
});

test('deep cards combine capitalized and reversed names before saving or exporting',()=>{
 const records=[item('one',{name:'Alex Example',email:'alex@example.org'}),item('two',{name:'EXAMPLE ALEX',email:'other@example.org'},'BrixHub'),item('three',{first_name:'alex',last_name:'example'},'BrixHub')];
 const groups=deepRecordGroups(seed(),classifyDeepHits(seed(),records),[]);
 assert.equal(groups.length,1);assert.equal(groups[0].person.items.length,3);assert.equal(groups[0].matches.length,3);
 assert.equal(groups[0].rows.filter(row=>row.key==='name').length,1);
 assert.equal(groups[0].rows.find(row=>row.key==='name').keep,true);
});

test('explicit Brix fields preserve addresses and names as whole values and carry cancellation signals',async()=>{
 const old=global.fetch,calls=[],controller=new AbortController();
 global.fetch=async(url,options)=>{calls.push(options);return {ok:true,text:async()=>JSON.stringify({data:{results:[]}})}};
 try{
  await searchBrix({query:'10 Example Street',terms:{adresse:'10 Example Street'},signal:controller.signal,settings:{brixFilters:{pays:'FR'}}});
  await searchBrix({query:'Alex Example',terms:{nom_affichage:'Alex Example'},settings:{}});
  assert.equal(JSON.parse(calls[0].body).adresse,'10 Example Street');assert.equal(JSON.parse(calls[0].body).nom_famille,undefined);assert.equal(JSON.parse(calls[1].body).nom_affichage,'Alex Example');
  controller.abort();assert.equal(calls[0].signal.aborted,true);
  await assert.rejects(searchBrix({query:'test',terms:{password:'private'},settings:{}}),/Invalid BrixHub/);
 }finally{global.fetch=old}
});

test('record deduplication ignores object key order, credentials never enter review, and IPC rejects invalid plans',()=>{
 assert.equal(recordItem({a:1,b:2},'BrixHub').id,recordItem({b:2,a:1},'BrixHub').id);
 assert.deepEqual(cleanRecord({email:'alex@example.org',log:'raw secrets',nested:{access_token:'private',password:'private',occupation:'Designer'}}),{email:'alex@example.org',nested:{occupation:'Designer'}});
 for(const plan of [{tasks:[],pages:1},{tasks:[{provider:'evil',filters:{}}],pages:1},{tasks:[{provider:'brixhub',query:'a',field:'password',filters:{}}],pages:1}])assert.throws(()=>validatePlan(plan));
});

test('IPC cancellation belongs to the sending window and active run ID',async()=>{
 const {EventEmitter}=require('node:events'),handlers=new Map(),sender=new EventEmitter();sender.id=7;sender.isDestroyed=()=>false;sender.send=()=>{};
 const controller=new AbortController();let started;const began=new Promise(resolve=>started=resolve),oldFetch=global.fetch;
 global.fetch=async(url,options)=>{started();return new Promise((_,reject)=>options.signal.addEventListener('abort',()=>reject(Error('aborted')),{once:true}))};
 registerDeepSearch({ipcMain:{handle:(name,handler)=>handlers.set(name,handler)},key:async()=>''});
 try{
  const payload={runId:'run-1',plan:{pages:1,tasks:[{provider:'brixhub',query:'alex',field:'nom_utilisateur',filtered:false,filters:{}}]}},run=handlers.get('people:deep-search')({sender},payload);await began;
  assert.equal(handlers.get('people:deep-cancel')({sender:{id:8}},{runId:'run-1'}),false);
  assert.equal(handlers.get('people:deep-cancel')({sender},{runId:'wrong'}),false);
  await assert.rejects(handlers.get('people:deep-search')({sender},payload),/already running/);
  assert.equal(handlers.get('people:deep-cancel')({sender},{runId:'run-1'}),true);assert.equal((await run).canceled,true);assert.equal(sender.listenerCount('destroyed'),0);
 }finally{controller.abort();global.fetch=oldFetch}
});


test('recursive discovery follows connected contacts and addresses without expanding original identity',()=>{
 const rows=[item('a',{name:'Alex Example',email:'alex@example.org',address:'10 Example Street',phone:'06 12 34 56 78'}),item('b',{first_name:'Nina',last_name:'Example',address:'10 EXAMPLE STREET',email:'nina@example.org'}),item('c',{name:'Sam Example',email:'nina@example.org',phone:'+33122334455'}),item('d',{name:'Other Person',phone:'01 22 33 44 55'}),item('noise',{name:'Unknown Person',email:'random@example.org'})];
 const network=classifyDeepNetwork(seed(),rows,true);
 assert.deepEqual(network.same.map(hit=>hit.item.id),['a']);
 assert.deepEqual(network.related.map(hit=>hit.item.id),['b','c','d']);
 assert.deepEqual(network.unmatched.map(hit=>hit.item.id),['noise']);
 assert.ok(network.related.find(hit=>hit.item.id==='b').familyLinks.some(link=>link.title==='Alex Example'&&link.basis.includes('Shared home address')));
 assert.ok(network.related.find(hit=>hit.item.id==='c').familyLinks.some(link=>link.title==='Nina Example'&&link.basis.includes('Shared email')));
 assert.equal(network.related.find(hit=>hit.item.id==='d').familyLinks,undefined);
 const searched=deepTerms(seed()),pending=nextDeepSearchTerms(network,searched);
 assert.ok(pending.some(term=>term.value==='nina@example.org'));
 assert.ok(pending.some(term=>term.key==='address'));
 assert.equal(pending.filter(term=>term.key==='phone').length,1,'international and local aliases search once');
 assert.ok(!pending.some(term=>term.value==='random@example.org'));
 assert.deepEqual(nextDeepSearchTerms(network,[...searched,...pending]),[],'cycles terminate when all identifiers were searched');
});

test('same surname alone or incompatible address locations never become possible family',()=>{
 const [person]=groupPeople([item('seed',{name:'Alex Example',email:'alex@example.org',address:'10 Example Street',city:'Paris',postal_code:'75001',country:'FR'})]);
 const result=classifyDeepNetwork(person,[item('other-city',{name:'Sam Example',address:'10 Example Street',city:'Lyon'}),item('surname',{name:'Nina Example'}),item('other-country',{name:'Joe Example',address:'10 Example Street',city:'Paris',country:'US'})],true);
 assert.ok([...result.related,...result.unmatched].every(hit=>!hit.familyLinks?.length));
});

test('possible family links survive card save and TXT export as an explicit category and notes',async()=>{
 const rows=[item('nina',{first_name:'Nina',last_name:'Example',email:'alex@example.org'})];
 const groups=deepRecordGroups(seed(),classifyDeepNetwork(seed(),rows,true),[]);
 groups.forEach(group=>group.rows.forEach(row=>row.keep=true));
 const [reviewed]=reviewedPeople(groups);
 assert.match(reviewed.reviewContext,/Possible family of Alex Example.*Shared email/);
 const current={id:'saved',name:'Person 1',phone:'',email:'',username:'',address:'',notes:'',evidence:[]};
 const saved=await exportSearchPerson(reviewed,current,async p=>prepare(p.fields,p.excluded,p.current),[],'Deep search');
 assert.ok(saved.customCategories.some(category=>category.label==='Family connection'&&category.value.includes('Possible family of Alex Example')));
 assert.match(saved.notes,/Possible family/);
 assert.match(textReport({title:'Family',people:[saved]}),/Possible family/);
});


test('GHunt deep plans check each email once and use the configured executable',()=>{
 const person=seed(),terms=deepTerms(person),options={...deepDefaults,oath:false,brix:false,ghunt:true};
 const plan=makeDeepPlan(person,[...terms,...terms],options,{ghuntPath:'C:/Tools/ghunt.exe'});
 validatePlan(plan);assert.equal(plan.tasks.length,1);assert.equal(plan.tasks[0].provider,'ghunt');
 assert.equal(plan.tasks[0].query,'alex@example.org');assert.equal(plan.tasks[0].settings.ghuntPath,'C:/Tools/ghunt.exe');
 assert.equal(makeDeepPlan(person,terms,{...options,ghunt:false},{}).tasks.length,0);
 const network=classifyDeepNetwork(person,[item('new',{name:'Alex Example',email:'next@example.org'})],true);
 const pending=nextDeepSearchTerms(network,terms);
 assert.ok(makeDeepPlan(person,pending,options,{}).tasks.some(t=>t.provider==='ghunt'&&t.query==='next@example.org'));
 for(const query of ['bad','a@example.org\nother'])assert.throws(()=>validatePlan({pages:1,tasks:[{provider:'ghunt',query,filters:{}}]}));
});

test('GHunt deep execution streams clean profile cards, deduplicates emails and retains failures as warnings',async()=>{
 const controller=new AbortController(),calls=[],events=[];
 const tasks=['Alex@example.org','alex@example.org','other@example.org'].map(query=>({provider:'ghunt',query,filters:{},settings:{ghuntPath:'custom-ghunt'}}));
 const result=await runDeepSearch({pages:1,tasks},{signal:controller.signal,progress:p=>events.push(p),ghunt:async payload=>{
  calls.push(payload);if(payload.query==='other@example.org')throw Error('Login required');
  return {items:[{id:'profile',source:'GHunt',profileType:'google',fields:{email:payload.query,name:'Alex Example',gaia_id:'123',output:'private raw output'}}],notice:'Partial profile'};
 }});
 assert.equal(calls.length,2);assert.equal(calls[0].settings.ghuntPath,'custom-ghunt');assert.equal(calls[0].signal,controller.signal);
 assert.equal(result.items.length,1);assert.equal(result.items[0].profileType,'google');assert.equal(result.items[0].fields.output,undefined);
 assert.equal(events.flatMap(p=>p.items||[]).length,1);assert.ok(result.warnings.some(w=>w.includes('Login required')));assert.ok(result.warnings.some(w=>w.includes('Partial profile')));
 const stopped=await runDeepSearch({pages:1,tasks:[tasks[0]]},{signal:AbortSignal.abort(),ghunt:async()=>assert.fail('Must not run after stop')});
 assert.equal(stopped.canceled,true);
});

const {test}=require('node:test'),assert=require('node:assert/strict');
const {groupPeople,personFacts}=require('../src/peopleModel.ts');
const {deepDefaults,deepTerms,classifyDeepNetwork,nextDeepSearchTerms}=require('../src/peopleDeepModel.ts');
const {prepare}=require('./investigation.cjs');
const {runDeepSearch,validatePlan}=require('./people-deep.cjs');
const item=(id,fields)=>({id,source:'Fixture',fields});

test('contacts in usernames and arbitrary nested categories populate canonical fields',()=>{
 const fields={username:'Alex@Example.org',other:{contact:'Call +33 6 24 12 08 34; backup@example.org'},phone_hint:'24120834',discord_id:'123456789012345',date_of_birth:'1990-06-15',ip:'192.168.100.100',token:'hidden@example.org'};
 const facts=personFacts(item('one',fields));
 assert.deepEqual(facts.filter(f=>f.key==='email').map(f=>f.value).sort(),['alex@example.org','backup@example.org']);
 assert.deepEqual(facts.filter(f=>f.key==='phone').map(f=>f.normalized).sort(),['24120834','33624120834']);
 const patch=prepare(fields).patch;
 assert.match(patch.email,/Alex@Example.org/i);assert.match(patch.email,/backup@example.org/);assert.match(patch.phone,/24120834/);assert.ok(!patch.email.includes('hidden'));
 const excluded=prepare(fields,['email','phone']).patch;assert.equal(excluded.email,undefined);assert.equal(excluded.phone,undefined);
});

test('shortened phone suffixes do not merge people or collapse contacts',()=>{
 for(const api of [require('../src/phoneIdentity.ts'),require('./phone-identity.cjs')]){
  const phones=['624120834','24120834','+33624120834'],keys=api.phoneKeys(phones);
  assert.notEqual(keys.get(phones[0]),keys.get(phones[1]));assert.equal(api.uniquePhones(phones.join(', ')),'+33624120834, 24120834');
 }
 for(const numbers of [['624120834','24120834'],['+33624120834','24120834'],['624120834','624120834']]){
  const people=groupPeople(numbers.map((phone,i)=>item(String(i),{name:i?'Nina Other':'Alex Example',phone})));
  assert.equal(people.length,2);
 }
});

test('deep defaults search starting facts only; extended follows unmatched findings once',()=>{
 assert.equal(deepDefaults.keepSearching,false);assert.equal(deepDefaults.followContacts,false);
 const seed=groupPeople([item('seed',{name:'Alex Example',email:'seed@example.org'})])[0];
 const matches=classifyDeepNetwork(seed,[item('a',{name:'Other Person',email:'new@example.org',company:'Example Co'}),item('b',{name:'Another Person',username:'other_handle',company:'Example Co'})],true,true);
 assert.equal(matches.same.length,0);assert.equal(matches.unmatched.length,2);
 assert.ok(matches.unmatched.every(hit=>hit.reasons.some(reason=>/company shared.*correlation only/i.test(reason))));
 assert.equal(nextDeepSearchTerms(matches,deepTerms(seed)).length,0);
 const found=nextDeepSearchTerms(matches,deepTerms(seed),true);assert.ok(found.some(term=>term.value==='new@example.org'));assert.ok(found.some(term=>term.value==='other_handle'));
 assert.equal(nextDeepSearchTerms(matches,[...deepTerms(seed),...found],true).length,0);
});

test('bounded Brix continuations start at the requested page and expose the next page',async()=>{
 const task={provider:'brixhub',query:'a@example.org',field:'email',filtered:false,filters:{}},pages=[];
 const result=await runDeepSearch({pages:1,startPage:4,tasks:[task]},{brix:async p=>{pages.push(p.settings.page);return {items:[item('page',{page:p.settings.page})],meta:{pages:6}}}});
 assert.deepEqual(pages,[4]);assert.equal(result.nextPage,5);
 for(const startPage of [0,-1,1.5,'4'])assert.throws(()=>validatePlan({pages:1,startPage,tasks:[task]}),/continuation/);
});

test('keep same full name selects every detail without selecting a different name or merging conflicting births',()=>{
 const {deepRecordGroups,keepSameNameFacts,reviewedPeople}=require('../src/peopleDeepModel.ts');
 const seed=groupPeople([item('seed',{first_name:'Émilie',last_name:'Dupont',dob:'1990-01-01'})])[0];
 const matches=classifyDeepNetwork(seed,[item('same',{name:'DUPONT EMILIE',email:'same@example.org',dob:'1980-01-01'}),item('other',{name:'Nina Dupont',email:'other@example.org'})]);
 const groups=keepSameNameFacts(seed,deepRecordGroups(seed,matches,[]));
 assert.ok(groups.find(group=>group.person.items[0].id==='same').rows.every(row=>row.keep));
 assert.ok(groups.find(group=>group.person.items[0].id==='other').rows.every(row=>!row.keep));
 assert.equal(reviewedPeople(groups).length,1);assert.ok(reviewedPeople(groups)[0].details.some(row=>row.value==='same@example.org'));
});

test('extended checks provider-supported context fields against their own record identity',()=>{
 const {makeDeepPlan}=require('../src/peopleDeepModel.ts');
 const seed=groupPeople([item('seed',{name:'Alex Example',email:'seed@example.org'})])[0];
 const other=groupPeople([item('other',{name:'Other Person',email:'other@example.org',city:'Lyon',date_of_birth:'1980-01-01',company:'Example Co'})])[0];
 const terms=deepTerms(other,true),plan=makeDeepPlan(seed,terms,{...deepDefaults,longSearch:true},{});
 for(const field of ['ville','date_naissance','societe']){
  const tasks=plan.tasks.filter(task=>task.field===field);assert.equal(tasks.length,1);assert.equal(tasks[0].filters.email,'other@example.org');assert.equal(tasks[0].filters.nom_affichage,'Other Person');
 }
 assert.ok(plan.tasks.find(task=>task.provider==='oathnet').terms.every(term=>!['Lyon','1980-01-01','Example Co'].includes(term)));
});

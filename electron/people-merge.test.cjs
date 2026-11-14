const test=require('node:test'),assert=require('node:assert/strict');
const {groupPeople,personFacts}=require('../src/peopleModel.ts');
const {mergeSearchPeople}=require('../src/peopleMerge.ts');
const {matchingSavedPerson,mergeSavedPeople}=require('../src/peopleExport.ts');
const {prepare}=require('./investigation.cjs');
const {classifyDeepHits,deepRecordGroups,reviewedPeople}=require('../src/peopleDeepModel.ts');
const make=(id,fields)=>groupPeople([{id,source:'Fixture '+id,fields}])[0];
const saved=(id,name,email)=>({id,name,email,phone:'',username:'',address:'',notes:'',evidence:[]});

test('full names merge across case, accents, surname order and split fields',()=>{
 const result=mergeSearchPeople([make('a',{name:'Émilie Dupont',email:'one@example.org'}),make('b',{name:'DUPONT EMILIE',email:'two@example.org'}),make('c',{first_name:'Emilie',last_name:'Dupont',phone:'+33612345678'})]);
 assert.equal(result.length,1);assert.equal(result[0].items.length,3);
 assert.equal(result[0].details.filter(d=>d.key==='name').length,1);
 assert.equal(result[0].details.find(d=>d.key==='name').conflict,false);
 assert.equal(result[0].details.filter(d=>d.key==='email').length,2);
});

test('unnamed records merge into a unique identity regardless of source order or phone formatting',()=>{
 for(const reverse of [false,true]){
  const people=[make('empty',{email:'person@example.org',phone:'06 12 34 56 78'}),make('named',{name:'Alex Example',email:'person@example.org',phone:'+33612345678'})];
  const result=mergeSearchPeople(reverse?people.reverse():people);
  assert.equal(result.length,1);assert.equal(result[0].title,'Alex Example');
  assert.deepEqual(result[0].details.filter(d=>d.key==='phone').map(d=>d.value),['+33612345678']);
 }
});

test('shared household contacts and IP addresses do not merge different people',()=>{
 const people=[make('a',{name:'Alex Example',email:'family@example.org',ip:'192.0.2.10'}),make('b',{name:'Nina Example',email:'family@example.org',ip:'192.0.2.10'}),make('empty',{email:'family@example.org'}),make('ip-only',{phone:'+12025550123',ip:'192.0.2.10'})];
 assert.equal(mergeSearchPeople(people).length,4);
});

test('partial names attach through a unique matching contact without merging household members',()=>{
 for(const field of ['first_name','last_name','name'])for(const reverse of [false,true]){
  const value=field==='last_name'?'EXAMPLE':'ALEX';
  const rows=[make('partial',{[field]:value,email:'alex@example.org'}),make('full',{name:'Alex Example',email:'alex@example.org'})];
  const result=mergeSearchPeople(reverse?rows.reverse():rows);
  assert.equal(result.length,1);assert.equal(result[0].title,'Alex Example');
 }
 const full=make('full',{first_name:'Alex',last_name:'Example',email:'family@example.org',dob:'1990-01-01'});
 for(const fields of [{first_name:'Nina'},{last_name:'Other'},{first_name:'Alex',dob:'1980-01-01'}]){
  assert.equal(mergeSearchPeople([full,make('partial',{...fields,email:'family@example.org'})]).length,2);
 }
 const household=[full,make('other',{name:'Nina Example',email:'family@example.org'}),make('partial',{last_name:'Example',email:'family@example.org'})];
 assert.equal(mergeSearchPeople(household).length,3);
 assert.equal(mergeSearchPeople([...household].reverse()).length,3);
});

test('deep search TXT exports a partial-name duplicate once with all reviewed contacts',async()=>{
 const {textReport,parseText}=require('./investigation.cjs');
 const seed=make('seed',{name:'Alex Example',email:'alex@example.org'});
 const items=[make('full',{name:'EXAMPLE ALEX',email:'alex@example.org',phone:'+33612345678'}).items[0],make('partial',{first_name:'Alex',email:'alex@example.org',username:'alex-account'}).items[0]];
 const groups=deepRecordGroups(seed,classifyDeepHits(seed,items),[]);
 groups.forEach(group=>group.rows.forEach(row=>row.keep=true));
 const reviewed=reviewedPeople(groups);
 const service=async p=>prepare(p.fields,p.excluded,p.current);
 const people=await Promise.all(reviewed.map((person,i)=>require('../src/peopleExport.ts').exportSearchPerson(person,saved('p'+i,'Person '+(i+1),''),service,[],'Deep search')));
 const merged=await mergeSavedPeople(people,service,[]);
 const report=textReport({people:merged},[]);
 assert.equal(parseText(report,[]).record.people.length,1);
 assert.match(report,/alex@example.org/);assert.match(report,/alex-account/);assert.match(report,/\+33612345678/);
});

test('different or ambiguous birth dates stay separate in every input order',()=>{
 const people=[make('a',{name:'Alex Example',dob:'1990-01-01'}),make('empty',{name:'EXAMPLE ALEX'}),make('b',{name:'Alex Example',dob:'1980-01-01'})];
 assert.equal(mergeSearchPeople(people).length,3);
 assert.equal(mergeSearchPeople([...people].reverse()).length,3);
});

test('deep review recognizes a reversed name and keeps that name selected',()=>{
 const seed=make('seed',{name:'Alex Example',email:'a@example.org'}),items=[make('b',{name:'EXAMPLE ALEX',email:'other@example.org'}).items[0],make('empty',{email:'other@example.org',phone:'+12025550123'}).items[0]];
 const matches=classifyDeepHits(seed,items);assert.equal(matches.same.length,2);
 const groups=deepRecordGroups(seed,matches,[]);
 assert.equal(groups[0].rows.find(r=>r.key==='name').keep,true);
 groups.forEach(group=>group.rows.forEach(row=>row.keep=true));
 const result=reviewedPeople(groups);assert.equal(result.length,1);assert.equal(result[0].items.filter(i=>personFacts(i).some(f=>f.key==='phone')).length,1);
});

test('saving finds the existing named folder for a matching unnamed record and vice versa',()=>{
 const current=saved('existing','Alex Example','a@example.org');
 assert.equal(matchingSavedPerson(make('incoming',{email:'a@example.org'}),[current]),current);
 assert.equal(matchingSavedPerson(make('incoming',{name:'EXAMPLE ALEX'}),[current]),current);
 const unnamed=saved('unnamed','Person 1','a@example.org');
 assert.equal(matchingSavedPerson(make('incoming',{name:'Alex Example',email:'a@example.org'}),[unnamed]),unnamed);
 assert.equal(matchingSavedPerson(make('incoming',{email:'a@example.org'}),[current,saved('other','Nina Example','a@example.org')]),undefined);
});

test('source evidence contacts also match an unnamed incoming record',()=>{
 const current={...saved('existing','Alex Example',''),evidence:[{id:'e',source:'Fixture',fields:{email:'a@example.org'}}]};
 assert.equal(matchingSavedPerson(make('incoming',{email:'a@example.org'}),[current]),current);
});

test('existing file duplicates merge without losing notes, categories, evidence or alternate details',async()=>{
 const a={...saved('a','Person 1','a@example.org'),phone:'+12025550123',notes:'First note',address:'10 Example Street',customCategories:[{id:'c1',label:'Occupation',value:'Designer'}],evidence:[{id:'e1',source:'A',fields:{email:'a@example.org'}}]};
 const b={...saved('b','Alex Example','a@example.org'),notes:'Second note',address:'20 Other Street',customCategories:[{id:'c2',label:'Occupation',value:'Architect'}],evidence:[{id:'e2',source:'B',fields:{email:'a@example.org'}}]};
 const [merged]=await mergeSavedPeople([a,b],async p=>prepare(p.fields,p.excluded,p.current),[]);
 assert.equal(merged.id,'b');assert.equal(merged.name,'Alex Example');assert.equal(merged.phone,'+12025550123');
 assert.match(merged.notes,/First note/);assert.match(merged.notes,/Second note/);assert.equal(merged.evidence.length,2);
 assert.ok(merged.customCategories.some(c=>c.value==='Designer'));assert.ok(merged.customCategories.some(c=>c.value==='Architect'));
 assert.ok(merged.customCategories.some(c=>c.label==='Alternative Address'&&c.value.includes('10 Example Street')&&c.value.includes('20 Other Street')));
 const ambiguous=await mergeSavedPeople([a,b,saved('c','Nina Example','a@example.org')],async p=>prepare(p.fields,p.excluded,p.current),[]);
 assert.equal(ambiguous.length,3);
});

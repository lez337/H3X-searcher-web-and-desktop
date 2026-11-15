const test=require('node:test');
const assert=require('node:assert/strict');
const {groupPeople}=require('../src/peopleModel.ts');
const {exportSearchPerson}=require('../src/peopleExport.ts');
const {prepare,textReport}=require('./investigation.cjs');
const make=()=>({id:crypto.randomUUID(),name:'Person 1',username:'',phone:'',email:'',address:'',notes:'',evidence:[]});
const service=async({fields,excluded,current})=>prepare(fields,excluded,current);
const [person]=groupPeople([
 {id:'a',source:'Provider A',fields:{full_name:'Mazure Emilie',email:'emilie@example.org',phone:'+12025550142',dob:'1990-06-15',city:'Lyon',occupation:'Designer',cookie:'hidden'}},
 {id:'b',source:'Provider B',fields:{name:'Mazure Emilie',email:'emilie@example.org',phone:'+12025550143',dob:'15/06/1990',city:'Paris',username:'emz',occupation:'Designer'}},
]);

test('grouped person exports all contacts and source records with mapped dates and custom fields',async()=>{
 const saved=await exportSearchPerson(person,make(),service,['cookie'],'fictional query');
 assert.equal(saved.name,'Mazure Emilie');assert.equal(saved.dateOfBirth,'1990-06-15');assert.equal(saved.username,'emz');
 assert.equal(saved.phone,'+12025550142, +12025550143');assert.equal(saved.email,'emilie@example.org');
 assert.equal(saved.evidence.length,2);assert.deepEqual(saved.evidence.map(e=>e.source),['Provider A','Provider B']);
 assert.ok(saved.evidence.every(e=>e.query==='fictional query'&&e.originId&&!('cookie' in e.fields)));
 assert.ok(saved.customCategories.some(c=>c.label==='City'&&c.value.includes('Lyon')&&c.value.includes('Paris')));
 const report=textReport({people:[saved]},[]);assert.match(report,/Mazure Emilie/);assert.match(report,/Designer/);
});
test('existing details stay intact, contacts merge and repeated evidence is deduplicated',async()=>{
 const current={...make(),name:'Reviewed Person',firstName:'Person',lastName:'Reviewed',phone:'+12025550140',notes:'Reviewed note'};
 const saved=await exportSearchPerson(person,current,service,[],'query');
 assert.equal(saved.name,'Reviewed Person');assert.equal(saved.notes,'Reviewed note');assert.match(saved.phone,/50140/);assert.match(saved.phone,/50142/);assert.match(saved.phone,/50143/);
 const again=await exportSearchPerson(person,saved,service,[],'query');
 assert.equal(again.evidence.length,2);assert.equal(again.customCategories.length,saved.customCategories.length);
});
test('exclusions apply to canonical fields, extra categories and every supporting source',async()=>{
 const saved=await exportSearchPerson(person,make(),service,['email','city','occupation','cookie'],'query');
 assert.equal(saved.email,'');assert.ok(saved.customCategories.every(c=>!['City','occupation'].includes(c.label)));
 assert.ok(saved.evidence.every(e=>!('email' in e.fields)&&!('city' in e.fields)&&!('occupation' in e.fields)&&!('cookie' in e.fields)));
});
test('different names sharing an email export as separate people',async()=>{
 const searches=groupPeople([{id:'c',source:'A',fields:{name:'Mazure Emilie',email:'one@example.org'}},{id:'d',source:'B',fields:{name:'Mazure Emily',email:'one@example.org'}}]);
 const saved=await Promise.all(searches.map(search=>exportSearchPerson(search,make(),service,[],'query')));
 assert.equal(saved.length,2);assert.deepEqual(saved.map(person=>person.name),['Mazure Emilie','Mazure Emily']);assert.ok(saved.every(person=>person.evidence.length===1));
});
test('a failed source preparation rejects the entire grouped export',async()=>{
 let calls=0;await assert.rejects(exportSearchPerson(person,make(),async payload=>{if(++calls===2)throw Error('offline');return service(payload)},[],'query'),/offline/);
});

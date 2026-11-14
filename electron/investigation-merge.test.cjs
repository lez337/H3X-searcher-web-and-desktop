const test=require('node:test');
const assert=require('node:assert/strict');
const {mergeInvestigationPeople}=require('../src/investigationMerge.ts');
const person=(patch={})=>({id:crypto.randomUUID(),name:'Alex Example',firstName:'Alex',lastName:'Example',email:'',phone:'',username:'',address:'',notes:'',evidence:[],...patch});
test('manual merge keeps selected identity, fills blanks and preserves conflicting fields',()=>{
 const a=person({id:'keep',age:'30',address:'Home A'}),b=person({age:'31',address:'Home B',gender:'Female'});
 const merged=mergeInvestigationPeople(a,b);
 assert.equal(merged.id,'keep');assert.equal(merged.age,'30');assert.equal(merged.address,'Home A');assert.equal(merged.gender,'Female');
 assert.ok(merged.customCategories.some(c=>c.label==='Alternative Age'&&c.value==='31'));
 assert.ok(merged.customCategories.some(c=>c.label==='Alternative Home address'&&c.value==='Home B'));
 assert.equal(a.gender,undefined);assert.equal(b.address,'Home B');
});
test('manual merge combines contacts, phones, notes, categories and GHunt records without duplicates',()=>{
 const evidence={id:'google',source:'GHunt',query:'',savedAt:'',fields:{avatar_url:'https://example.org/photo'}};
 const category={id:'country',label:'Country',value:'FR'};
 const merged=mergeInvestigationPeople(person({phone:'0612345678',email:'a@example.org',notes:'One',customCategories:[category],evidence:[evidence]}),person({phone:'+33612345678',altPhone:'0698765432',email:'A@example.org, b@example.org',notes:'Two',customCategories:[category],evidence:[evidence,{...evidence,id:'other'}]}));
 assert.equal(merged.phone,'+33612345678');assert.equal(merged.altPhone,'+33698765432');
 assert.equal(merged.email.toLowerCase(),'a@example.org, b@example.org');assert.equal(merged.notes,'One\n\nTwo');
 assert.equal(merged.customCategories.length,1);assert.equal(merged.evidence.length,2);
});

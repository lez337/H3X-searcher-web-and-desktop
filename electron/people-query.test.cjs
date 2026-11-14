const test=require('node:test');
const assert=require('node:assert/strict');
const {groupPeople}=require('../src/peopleModel.ts');
const {parsePeopleQuery,matchesPeopleQuery,orderedLetterIndices,peopleHighlightIndices}=require('../src/peopleQuery.ts');
const people=groupPeople([
 {id:'a',source:'Provider A',fields:{name:'Émilie Mazure',email:'emilie@example.org',phone:'+33 (1) 23-45-67-89',dob:'1990-06-15',city:'Paris',occupation:'Designer'}},
 {id:'b',source:'Provider B',fields:{name:'Émilie Mazure',email:'emilie@example.org'}},
 {id:'c',source:'Provider A',fields:{first_name:'Noah',last_name:'Mzail',email:'noah@example.org',city:'Lyon',username:'nmz'}},
 {id:'d',source:'Provider C',fields:{name:'Zoë Martin',phone:'+12025550142',city:'Paris'}},
]);
const find=q=>{const query=parsePeopleQuery(q);assert.equal(query.error,'');return people.filter(p=>matchesPeopleQuery(p,query)).map(p=>p.title).sort()};

test('age supports exact values, ranges, comparisons and birth-date calculation',()=>{
 const rows=groupPeople([{id:'age',source:'A',fields:{name:'Age Example',age:25}},{id:'dob',source:'A',fields:{name:'Birth Example',dob:`${new Date().getUTCFullYear()-26}-01-01`,age:99}}]);
 const byAge=q=>rows.filter(p=>matchesPeopleQuery(p,parsePeopleQuery(q))).map(p=>p.title);
 assert.deepEqual(byAge('/age 25'),['Age Example']);
 assert.deepEqual(byAge('/age 18-30'),['Age Example','Birth Example']);
 assert.deepEqual(byAge('/age >=25'),['Age Example','Birth Example']);
 assert.deepEqual(byAge('/age <25'),[]);
 assert.deepEqual(byAge('-/age 25'),['Birth Example']);
 assert.deepEqual(byAge('/age 99'),[]);
 for(const value of ['abc','30-18','18.5'])assert.ok(parsePeopleQuery('/age '+value).error);
});

test('inname matches ordered nonconsecutive name letters with case and accent folding',()=>{
 assert.deepEqual(find('/inname "mz"'),['Mzail Noah','Émilie Mazure']);
 assert.deepEqual(find('/inname "EMZ"'),['Émilie Mazure']);
 assert.deepEqual(find('/inname "zm"'),['Zoë Martin']);
 assert.deepEqual(find('/name "mz"'),['Mzail Noah']);
 assert.deepEqual(find('/name "Mzail Noah"'),['Mzail Noah']);
 assert.deepEqual(find('/inname "mzn"'),['Mzail Noah']);
 assert.deepEqual(orderedLetterIndices('Mazure','mz'),[0,2]);
});
test('plain searches cover extra details, sources and phrases',()=>{
 assert.deepEqual(find('DESIGNER'),['Émilie Mazure']);
 assert.deepEqual(find('"Provider B"'),['Émilie Mazure']);
 assert.deepEqual(find('emilie paris'),['Émilie Mazure']);
 assert.deepEqual(find(''),people.map(p=>p.title).sort());
});
test('name commands never treat an email-only display title as a name',()=>{
 const [person]=groupPeople([{id:'anonymous',source:'A',fields:{email:'mz@example.org'}}]);
 assert.equal(matchesPeopleQuery(person,parsePeopleQuery('/inname mz')),false);
 assert.equal(matchesPeopleQuery(person,parsePeopleQuery('/name mz')),false);
 assert.equal(matchesPeopleQuery(person,parsePeopleQuery('mz')),true);
});
test('field filters combine with AND and negated commands',()=>{
 assert.deepEqual(find('/inname mz /email "@example.org" -/address paris'),['Mzail Noah']);
 assert.deepEqual(find('/phone "33123" /dob 1990 /source "Provider B" /confidence 65'),['Émilie Mazure']);
 assert.deepEqual(find('/username nmz /has email'),['Mzail Noah']);
 assert.deepEqual(find('/has phone -/has email'),['Zoë Martin']);
 assert.deepEqual(find('/has date-of-birth'),['Émilie Mazure']);
 assert.deepEqual(find('/confidence 100'),[]);
});
test('malformed commands return useful errors and never match everything',()=>{
 for(const text of ['/wat abc','/inname','/inname /email abc','/name"abc"','/inname "mz','/inname ""','/confidence -1','/confidence 101','/confidence 12.5','/has "email"trailing']){
  const query=parsePeopleQuery(text);assert.ok(query.error,text);assert.ok(people.every(p=>!matchesPeopleQuery(p,query)),text);
 }
 assert.equal(parsePeopleQuery('/name "a\\"b"').clauses[0].value,'a"b');
 assert.equal(parsePeopleQuery("/name 'Mazure'").error,'');
});
test('highlights reflect name letter matching and accent-insensitive phrases',()=>{
 assert.deepEqual([...peopleHighlightIndices('Mazure',parsePeopleQuery('/inname mz'),'name')],[0,2]);
 assert.deepEqual([...peopleHighlightIndices('Émilie',parsePeopleQuery('emilie'),'name')],[0,1,2,3,4,5]);
 assert.deepEqual([...peopleHighlightIndices('mz@example.org',parsePeopleQuery('/inname mz'),'email')],[]);
 assert.deepEqual([...peopleHighlightIndices('Mazure',parsePeopleQuery('-/name mz'),'name')],[]);
});

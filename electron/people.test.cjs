const test=require('node:test');
const assert=require('node:assert/strict');
const {groupPeople,normalizeBirthDate,normalizePhone}=require('../src/peopleModel.ts');
const item=(id,fields,source='Provider A')=>({id,fields,source});
const detail=(person,key)=>person.details.filter(d=>d.key===key);

test('equivalent name spellings and birth aliases do not repeat fields',()=>{
 const [person]=groupPeople([item('a',{name:'Chloé Martin',dob:'1990-06-15'}),item('b',{nom_complet:'MARTIN Chloe',date_de_naissance:'15/06/1990',birth_day:15,birth_month:6,birth_year:1990})]);
 assert.equal(person.items.length,2);assert.equal(detail(person,'name').length,1);assert.equal(detail(person,'date_of_birth').length,1);
 assert.equal(detail(person,'name')[0].recordIds.length,2);assert.ok(person.details.every(d=>!['birth_day','birth_month','birth_year'].includes(d.key)));
});

test('people excludes activity subtrees without losing identity or contact facts',()=>{
 const [person]=groupPeople([item('google',{name:'Morgan Example',email:'morgan@example.org',maps_statistics:{reviews:12,name:'Place name'},reviews:[{name:'Review author',text:'Review text'}],review_status:'Reviews found',review_count:12,maps_url:'https://example.org/maps',profile:{username:'morgan',avatar_url:'https://example.org/photo',occupation:'Designer'}})]);
 assert.deepEqual(person.details.map(d=>d.key).sort(),['email','name','profile.occupation','username']);
 assert.equal(person.title,'Morgan Example');
});

test('people combines normalized contacts and field aliases without repeating details',()=>{
 const people=groupPeople([
  item('a',{full_name:'Morgan Example',email:'MORGAN@example.org',phone:'+33 1 23 45 67 89',dob:'1990-06-15',city:'Paris'}),
  item('b',{name:'Morgan Example',email_address:'morgan@example.org',telephone:'0033 (1) 23-45-67-89',date_naissance:'15/06/1990',ville:'Paris'},'Provider B'),
 ]);
 assert.equal(people.length,1);const [person]=people;
 assert.equal(person.items.length,2);assert.equal(detail(person,'email').length,1);assert.equal(detail(person,'phone').length,1);assert.equal(detail(person,'date_of_birth').length,1);assert.equal(detail(person,'city').length,1);
 assert.equal(detail(person,'email')[0].confidence,65);assert.deepEqual(detail(person,'email')[0].recordIds,['a','b']);assert.equal(person.confidence,95);
 assert.deepEqual(person.matchReasons,['Same email','Same phone','Same full name and birth date','Birth date agrees']);
});

test('contacts or a complete name with birth date link records',()=>{
 assert.equal(groupPeople([item('a',{email:'a@example.org'}),item('b',{email:'A@example.org'})]).length,1);
 assert.equal(groupPeople([item('a',{phone:'+1 202 555 0142'}),item('b',{mobile:'0012025550142'})]).length,1);
 const [person]=groupPeople([item('a',{name:'Same Name',dob:'1992-01-01'}),item('b',{name:'Same Name',dob:'1992-01-01'})]);
 assert.equal(person.items.length,2);assert.ok(person.matchReasons.includes('Same full name and birth date'));
});

test('name and birth matching normalizes accents, order, split names and date formats',()=>{
 const rows=[item('a',{name:'  Chloé   Martin ',dob:'1992-06-15',email:'first@example.org'}),item('b',{full_name:'MARTIN, CHLOE',birth_date:'15/06/1992',email:'second@example.org'}),item('c',{prenom:'Chloé',nom:'Martin',jour_naissance:15,mois_naissance:6,annee_naissance:1992})];
 for(const ordered of [rows,[...rows].reverse()]){
  const people=groupPeople(ordered);assert.equal(people.length,1);assert.equal(people[0].items.length,3);assert.equal(detail(people[0],'email').length,2);
 }
});

test('birth alone, partial names and conflicting births stay separate',()=>{
 for(const fields of [
  [{dob:'1992-01-01'},{dob:'1992-01-01'}],
  [{name:'Same Name',dob:'1992-01-01'},{name:'Other Name',dob:'1992-01-01'}],
  [{first_name:'Morgan',dob:'1992-01-01'},{first_name:'Morgan',dob:'1992-01-01'}],
  [{name:'Same Name',dob:'1992-01-01'},{name:'Same Name',dob:'1993-01-01'}],
  [{name:'Same Name',dob:['1992-01-01','1993-01-01']},{name:'Same Name',dob:'1992-01-01'}],
 ])assert.equal(groupPeople(fields.map((f,i)=>item(String(i),f))).length,2);
});

test('visible people group uppercase, lowercase, reversed and split full names without a birth date',()=>{
 const rows=[item('a',{name:'Alex Example',email:'first@example.org'}),item('b',{name:'ALEX EXAMPLE',email:'second@example.org'}),item('c',{name:'example alex'}),item('d',{first_name:'alex',last_name:'EXAMPLE'})];
 for(const ordered of [rows,[...rows].reverse()]){
  const people=groupPeople(ordered);assert.equal(people.length,1);assert.equal(people[0].items.length,4);
  assert.equal(detail(people[0],'name').length,1);assert.equal(detail(people[0],'name')[0].conflict,false);
  assert.equal(detail(people[0],'email').length,2);assert.ok(people[0].matchReasons.includes('Same full name'));
 }
 assert.equal(groupPeople([item('a',{name:'Alex Example',dob:'1990-01-01'}),item('b',{name:'EXAMPLE ALEX'})]).length,1);
 assert.equal(groupPeople([item('a',{name:'Alex Example',dob:'invalid'}),item('b',{name:'EXAMPLE ALEX'})]).length,1);
});

test('name and birth matches participate in contact chains without bridging conflicting births',()=>{
 const rows=[item('a',{name:'Morgan Example',dob:'1992-01-01',email:'first@example.org'}),item('b',{first_name:'Morgan',last_name:'Example',dob:'1992-01-01',email:'second@example.org'}),item('c',{email:'second@example.org'}),item('d',{email:'first@example.org',dob:'1980-01-01'})];
 for(const ordered of [rows,[...rows].reverse()]){
  const people=groupPeople(ordered);assert.equal(people.length,2);assert.equal(people.find(p=>p.items.some(i=>i.id==='a')).items.length,3);
 }
});

test('different birth dates block merging even when both contacts agree',()=>{
 const people=groupPeople([item('a',{email:'shared@example.org',phone:'+12025550142',dob:'1980-01-01'}),item('b',{email:'shared@example.org',phone:'+12025550142',dob:'1990-01-01'})]);
 assert.equal(people.length,2);assert.ok(people.every(p=>p.warnings.some(w=>w.includes('different birth date'))));
});

test('undated bridges never connect conflicting dated identities regardless of input order',()=>{
 const rows=[item('unknown',{email:'shared@example.org',phone:'+12025550142'}),item('older',{email:'shared@example.org',dob:'1980-01-01'}),item('younger',{phone:'+12025550142',dob:'1990-01-01'})];
 for(const ordered of [rows,[...rows].reverse(),[rows[1],rows[0],rows[2]]]){
  const people=groupPeople(ordered);assert.equal(people.length,3);assert.ok(people.every(p=>p.warnings.some(w=>w.includes('Ambiguous'))));
 }
});

test('contact chains combine compatible records and retain each unique detail',()=>{
 const people=groupPeople([item('a',{name:'Example',email:'one@example.org',dob:'1990-01-01'}),item('b',{email:'one@example.org',phone:'+12025550142'}),item('c',{phone:'+12025550142',address:'10 Example Street',dob:'1990-01-01'})]);
 assert.equal(people.length,1);assert.equal(people[0].items.length,3);assert.equal(detail(people[0],'address')[0].value,'10 Example Street');
});

test('duplicate rows and provider variants never inflate field confidence',()=>{
 const first=item('a',{email:'one@example.org',name:'Example'},'OathNet · breach');
 const many=groupPeople([first,...Array.from({length:10},(_,i)=>({...first,id:'copy-'+i,source:'OathNet · stealer'}))])[0];
 assert.equal(detail(many,'email')[0].confidence,50);assert.equal(detail(many,'name')[0].confidence,50);
 const distinct=groupPeople([first,...Array.from({length:5},(_,i)=>item('source-'+i,{email:'one@example.org'},'Provider '+i))])[0];
 assert.equal(detail(distinct,'email')[0].confidence,95);
});

test('conflicting facts remain visible as alternatives with lower scores',()=>{
 const [person]=groupPeople([item('a',{name:'Morgan Example',email:'one@example.org'}),item('b',{full_name:'Different Example',email_address:'one@example.org'},'Provider B')]);
 assert.equal(detail(person,'name').length,2);assert.ok(detail(person,'name').every(d=>d.conflict&&d.confidence===30));
 assert.equal(detail(person,'email')[0].confidence,65);assert.ok(person.warnings.some(w=>w.includes('alternatives')));
});

test('nested contacts, numbered aliases and arrays deduplicate and preserve other facts',()=>{
 const [person]=groupPeople([item('a',{contact:{emails:[{value:'one@example.org'},'ONE@example.org'],phone_1:'+12025550142'},profile:{username:'example',employer:'Example Studio'},active:false}),item('b',{email2:'one@example.org',mobile_number:'+1 (202) 555-0142',profile:{employer:'Example Studio'}},'Provider B')]);
 assert.equal(person.items.length,2);assert.equal(detail(person,'email').length,1);assert.equal(detail(person,'phone').length,1);assert.equal(detail(person,'profile.employer').length,1);assert.equal(detail(person,'active')[0].value,'false');
});

test('split birth dates corroborate matching and invalid dates never become identity keys',()=>{
 const [person]=groupPeople([item('a',{email:'one@example.org',jour_naissance:15,mois_naissance:6,annee_naissance:1990}),item('b',{email:'one@example.org',dateOfBirth:'1990-06-15'})]);
 assert.equal(detail(person,'date_of_birth').length,1);assert.ok(person.matchReasons.includes('Birth date agrees'));
 assert.equal(normalizeBirthDate('2020-02-31'),'');assert.equal(normalizeBirthDate('2099-01-01'),'');assert.equal(normalizeBirthDate('15/06/1990'),'1990-06-15');
 assert.equal(groupPeople([item('bad',{date_of_birth:'not a date'})]).length,0);
});

test('multiple birth dates in a source cannot merge into another person',()=>{
 const people=groupPeople([item('a',{email:'one@example.org',dob:['1990-01-01','1991-01-01']}),item('b',{email:'one@example.org',dob:'1990-01-01'})]);
 assert.equal(people.length,2);assert.ok(people.find(p=>p.items[0].id==='a').warnings.some(w=>w.includes('automatic matching disabled')));
});

test('empty, redacted, malformed, credentials and infrastructure-only records are ignored',()=>{
 assert.deepEqual(groupPeople([]),[]);
 assert.deepEqual(groupPeople([item('a',{email:'[redacted]',phone:'********',dob:'unknown'}),item('b',{name:'example.org',ip:'192.0.2.1'})]),[]);
 assert.equal(normalizePhone('0000000000'),'');assert.equal(normalizePhone('123'),'');assert.equal(normalizePhone('+1 202 555 0142 ext 12'),'');
 // An explicit, unambiguous international form links matching national forms.
 assert.equal(groupPeople([item('a',{phone:'0612345678'}),item('b',{phone:'+33612345678'})]).length,1);
 const [person]=groupPeople([item('a',{email:'one@example.org',password:'secret-value',nested:{access_token:'secret-token'},output:'email: other@example.org'})]);
 assert.ok(person.details.every(d=>!d.value.includes('secret-')&&!d.value.includes('other@example.org')));
});

test('phones collapse international access prefixes, optional trunk digits and supported national forms',()=>{
 const [person]=groupPeople([item('a',{name:'Example Person',email:'a@example.org',phone:['+33 (0)6 12 34 56 78','0033 6 12 34 56 78','06 12 34 56 78'],country_code:'FR'}),item('b',{email:'a@example.org',mobile:'+33 6 12 34 56 78'})]);
 assert.equal(detail(person,'phone').length,1);
 assert.deepEqual(detail(person,'phone')[0].recordIds,['a','b']);
 assert.equal(detail(person,'country')[0].value,'FR');
});
test('ambiguous national phone forms are retained instead of choosing a country',()=>{
 const [person]=groupPeople([item('a',{name:'Example Person',phone:['+33 6 12 34 56 78','+44 6 12 34 56 78','06 12 34 56 78']})]);
 assert.equal(detail(person,'phone').length,3);
});

const test=require('node:test');
const assert=require('node:assert/strict');
const {resultLocations}=require('../src/mapLocations.ts');
const {createGeocoder}=require('./geocoding.cjs');
const {investigationLocations}=require('../src/investigationLocations.ts');

test('investigation addresses use only the first address per person and retain shared owners',()=>{
 const person=(id,address,evidence=[])=>({id,name:id,address,evidence});
 const cases=[{id:'a',people:[person('alice','10 Example Road',[{id:'e',fields:{home_address:'10 Example Road'}},{id:'other',fields:{address:'20 Example Road',city:'London'}}])]},{id:'b',people:[person('bob','10 Example Road')]},{id:'empty',people:[]}];
 const locations=investigationLocations(cases);
 assert.equal(locations.length,1);
 assert.deepEqual(locations[0].members.map(m=>[m.caseId,m.personId]),[['a','alice'],['b','bob']]);
 assert.equal(locations[0].address,'10 Example Road');
});

test('investigation locations respect hidden fields and retain category addresses',()=>{
 const cases=[{id:'a',people:[{id:'alice',name:'Alice',address:'10 Example Road',shipping:'20 Example Road',evidence:[{id:'e',fields:{home_address:'30 Example Road',email_address:'a@example.test',ip_address:'192.0.2.1'}}],customCategories:[{label:'Billing address',value:'40 Example Road'}]}]}];
 assert.deepEqual(investigationLocations(cases).map(l=>l.address),['10 Example Road']);
 assert.deepEqual(investigationLocations(cases,['address','home_address','shipping_address']).map(l=>l.address),['40 Example Road']);
 assert.deepEqual(investigationLocations(cases,['*address*']),[]);
});

test('investigation addresses fall back to the first evidence address when no summary address exists',()=>{
 const cases=[{id:'a',people:[{id:'alice',name:'Alice',evidence:[{id:'e',fields:{addresses:['10 Example Road','20 Example Road'],city:'London'}},{id:'later',fields:{address:'30 Example Road'}}]}]}];
 assert.deepEqual(investigationLocations(cases).map(l=>l.address),['10 Example Road, London']);
});

test('investigation first addresses include the saved city or the city from matching evidence',()=>{
 const cases=[{id:'a',people:[
  {id:'alice',name:'Alice',address:'10 Example Road',customCategories:[{label:'City',value:'Paris'}],evidence:[]},
  {id:'bob',name:'Bob',address:'20 Example Road',evidence:[{id:'unrelated',fields:{address:'Other Road',city:'Berlin'}},{id:'match',fields:{address:'20 Example Road',ville:'Lyon'}}]},
  {id:'carol',name:'Carol',address:'30 Example Road, London',customCategories:[{label:'Town',value:'London'}],evidence:[]}
 ]}];
 assert.deepEqual(investigationLocations(cases).map(l=>l.address),['10 Example Road, Paris','20 Example Road, Lyon','30 Example Road, London']);
 assert.deepEqual(investigationLocations(cases,['city','ville','town']).map(l=>l.address),['10 Example Road','20 Example Road','30 Example Road, London']);
});

test('result addresses include locality and preserve all originating cards',()=>{
 const locations=resultLocations([
  {id:'a',fields:{address_street:'10 Example Street',city:'Paris',country:'FR'}},
  {id:'b',fields:{adresse:'10 Example Street',ville:'Paris',pays:'FR'}},
  {id:'c',fields:{address:'10 Example Street',city:'Lyon',country:'FR'}}
 ]);
 assert.equal(locations.length,2);
 assert.equal(locations[0].address,'10 Example Street, Paris, FR');
 assert.deepEqual(locations[0].resultIds,['a','b']);
 assert.deepEqual(locations[1].resultIds,['c']);
});

test('address extraction ignores email, IP and redacted fields, supports multiple addresses',()=>{
 const locations=resultLocations([{id:'a',fields:{email_address:'person@example.org',ip_address:'192.0.2.1',mac_address:'00:11:22:33:44:55',address:'[redacted]',home_address:'person@example.org',shipping_address:'192.0.2.1',addresses:['1 Example Road','2 Example Road'],billing_address:{street:'3 Example Road',city:'Paris'}}}]);
 assert.deepEqual(locations.map(p=>p.address),['1 Example Road','2 Example Road','3 Example Road, Paris']);
 assert.ok(locations.every(p=>p.resultIds[0]==='a'));
 assert.deepEqual(resultLocations([]),[]);
});

test('coordinate lookups require no network and reject invalid ranges',async()=>{
 const geocode=createGeocoder({fetchImpl:()=>{throw Error('Unexpected network request')}});
 assert.deepEqual(await geocode('0, 0'),{lat:0,lng:0,label:'0, 0'});
 await assert.rejects(geocode('91, 181'),/out of range/);
 await assert.rejects(geocode(''),/Enter an address/);
});

test('geocoder queues requests, coalesces duplicates and caches results',async()=>{
 let time=0;const urls=[],waits=[];
 const geocode=createGeocoder({interval:1100,now:()=>time,wait:async ms=>{waits.push(ms);time+=ms},fetchImpl:async url=>{urls.push(new URL(url));return {ok:true,json:async()=>({features:[{geometry:{coordinates:[2.3,48.8]},properties:{city:'Paris'}}]})}}});
 const [first,same,second]=await Promise.all([geocode('Example road'),geocode('example road'),geocode('Other road')]);
 assert.deepEqual(first,{lng:2.3,lat:48.8,label:'Paris'});assert.deepEqual(first,same);assert.deepEqual(first,second);
 assert.equal(urls.length,2);assert.equal(urls[0].searchParams.get('q'),'Example road');assert.equal(urls[0].searchParams.get('limit'),'1');
 assert.deepEqual(waits,[1100]);await geocode('Example road');assert.equal(urls.length,2);
});

test('geocoding failures can be retried and never poison the queue',async()=>{
 let calls=0;
 const geocode=createGeocoder({interval:0,fetchImpl:async()=>{calls++;if(calls===1)return {ok:false,status:429};return {ok:true,json:async()=>({features:[]})}}});
 await assert.rejects(geocode('Example road'),/rate limited/);
 assert.equal(await geocode('Example road'),null);
 assert.equal(await geocode('Example road'),null);
 assert.equal(calls,3);
 assert.equal(await geocode('Example road',true),null);
 assert.equal(await geocode('Different road'),null);
 assert.equal(calls,5);
});

const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createGeocoder,normalizeAddress}=require('./geocoding.cjs');
const address='37 , BOULEVARD JEAN BAPTISTE ROMEUF, ROYAT, FR, 63130';
const feature={geometry:{coordinates:[3,45]},properties:{label:'Example address'}};
test('normalizes house number separated from street by comma',()=>{
 assert.equal(normalizeAddress(address),'37 BOULEVARD JEAN BAPTISTE ROMEUF, ROYAT, FR, 63130');
});
test('French addresses use national geocoding with cleaned address and cache successful results',async()=>{
 let calls=0;const geocode=createGeocoder({interval:0,fetchImpl:async value=>{
 calls++;const url=new URL(value);assert.equal(url.hostname,'data.geopf.fr');
 assert.equal(url.searchParams.get('q'),'37 BOULEVARD JEAN BAPTISTE ROMEUF ROYAT 63130');
 return {ok:true,json:async()=>({features:[feature]})};
 }});
 assert.deepEqual(await geocode(address),{lng:3,lat:45,label:'Example address'});
 await geocode(address);assert.equal(calls,1);
});
test('falls back when French service is unavailable',async()=>{
 const calls=[];const geocode=createGeocoder({interval:0,fetchImpl:async url=>{
 calls.push(new URL(url).hostname);if(calls.length===1)throw Error('Offline');
 return {ok:true,json:async()=>({features:[feature]})};
 }});
 assert.ok(await geocode(address));assert.deepEqual(calls,['data.geopf.fr','photon.komoot.io']);
});
test('unmatched addresses can be retried instead of caching failure',async()=>{
 let calls=0;const geocode=createGeocoder({interval:0,fetchImpl:async()=>({ok:true,json:async()=>({features:++calls===1?[]:[feature]})})});
 assert.equal(await geocode('Example street'),null);assert.ok(await geocode('Example street'));
});
test('coordinate inputs do not call remote services',async()=>{
 const geocode=createGeocoder({fetchImpl:()=>{throw Error('Unexpected request')}});
 assert.deepEqual(await geocode('45, 3'),{lat:45,lng:3,label:'45, 3'});
 await assert.rejects(geocode('100, 3'),/out of range/);
});

const test=require('node:test');
const assert=require('node:assert/strict');
const {countryCode,suppliedCountries}=require('../src/country.ts');
test('country badges resolve supplied codes and localized names only',()=>{
 assert.equal(countryCode('fr'),'FR');assert.equal(countryCode('France'),'FR');assert.equal(countryCode('États-Unis'),'US');assert.equal(countryCode('UK'),'GB');
 assert.equal(countryCode('unknown'),undefined);assert.equal(countryCode('ZZ'),undefined);
 assert.deepEqual(suppliedCountries({phone:'+33612345678',address:'Paris'}),[]);
 assert.deepEqual(suppliedCountries([{country_code:'FR'},{profile:{country:'France'}},{countryCode:'US'},{country:'unknown'}]),['FR','US']);
});

test('people and cards resolve country field variants and nested country objects',()=>{
 assert.deepEqual(suppliedCountries([
  {country_name:'France'},
  {countryIsoCode:'US'},
  {location:{country:{name:'Germany',iso_code:'DE'}}},
  {country:{alpha_2:'GB'}},
  {country_code:'FR'},
 ]),['FR','US','DE','GB']);
 assert.deepEqual(suppliedCountries({name:'France',code:'US',location:{code:'DE'},country:{name:'Unknown',code:'ZZ'}}),[]);
});

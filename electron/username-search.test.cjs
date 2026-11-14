'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {EventEmitter}=require('node:events');
const {Readable}=require('node:stream');
const api=require('./username-search.cjs');
const sample=(overrides={})=>({url:'https://community.example/users/{username}',usernameUnclaimed:'not_a_real_account',checkType:'message',presenseStrs:['member-profile'],absenceStrs:['unknown-user'],tags:['social'],...overrides});
const catalog=(sites={Example:sample()},engines={})=>api.buildCatalog({sites,engines});
const page=(status=200,body='member-profile')=>({status,body,headers:{}});
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));

test('catalog expands engine templates, retains site overrides and excludes disabled, duplicate and unsupported definitions',()=>{
 const result=catalog({First:{urlMain:'https://community.example',engine:'Forum',tags:['social']},Duplicate:sample(),Disabled:sample({disabled:true}),Auth:sample({requiresAuth:true}),Post:sample({requestMethod:'POST'}),Local:sample({url:'https://localhost/{username}'}),OtherId:sample({type:'vk_id'}),Unresolved:sample({url:'https://community.example/{missing}/{username}'}),UnsafeRegex:sample({regexCheck:'^(a+)+$'}),RedirectRule:sample({checkType:'response_url'})},{Forum:{site:{url:'{urlMain}/users/{username}',checkType:'message',presenseStrs:['member-profile'],absenceStrs:['unknown-user']}}});
 assert.equal(result.stats.available,1);assert.equal(result.stats.disabled,1);assert.equal(result.stats.duplicates,1);assert.equal(result.stats.unsupported,7);assert.equal(result.sites[0].profile,'https://community.example/users/{username}');assert.deepEqual(result.sites[0].presence,['member-profile']);
 const override=catalog({Override:{urlMain:'https://forum.example',engine:'Forum',checkType:'status_code',url:'https://other.example/{username}'}},{Forum:{site:{url:'{urlMain}/u/{username}',checkType:'message',presenseStrs:['marker']}}});assert.equal(override.sites[0].checkType,'status_code');assert.equal(override.sites[0].profile,'https://other.example/{username}');
});
test('bundled catalog has thousands of supported unique public rules and reconciles its totals',()=>{
 const result=api.buildCatalog(require('./username-sites.json'));const stats=result.stats;
 assert.ok(stats.available>7000);assert.equal(stats.total,stats.available+stats.disabled+stats.unsupported+stats.duplicates);assert.equal(new Set(result.sites.map(s=>s.id)).size,stats.available);assert.ok(stats.categories.includes('social'));assert.ok(stats.categories.includes('gaming'));
 assert.ok(result.sites.every(site=>site.profile.startsWith('https:')&&site.probe.includes('{username}')));
 const bundled=require('./username-sites.json');
 for(const rule of [...Object.values(bundled.sites),...Object.values(bundled.engines).map(engine=>engine.site)])assert.ok(Object.keys(rule.headers||{}).every(key=>!/authorization|cookie|token|api.?key/i.test(key)));
});
test('username validation preserves the submitted handle without creating variants',()=>{
 assert.equal(api.accountName('@Jane_doe.42'),'Jane_doe.42');assert.equal(api.accountName('123456'),'123456');assert.equal(api.accountName('élève'),'élève');
 for(const bad of ['','a/b','person@example.com','a b','http://example.com','../','---','a'.repeat(65),'x\nheader'])assert.throws(()=>api.accountName(bad),/username/);
});
test('public URLs and DNS checks reject local, reserved and non-HTTPS destinations',()=>{
 for(const bad of ['http://example.com/user','https://localhost/u','https://127.0.0.1/u','https://[::1]/u','https://example.local/u','https://example.onion/u','https://user:pass@example.com/u','https://example.com:8443/u'])assert.throws(()=>api.publicUrl(bad));
 assert.equal(api.publicUrl('https://profiles.example/u/jane').hostname,'profiles.example');
 for(const bad of ['127.0.0.1','10.2.3.4','192.168.1.2','172.16.0.1','169.254.169.254','100.100.100.200','0.0.0.0','224.0.0.1','198.18.1.1','::1','::ffff:127.0.0.1'])assert.equal(api.publicIPv4(bad),false,bad);
 assert.equal(api.publicIPv4('8.8.8.8'),true);
});
test('upstream headers and unsupported request instructions are sanitized before caching',()=>{
 const data=api.sanitizedSnapshot({sites:{A:sample({headers:{Authorization:'secret','Cookie':'private','X-Guest-Token':'token',Accept:'application/json','User-Agent':'browser'},requestPayload:{password:'hidden'},activation:{method:'x'}})}});
 assert.deepEqual(data.sites.A.headers,{Accept:'application/json'});assert.equal(data.sites.A.requiresAuth,true);assert.equal(JSON.stringify(data).includes('secret'),false);assert.equal(catalog(data.sites).stats.available,0);
 assert.equal(api.safePattern('^[a-z][a-z0-9_]{1,20}$'),true);assert.equal(api.safePattern('^a+a+a+a+a+$'),false);assert.equal(api.safePattern('^(a+)+$'),false);
});
test('filters run before coverage limits, preserve rank ordering and support the whole catalog',()=>{
 const data=catalog({A:sample({url:'https://a.example/{username}',tags:['gaming'],alexaRank:2}),B:sample({url:'https://b.example/{username}',alexaRank:1}),C:sample({url:'https://c.example/{username}',tags:['gaming'],alexaRank:3})});
 assert.deepEqual(api.selectSites(data,{category:'gaming',limit:1}).sites.map(s=>s.name),['A']);assert.equal(api.selectSites(data,{category:'gaming',limit:'all'}).eligible,2);assert.equal(api.selectSites(data,{siteFilter:'b.example'}).sites[0].name,'B');assert.equal(api.selectSites(data,{category:'no-such-category'}).sites.length,0);
});
test('main-search coverage defaults to every site and only explicit Settings choices restrict it',()=>{
 assert.equal(api.configuredOptions().limit,'all');
 assert.deepEqual(api.configuredOptions({usernameSearchOptions:{limit:500,category:'social',siteFilter:'old-filter'}}),{limit:'all',category:'',siteFilter:'',concurrency:10});
 assert.equal(api.configuredOptions({usernameSearchOptions:{schemaVersion:2,limit:100}}).limit,100);
 const full=api.buildCatalog(require('./username-sites.json'));assert.equal(api.selectSites(full).sites.length,full.sites.length);
});
test('the main username provider forwards Settings and progress identity, includes leads, and skips incompatible input',async()=>{
 let calls=0;const event={sender:{id:1}};
 const service={run:async(observed,payload)=>{calls++;assert.equal(observed,event);assert.equal(payload.limit,'all');assert.equal(payload.runId,'main-run');return {query:'Jane',results:[{id:'hit',site:'Example',username:'Jane',url:'https://example.com/Jane',status:'match',reason:'marker',categories:['social'],checkedAt:'today'},{id:'unknown',status:'inconclusive'}],counts:{match:1,possible:0,inconclusive:1},total:2,completed:2}}};
 const result=await api.searchUsernameProvider({query:'Jane',usernameRunId:'main-run',settings:{}},event,service);assert.equal(result.items.length,1);assert.equal(result.items[0].profileType,'username');assert.equal(result.items[0].fields.username,'Jane');assert.equal(result.meta.usernameRun.completed,2);
 assert.equal((await api.searchUsernameProvider({query:'person@example.com'},event,service)).meta.skipped,true);assert.equal(calls,1);
 const {searchWorkflow}=require('./search-workflow.cjs');
 const batch=await searchWorkflow({query:'Jane',providers:['whatsmyname','github'],settings:{}},async task=>task.provider==='whatsmyname'?result:{items:[{id:'github',source:'GitHub',fields:{username:'Jane'}}],meta:{}});
 assert.equal(batch.items.length,2);assert.equal(batch.meta.usernameRun.completed,2);
});
test('blocks and absence markers take priority over positive profile markers',()=>{
 const site=catalog().sites[0];
 for(const response of [page(403),page(429),page(503),page(200,'member-profile cf-chl-'),page(200,'member-profile You must be logged in to do that.'),page(200,'<title>Sign in</title>member-profile')])assert.equal(api.classify(site,response).status,'inconclusive');
 assert.equal(api.classify(site,page(200,'unknown-user member-profile')).status,'not_found');assert.equal(api.classify(site,page(404)).status,'not_found');assert.equal(api.classify(site,page(200,'generic shell')).status,'inconclusive');
});
test('public profile matches require a missing-account control and generic soft-404s stay inconclusive',async()=>{
 const site=catalog().sites[0],calls=[];
 const result=await api.checkSite(site,'Jane',{request:async url=>{calls.push(url);return url.endsWith('/Jane')?page():page(200,'unknown-user')}});
 assert.equal(result.status,'match');assert.equal(calls.length,2);assert.match(result.reason,/control passed/);assert.equal(result.username,'Jane');
 const generic=await api.checkSite(site,'Jane',{request:async()=>page()});assert.equal(generic.status,'inconclusive');assert.match(generic.reason,/control/);
 const blockedControl=await api.checkSite(site,'Jane',{request:async url=>url.endsWith('/Jane')?page():page(429)});assert.equal(blockedControl.status,'inconclusive');
});
test('status-only and absence-only rules remain possible profiles even after their control passes',async()=>{
 for(const changes of [{checkType:'status_code'},{presenseStrs:[]}]){
  const site=catalog({A:sample(changes)}).sites[0];
  const result=await api.checkSite(site,'Jane',{request:async url=>url.endsWith('/Jane')?page(200,'some content'):page(404,'unknown-user')});assert.equal(result.status,'possible');
 }
});
test('a failed request is inconclusive and a format mismatch makes no requests',async()=>{
 const site=catalog({A:sample({regexCheck:'^[a-z]+$'})}).sites[0];let calls=0;
 const request=async()=>{calls++;throw Error('offline')};
 assert.equal((await api.checkSite(site,'Jane42',{request})).status,'skipped');assert.equal(calls,0);
 assert.equal((await api.checkSite(site,'jane',{request})).status,'inconclusive');assert.equal(calls,1);
});
test('scanner streams results with a run identifier, bounds concurrency and serializes each hostname',async()=>{
 const data=catalog(Object.fromEntries(Array.from({length:30},(_,i)=>['Site '+i,sample({url:`https://${i%6}.example/user${i}/{username}`})])));
 let active=0,max=0;const activeHosts=new Set(),updates=[];
 const request=async url=>{const host=new URL(url).hostname;assert.equal(activeHosts.has(host),false);activeHosts.add(host);active++;max=Math.max(max,active);await delay(2);active--;activeHosts.delete(host);return page(404)};
 const result=await api.scanUsername(data,{query:'Jane',runId:'unit-run',limit:'all',concurrency:3},{request,onProgress:p=>updates.push(p)});
 assert.equal(result.completed,30);assert.equal(result.counts.not_found,30);assert.ok(max<=3&&max>1);assert.equal(result.canceled,false);assert.equal(updates[0].completed,0);assert.equal(updates.at(-1).completed,30);assert.ok(updates.every(p=>p.runId==='unit-run'));assert.equal(updates.flatMap(p=>p.results).length,30);
});
test('canceling stops queued work, preserves partial results and empty filters complete cleanly',async()=>{
 const data=catalog(Object.fromEntries(Array.from({length:10},(_,i)=>['Site '+i,sample({url:`https://${i}.example/{username}`})]))),controller=new AbortController();let calls=0;
 const result=await api.scanUsername(data,{query:'Jane',runId:'cancel-run',limit:'all',concurrency:1},{signal:controller.signal,request:async()=>{if(++calls===3)controller.abort();return page(404)}});
 assert.equal(result.canceled,true);assert.equal(result.completed,3);assert.equal(result.results.length,3);assert.equal(calls,3);
 const empty=await api.scanUsername(data,{query:'Jane',runId:'empty-run',category:'absent'},{request:async()=>{throw Error('Must not be called')}});assert.equal(empty.total,0);assert.equal(empty.completed,0);
});
test('catalog refresh is persisted and a failed refresh leaves the usable catalog intact',async()=>{
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'h3x-username-test-'));
 try{
  let fail=false;const updated={sites:Object.fromEntries(Array.from({length:510},(_,i)=>['Updated '+i,sample({url:`https://updated${i}.example/{username}`})]))};
  const request=async()=>{if(fail)throw Error('offline');return page(200,JSON.stringify(updated))};
  const store=api.createCatalogStore(directory,request);assert.ok((await store.load()).stats.available>7000);
  assert.equal((await store.refresh()).stats.available,510);fail=true;await assert.rejects(()=>store.refresh(),/offline/);assert.equal((await store.load()).stats.available,510);
  assert.equal((await api.createCatalogStore(directory).load()).stats.available,510);
 }finally{await fs.rm(directory,{recursive:true,force:true})}
});
test('IPC cancellation is sender-owned and duplicate searches are rejected',async()=>{
 const handlers={};let finish,observedSignal;const sender=new EventEmitter();sender.id=7;sender.isDestroyed=()=>false;sender.send=()=>{};
 api.registerUsernameSearch({ipcMain:{handle:(name,handler)=>handlers[name]=handler},directory:os.tmpdir(),store:{load:async()=>catalog()},scan:async(_,options,context)=>{observedSignal=context.signal;await new Promise(resolve=>finish=resolve);return {completed:0,counts:{match:0,possible:0},canceled:context.signal.aborted,elapsedMs:0}}});
 const running=handlers['username:scan']({sender},{query:'Jane',runId:'ipc-run'});await delay(1);
 await assert.rejects(()=>handlers['username:scan']({sender},{query:'Jane',runId:'second'}),/already running/);
 assert.equal(handlers['username:cancel']({sender:{id:9}}),false);assert.equal(observedSignal.aborted,false);assert.equal(handlers['username:cancel']({sender}),true);assert.equal(observedSignal.aborted,true);finish();assert.equal((await running).canceled,true);assert.equal(sender.listenerCount('destroyed'),0);
});
test('DNS lookup pins a public IPv4 address and refuses a mixed public/private answer',async t=>{
 const dns=require('node:dns');let answers=[{address:'8.8.8.8',family:4}];t.mock.method(dns,'lookup',(_host,_options,callback)=>callback(null,answers));
 const lookup=all=>new Promise((resolve,reject)=>api.publicLookup('example.com',{all},(error,...values)=>error?reject(error):resolve(values)));
 assert.deepEqual(await lookup(false),['8.8.8.8',4]);assert.deepEqual(await lookup(true),[[{address:'8.8.8.8',family:4}]]);
 answers.push({address:'127.0.0.1',family:4});await assert.rejects(()=>lookup(false),/non-public/);
});
test('HTTP transport bounds response bodies and refuses cross-domain redirects',async t=>{
 const https=require('node:https');let response=page(200,'small');
 t.mock.method(https,'get',(_url,options,callback)=>{assert.equal(typeof options.lookup,'function');const request=new EventEmitter();process.nextTick(()=>{const stream=Readable.from([Buffer.from(response.body)]);stream.statusCode=response.status;stream.headers=response.headers;callback(stream)});return request});
 assert.equal((await api.requestPage('https://example.com/user')).body,'small');
 await assert.rejects(()=>api.requestPage('https://example.com/user',{maxBytes:2}),/size limit/);
 response={...page(302,''),headers:{location:'https://different.example/login'}};await assert.rejects(()=>api.requestPage('https://example.com/user'),/another domain/);
 response={...page(302,''),headers:{location:'/again'}};await assert.rejects(()=>api.requestPage('https://example.com/user'),/redirect could not/);
});

test('maximum concurrency runs up to 100 checks and survives saved settings',async()=>{
 const data=catalog(Object.fromEntries(Array.from({length:125},(_,i)=>['Max '+i,sample({url:`https://max${i}.example/{username}`})])));
 let active=0,peak=0;
 const request=async()=>{active++;peak=Math.max(peak,active);await delay(5);active--;return page(404)};
 const options=api.configuredOptions({usernameSearchOptions:{schemaVersion:2,concurrency:'max'}});
 assert.equal(options.concurrency,'max');
 const result=await api.scanUsername(data,{...options,query:'Jane',runId:'max-run'},{request});
 assert.equal(result.completed,125);assert.equal(peak,100);
});

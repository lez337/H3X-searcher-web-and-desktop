import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';

const code=(await build({entryPoints:['src/activity.ts'],bundle:true,format:'esm',platform:'browser',write:false})).outputFiles[0].text;
const {activityResult,trackActivity,filterLogs,readableLogs}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));

test('Activity reports partial results, provider outcomes and limits without raw records or notices',()=>{
 const result=activityResult({items:[{password:'private-record'}],notice:'private-notice',limited:true,meta:{providerStatus:[{label:'GitHub',status:'complete',count:1},{label:'OathNet',status:'error',count:0,message:'private-error'}]}});
 assert.equal(result.level,'warning');assert.match(result.detail,/1 records returned/);assert.match(result.detail,/GitHub: complete/);assert.match(result.detail,/OathNet: error/);assert.match(result.detail,/result limit/);assert.doesNotMatch(result.detail,/private/);
 assert.equal(activityResult({meta:{canceled:true}}).outcome,'canceled');
 assert.equal(activityResult(false).outcome,'finished without changes');
});

test('Activity tracks start, finish and duration and does not depend on log storage',async()=>{
 const entries=[],value={items:[]};
 assert.equal(await trackActivity('Search','search',async()=>value,(...args)=>entries.push(args)),value);
 assert.equal(entries[0][0],'Search started');assert.equal(entries[1][0],'Search completed');assert.equal(entries[1][3],'search');assert.ok(entries[1][4]>=0);
 assert.equal(await trackActivity('Save','workspace',async()=>true,()=>{throw Error('Storage unavailable')}),true);
});

test('Activity preserves errors and records actionable HTTP failures without secrets',async()=>{
 const entries=[],error=Object.assign(Error('Bearer private-key'),{status:429});
 await assert.rejects(()=>trackActivity('Search','search',async()=>{throw error},(...args)=>entries.push(args)),e=>e===error);
 assert.equal(entries[1][2],'error');assert.match(entries[1][1],/rate limit/);assert.doesNotMatch(JSON.stringify(entries),/private-key/);
 entries.length=0;await assert.rejects(()=>trackActivity('Scan','files',async()=>{throw new DOMException('private-query','AbortError')},(...args)=>entries.push(args)));
 assert.equal(entries[1][0],'Scan canceled');assert.equal(entries[1][2],'warning');
});

test('Log filters agree with legacy defaults, search dates and export multiline readable text',()=>{
 const entries=[{time:'2026-11-15T10:20:30.123Z',event:'Imported',detail:'First line\nSecond line',durationMs:12},{time:'2026-11-15T10:20:31Z',event:'Search failed',detail:'Retry',scope:'search',level:'error'}];
 assert.equal(filterLogs(entries,' workspace ','info','workspace').length,1);
 assert.equal(filterLogs(entries,'10:20:30','all','all').length,1);
 assert.equal(filterLogs(entries,'','all','all')[0].event,'Search failed');
 assert.equal(entries[0].event,'Imported');
 assert.match(readableLogs(entries),/INFO \| workspace \| Imported \| 12 ms\nFirst line\nSecond line/);
});

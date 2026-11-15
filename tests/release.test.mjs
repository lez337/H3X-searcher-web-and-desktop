import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {readFileSync} from 'node:fs';
const script=new URL('../scripts/release.mjs',import.meta.url);
const invoke=(...args)=>spawnSync(process.execPath,[fileURLToPath(script),...args],{encoding:'utf8'});

test('release rejects invalid, equal and older versions before changing files',()=>{
  const {version:current}=JSON.parse(readFileSync(new URL('../package.json',import.meta.url)));
  for(const version of ['',current,'v999.0.0','999.0.0-beta.1','0999.0.0','0.0.0'])assert.notEqual(invoke(version,'--dry-run').status,0);
});
test('release dry run builds before committing and atomically pushing its matching tag',()=>{
  const result=invoke('999.0.0','--dry-run');
  assert.equal(result.status,0,result.stderr);
  assert.match(result.stdout,/version 999\.0\.0 --no-git-tag-version/);
  assert.ok(result.stdout.indexOf('run release:build')<result.stdout.indexOf('git add --all'));
  assert.match(result.stdout,/git tag -a v999\.0\.0/);
  assert.match(result.stdout,/git push --atomic origin main refs\/tags\/v999\.0\.0/);
});

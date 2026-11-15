import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

process.chdir(fileURLToPath(new URL('..', import.meta.url)));
const manifest=JSON.parse(readFileSync('package.json','utf8'));
const args=process.argv.slice(2);
const dryRun=args.at(-1)==='--dry-run';
if(dryRun)args.pop();
const version=args[0]??manifest.version.split('.').map((value,index)=>index===2?Number(value)+1:value).join('.');
const run=(command,values,capture=false)=>execFileSync(command,values,{stdio:capture?'pipe':'inherit',encoding:'utf8'});
const git=(...values)=>run('git',values,true).trim();

try{
  if(args.length>1||!/^\d+\.\d+\.\d+$/.test(version||''))throw Error('Usage: npm run release [-- <version>] [--dry-run]');
  const newer=version.split('.').map(Number);
  const current=manifest.version.split('.').map(Number);
  const difference=newer.findIndex((value,index)=>value!==current[index]);
  if(newer.some(value=>!Number.isSafeInteger(value))||version.split('.').some(value=>String(Number(value))!==value)||difference<0||newer[difference]<current[difference])throw Error('Choose a stable version newer than '+manifest.version+'.');
  const tag='v'+version;
  // Use npm's Node entry point: spawning npm.cmd directly fails on Windows.
  const npmArgs=values=>[process.env.npm_execpath||fileURLToPath(new URL('../node_modules/npm/bin/npm-cli.js',import.meta.url)),...values];
  const commands=[
    [process.execPath,npmArgs(['version',version,'--no-git-tag-version'])],
    ...['test','build','deploy:check','release:build'].map(name=>[process.execPath,npmArgs(['run',name])]),
    ['git',['add','--all']],
    ['git',['commit','-m','Release '+tag]],
    ['git',['tag','-a',tag,'-m','Release '+tag]],
    ['git',['push','--atomic','origin','main','refs/tags/'+tag]],
  ];
  if(dryRun){for(const [command,values] of commands)console.log([command,...values].join(' '));}
  else{
    if(process.platform!=='win32')throw Error('Build Windows releases on Windows.');
    if(!process.env.npm_execpath)throw Error('Run this script through npm run release.');
    if(git('branch','--show-current')!=='main')throw Error('Switch to main before releasing.');
    const expected=manifest.repository.url.replace(/\.git$/,'');
    if(![expected,expected+'.git','git@github.com:'+manifest.releaseRepository+'.git'].includes(git('remote','get-url','--push','origin')))throw Error('origin must point to '+manifest.releaseRepository+'.');
    if(git('tag','--list',tag)||git('ls-remote','--tags','origin','refs/tags/'+tag))throw Error(tag+' already exists. Choose another version.');
    git('fetch','origin','main');
    run('git',['merge-base','--is-ancestor','FETCH_HEAD','HEAD']);
    for(const [command,values] of commands)run(command,values);
    console.log('Pushed '+tag+'. GitHub Actions will publish both EXEs: https://github.com/'+manifest.releaseRepository+'/actions');
  }
}catch(error){console.error(error.message);process.exitCode=1;}

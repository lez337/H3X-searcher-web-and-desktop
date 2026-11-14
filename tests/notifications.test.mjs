import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {build} from 'esbuild';

const code=(await build({entryPoints:['src/Notifications.tsx'],bundle:true,format:'cjs',platform:'node',jsx:'automatic',external:['react','react/jsx-runtime','lucide-react'],write:false})).outputFiles[0].text;
function mount(){
 let muted=false,previous,cleanup,tree,message='',opened=0;
 const timers=new Map();let nextId=0;
 const onDismiss=value=>{message=value};
 const jsx=(type,props)=>({type,props});
 const context={module:{exports:{}},setTimeout:(callback,delay)=>{timers.set(++nextId,{callback,delay});return nextId},clearTimeout:id=>timers.delete(id),require:name=>name==='react'?{
  useState:()=>[muted,value=>{muted=value}],
  useEffect:(effect,deps)=>{if(!previous||deps.some((value,i)=>value!==previous[i])){cleanup?.();previous=deps;cleanup=effect()}},
 }:name==='react/jsx-runtime'?{jsx,jsxs:jsx}:{Bell:'bell',BellOff:'bell-off'}};
 vm.runInNewContext(code,context);
 const render=()=>{tree=context.module.exports.default({message,onDismiss,onLogs:()=>opened++});return tree};
 const buttons=()=>{
  const found=[];
  function visit(node){if(!node||typeof node!=='object')return;if(node.type==='button')found.push(node);for(const child of [node.props?.children].flat())visit(child)}
  visit(tree);return found;
 };
 return {show(value){message=value;render()},render,buttons,timers,unmount:()=>cleanup?.(),get message(){return message},get opened(){return opened}};
}

test('Notifications expire after five seconds and cancel obsolete timers',()=>{
 const app=mount();app.show('First');
 const first=[...app.timers.keys()][0];app.show('Second');
 assert.equal(app.timers.has(first),false);
 assert.equal(app.timers.size,1);
 const timer=[...app.timers.values()][0];assert.equal(timer.delay,5000);
 timer.callback();app.render();assert.equal(app.buttons().length,1);
 app.show('Third');app.unmount();assert.equal(app.timers.size,0);
});

test('Bell mutes future notifications and allows unmuting',()=>{
 const app=mount();app.show('First');
 app.buttons().at(-1).props.onClick();app.render();
 assert.equal(app.buttons()[0].props['aria-pressed'],true);
 app.show('Muted');assert.equal(app.buttons().length,1);
 app.buttons()[0].props.onClick();app.render();
 assert.equal(app.buttons()[0].props['aria-pressed'],false);
 app.show('Visible');assert.equal(app.buttons().length,2);
});

test('Clicking a notification opens Logs and dismisses the message',()=>{
 const app=mount();app.show('Search failed');app.buttons()[0].props.onClick();app.render();
 assert.equal(app.opened,1);assert.equal(app.message,'');assert.equal(app.buttons().length,1);
});

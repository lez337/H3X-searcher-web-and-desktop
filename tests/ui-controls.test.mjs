import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import vm from 'node:vm';
import {build} from 'esbuild';
const require=createRequire(import.meta.url);
async function component(path,exportName='default'){
  const result=await build({entryPoints:[path],bundle:true,format:'cjs',platform:'node',write:false,external:['react','react/jsx-runtime','./bridge'],loader:{'.css':'empty'}});
  const module={exports:{}};
  vm.runInNewContext(result.outputFiles[0].text,{module,exports:module.exports,require:name=>name==='./bridge'?{}:name==='react'?{...require(name),useState:value=>[value,()=>{}],useMemo:fn=>fn(),useEffect:()=>{},useRef:value=>({current:value})}:require(name)});
  return module.exports[exportName];
}
function nodes(node){
  if(!node||typeof node!=='object')return [];
  if(Array.isArray(node))return node.flatMap(nodes);
  return [node,...nodes(node.props?.children)];
}
const LoginScreen=await component('src/web/LoginScreen.tsx');
const AccountSettings=await component('src/web/AccountMenu.tsx','AccountSettings');

test('Account deletion requires a separate eight-digit login key and warns that deletion is permanent',()=>{
  const view=nodes(AccountSettings({account:{id:'fixture',name:'Fixture'},sync:{status:'saved'},busy:false}));
  const input=view.find(node=>node.type==='input'&&node.props.id==='delete-login-code');
  assert.equal(input.props.type,'password');assert.equal(input.props.required,true);assert.equal(input.props.pattern,'[0-9]{8}');
  const form=view.find(node=>node.type==='form'&&nodes(node.props.children).includes(input));
  assert.equal(nodes(form).find(node=>node.type==='button').props.disabled,true);
  assert.ok(nodes(form).some(node=>node.type==='p'&&node.props.children.includes('This cannot be undone.')));
});
test('Startup hides the login form until the session and workspace are ready',()=>{
  const props={ready:false,mode:'login',name:'',accountKey:''};
  const loading=nodes(LoginScreen(props));
  assert.ok(loading.some(node=>node.props?.role==='status'));
  assert.ok(!loading.some(node=>node.type==='form'||node.type==='input'));
  const ready=nodes(LoginScreen({...props,ready:true}));
  assert.ok(ready.some(node=>node.type==='form'));
  assert.ok(!ready.some(node=>node.props?.role==='status'));
});
const Investigations=await component('src/Investigations.tsx'),PeopleCards=await component('src/PeopleCards.tsx');
test('Clicking an open investigation collapses it; clicking a closed one expands it',()=>{
  for(const selected of ['case',null]){
    let next,person;
    const view=Investigations({cases:[{id:'case',title:'Fixture',people:[]}],selected,setSelected:value=>next=value,setPersonId:value=>person=value,excludedFields:[]});
    const button=nodes(view).find(node=>node.type==='button'&&node.props['aria-controls']==='investigation-people-case');
    assert.equal(button.props['aria-expanded'],selected==='case');
    button.props.onClick();assert.equal(next,selected?null:'case');
    assert.equal(person,'');
  }
});
test('Person location uses the same collapsed disclosure as identity and contact',()=>{
  const view=PeopleCards({items:[{id:'record',source:'Fixture',fields:{name:'Fixture Person',email:'fixture@example.org',address:'12 Example Road'}}]});
  const card=nodes(view).find(node=>typeof node.type==='function'&&node.type.name==='PersonCard');
  assert.ok(card);
  const location=nodes(card.type(card.props)).find(node=>node.type==='details'&&nodes(node.props.children).some(child=>child.type==='summary'&&child.props.children?.[0]==='Location'));
  assert.ok(location);assert.equal(location.props.open,undefined);
});


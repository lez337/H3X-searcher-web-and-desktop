const test=require('node:test');
const assert=require('node:assert/strict');
const {graphNodes,graphLinks}=require('../src/graphModel.ts');
const person={id:'p1',name:'Alex Example',phone:'+1 202 555 0142, +12025550143',altPhone:'+12025550142',email:'alex@example.org',username:'alex',dateOfBirth:'1990-06-15',address:'Example Street',notes:'Person notes',customCategories:[{id:'c',label:'Occupation',value:'Designer'}]};
const record={cases:[{id:'case1',title:'Investigation',summary:'Summary',people:[person,{id:'p2',name:'Other Example',phone:'',notes:''}]}],pins:[],links:[],graph:{nodes:[],positions:{},hidden:[]}};
test('investigations expand into people and unique connected details by default',()=>{
 const nodes=graphNodes(record),links=graphLinks(record),details=nodes.filter(n=>n.derived&&n.kind!=='Person');
 assert.equal(nodes.filter(n=>n.kind==='Person').length,2);
 assert.equal(nodes.filter(n=>n.kind==='Phone').length,2);
 assert.ok(details.some(n=>n.label==='alex@example.org'));assert.ok(details.some(n=>n.label==='Designer'));
 assert.ok(nodes.filter(n=>n.derived).every(n=>n.caseId==='case1'));
 assert.ok(links.every(l=>nodes.some(n=>n.id===l.from)&&nodes.some(n=>n.id===l.to)));
 assert.equal(links.length,nodes.length-1);
});
test('people and investigation modes preserve details and stable identifiers',()=>{
 const before=JSON.stringify(record),full=graphNodes(record);
 const people={...record,graph:{...record.graph,detailMode:'people'}};
 assert.deepEqual(graphNodes(people).map(n=>n.id),full.filter(n=>!n.derived||n.kind==='Person').map(n=>n.id));
 assert.equal(graphLinks(people).length,2);
 const compact={...record,graph:{...record.graph,detailMode:'investigations'}};
 assert.equal(graphNodes(compact).length,1);assert.equal(graphLinks(compact).length,0);
 assert.equal(JSON.stringify(record),before);
 assert.deepEqual(graphNodes(record).map(n=>n.id),full.map(n=>n.id));
});
test('manual connections and hidden generated connections persist independently',()=>{
 const generated=graphLinks(record)[0];
 const changed={...record,links:[{id:'manual',from:'case1',to:generated.to,label:'Reviewed'}],graph:{...record.graph,hidden:[generated.id]}};
 assert.ok(graphLinks(changed).some(l=>l.id==='manual'));assert.ok(graphLinks(changed).every(l=>l.id!==generated.id));
});

test('automatic graph keeps important facts and omits provider metadata and repeated identity fields',()=>{
 const p={...person,age:'36',postalCode:'75001',address:'Example Street 75001',shipping:'example street 75001',altPhone:'0012025550142',customCategories:[
  {label:'Full name',value:'Alex Example'}, {label:'First name',value:'Alex'}, {label:'Last name',value:'Example'},
  {label:'Source',value:'Provider A'}, {label:'Email domain',value:'gmail.com'}, {label:'Domain',value:'gmail.com'},
  {label:'Record ID',value:'record-123'}, {label:'Confidence',value:'95'}, {label:'Reviews',value:'42'},
  {label:'Occupation',value:'Designer'}, {label:'City',value:'Paris'}, {label:'Company',value:'Example Company'},
  {label:'Email address',value:'ALEX@EXAMPLE.ORG'}, {label:'Country',value:'Unknown'},
 ]};
 const data={...record,cases:[{...record.cases[0],title:'Example Alex',people:[p]}]};
 const before=JSON.stringify(data),nodes=graphNodes(data),labels=nodes.map(n=>n.label),ids=new Set(nodes.map(n=>n.id));
 for(const unwanted of ['Alex','Example','Provider A','gmail.com','record-123','95','42','36','75001','Unknown','Example Alex'])assert.ok(!labels.includes(unwanted),unwanted);
 for(const wanted of ['Alex Example','alex@example.org','Designer','Paris','Example Company','1990-06-15'])assert.ok(labels.includes(wanted),wanted);
 assert.equal(nodes.filter(n=>n.kind==='Phone').length,2);
 assert.equal(nodes.filter(n=>n.kind==='Email').length,1);
 assert.equal(nodes.filter(n=>n.kind==='Place').length,2);
 assert.ok(graphLinks(data).every(l=>ids.has(l.from)&&ids.has(l.to)&&l.from!==l.to));
 assert.equal(JSON.stringify(data),before);
 assert.equal(graphNodes({...data,graph:{...data.graph,detailMode:'investigations'}})[0].label,'Example Alex');
});
const {investigationView,expandedPersonNodes}=require('../src/graphModel.ts');
test('investigation scope blocks other records even across manual links',()=>{
 const scoped={...record,cases:[...record.cases,{id:'case2',title:'Other investigation',people:[{...person,id:'p3',email:'other@example.org'}]}],pins:[{id:'place1',caseId:'case1',name:'Local place'},{id:'place2',caseId:'case2',name:'Other place'}],links:[{id:'l1',from:'case1',to:'shared',label:'source'},{id:'l2',from:'shared',to:'case2',label:'cross case'},{id:'l3',from:'shared',to:'place2',label:'cross place'}],graph:{...record.graph,nodes:[{id:'shared',kind:'Note',label:'Linked source',note:''},{id:'foreign',caseId:'case2',kind:'Note',label:'Foreign note',note:''}]}};
 const before=JSON.stringify(scoped),view=investigationView(scoped,'case1'),ids=new Set(view.nodes.map(n=>n.id));
 assert.ok(ids.has('shared'));assert.ok(ids.has('place1'));
 for(const id of ['case2','place2','foreign'])assert.ok(!ids.has(id));
 assert.ok(view.nodes.every(n=>!n.caseId||n.caseId==='case1'));
 assert.ok(view.links.every(l=>ids.has(l.from)&&ids.has(l.to)));
 assert.equal(JSON.stringify(scoped),before);
});
test('person details toggle independently with stable nodes for a single-person investigation',()=>{
 const data={...record,cases:[{...record.cases[0],title:person.name,people:[person]}]};
 const {nodes}=investigationView(data,'case1');
 const parent=nodes.find(n=>n.kind==='Person');
 assert.deepEqual(expandedPersonNodes(nodes,new Set()).map(n=>n.id),[parent.id]);
 assert.equal(expandedPersonNodes(nodes,new Set([parent.id])).length,nodes.length);
 assert.equal(expandedPersonNodes(nodes,new Set()).length,1);
 assert.equal(data.cases[0].people[0].email,'alex@example.org');
});

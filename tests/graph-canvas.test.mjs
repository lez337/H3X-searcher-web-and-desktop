import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {build} from 'esbuild';

const code = (await build({entryPoints:['src/GraphCanvas.tsx'], bundle:true, format:'iife', globalName:'Graph', write:false, plugins:[{
  name:'canvas-hooks', setup(b) {
    b.onResolve({filter:/^react(?:\/jsx-runtime)?$/}, args=>({path:args.path,namespace:'fixture'}));
    b.onLoad({filter:/.*/,namespace:'fixture'}, args=>({contents:args.path==='react' ?
      'export const forwardRef=f=>f, useRef=v=>({current:v===null?globalThis.canvas:v}), useEffect=f=>globalThis.effects.push(f), useImperativeHandle=(ref,f)=>ref.current=f();' :
      'export const jsx=(type,props)=>({type,props}), jsxs=jsx;'}));
  }
}]})).outputFiles[0].text;

function scene(reduced=false, single=false) {
  const texts=[], arcs=[], effects=[];
  let frame, paints=0;
  const ctx=new Proxy({measureText:text=>({width:text.length*8}), fillText:(...args)=>texts.push(args), arc:(...args)=>arcs.push(args), clearRect:()=>paints++, createRadialGradient:()=>({addColorStop(){}}), createLinearGradient:()=>({addColorStop(){}})}, {
    get:(target,key)=>key in target?target[key]:()=>{},
  });
  const canvas={getContext:()=>ctx, getBoundingClientRect:()=>({width:900,height:600,left:0,top:0}), addEventListener(){}, removeEventListener(){}, focus(){}, setPointerCapture(){}, style:{}};
  const context={canvas,effects,window:{matchMedia:()=>({matches:reduced}),devicePixelRatio:1},requestAnimationFrame:fn=>(frame=fn,1),cancelAnimationFrame(){},ResizeObserver:class {constructor(fn){this.fn=fn} observe(){this.fn()} disconnect(){} }};
  vm.createContext(context); vm.runInContext(code,context);
  const ref={}, node={id:'person',kind:'Person',label:'Alex Example',color:'#dedede'}, detail={id:'email',kind:'Email',label:'alex@example.org',color:'#dedede'};
  const view=context.Graph.default({nodes:single?[node]:[node,detail],links:single?[]:[{id:'link',from:'person',to:'email',label:'Email',confidence:'supported'}],positions:{person:{x:-180,y:0,z:0},email:{x:180,y:0,z:0}},flat:true,labels:true,selected:null,spinning:false},ref);
  const cleanups=effects.map(effect=>effect());
  return {ref,view,texts,arcs,paint:time=>frame(time),paints:()=>paints,close:()=>cleanups.forEach(fn=>fn?.())};
}

test('canvas keeps names and types readable and animates without moving node hit targets',()=>{
  const s=scene();
  try {
    for (let time=0;time<1500;time+=50) s.paint(time);
    assert.ok(s.texts.some(([text])=>text==='Alex Example'));
    assert.ok(s.texts.some(([text])=>text==='Person'));
    assert.ok(s.texts.some(([text])=>text==='alex@example.org'));
    const before=s.arcs.at(-1)[2];
    const paints=s.paints();
    s.paint(1700);
    assert.equal(s.paints(),paints+1);
    assert.equal(s.arcs.at(-1)[2],before);
    s.ref.current.zoom(1.5);
    s.paint(1750);
    assert.ok(s.arcs.at(-1)[2]>=before);
  } finally {s.close()}
});

test('a single person fits centrally with a readable name and a large hit target',()=>{
  const s=scene(true,true);
  try {
    s.paint(1000);
    const [x,y,radius]=s.arcs.at(-1);
    assert.equal(x,450); assert.equal(y,300); assert.ok(radius>=32);
    assert.ok(s.texts.some(([text,x,y])=>text==='Alex Example'&&x===450&&y>300&&y<600));
  } finally {s.close()}
});

test('reduced motion renders once at rest and applies camera changes immediately',()=>{
  const s=scene(true);
  try {
    s.paint(1000); const radius=s.arcs.at(-1)[2];
    s.paint(1200); assert.equal(s.paints(),1);
    s.ref.current.zoom(.5); s.paint(1250);
    assert.equal(s.paints(),2);
    assert.ok(s.arcs.at(-1)[2]<radius);
    s.paint(1400); assert.equal(s.paints(),2);
  } finally {s.close()}
});

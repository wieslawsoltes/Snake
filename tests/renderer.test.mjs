/** API-contract tests, NOT native GPU execution or WGSL compiler validation. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { LCDRenderer } from '../src/renderer.js';
function fixture(options={}){
 const calls=[],lost={};lost.promise=new Promise(resolve=>lost.resolve=resolve);
 const pass=()=>({setPipeline(){},setBindGroup(){},dispatchWorkgroups:n=>calls.push(['dispatch',n]),draw:n=>calls.push(['draw',n]),end(){}});
 const device={
  lost:lost.promise,queue:{writeBuffer:(buffer,offset,data)=>calls.push(['write',buffer.label,offset,data.byteLength]),submit:commands=>calls.push(['submit',commands.length])},
  createBuffer:d=>({...d,destroy(){}}),
  createShaderModule:d=>({getCompilationInfo:async()=>({messages:options.shaderError?[{type:'error',message:'fixture compilation error'}]:[]}),...d}),
  createComputePipelineAsync:async d=>({getBindGroupLayout:()=>({}),...d}),
  createRenderPipelineAsync:async d=>({getBindGroupLayout:()=>({}),...d}),
  createBindGroup:d=>d,
  createCommandEncoder:()=>{if(options.drawError)throw Error('fixture draw error');return {beginComputePass:pass,beginRenderPass:pass,finish:()=>({})};},
  addEventListener(){},destroy(){calls.push(['destroy']);}
 };
 const context2d=()=>({fillRect(){},createImageData:(w,h)=>({width:w,height:h,data:new Uint8ClampedArray(w*h*4)}),putImageData(){},drawImage(){}});
 globalThis.OffscreenCanvas=class{constructor(w,h){this.width=w;this.height=h;}getContext(){return context2d();}};
 function canvas(){return {width:84,height:48,getBoundingClientRect:()=>({width:options.width||336,height:options.height||0}),cloneNode:()=>canvas(),replaceWith(next){calls.push(['replace']);},getContext(kind){return kind==='webgpu'?{configure:d=>calls.push(['configure',d.format]),getCurrentTexture:()=>({createView:()=>({})})}:context2d();}};}
 const adapter={requestDevice:async()=>device};
 const gpu={requestAdapter:async d=>{calls.push(['adapter',d.powerPreference]);return options.noAdapter?null:adapter;},getPreferredCanvasFormat:()=> 'bgra8unorm'};
 Object.defineProperty(globalThis,'navigator',{value:options.noGPU?{}:{gpu},configurable:true});
 globalThis.window={devicePixelRatio:2};globalThis.isSecureContext=!options.insecure;
 globalThis.GPUBufferUsage={STORAGE:128,COPY_DST:8,UNIFORM:64};
 return {canvas:canvas(),calls,device,lost};
}
const settings={contrast:.9,backlight:true,ghosting:true,grid:true};
test('WebGPU contract: allocates, uploads, dispatches 63 groups and draws one triangle',async()=>{
 const f=fixture(),r=new LCDRenderer(f.canvas);await r.init();assert.equal(r.name,'WebGPU');assert.equal(r.canvas.width,672);r.upload(new Uint32Array(4032));r.draw(1/60,settings);
 assert(f.calls.some(x=>x[0]==='adapter'&&x[1]==='low-power'));assert(f.calls.some(x=>x[0]==='configure'&&x[1]==='bgra8unorm'));
 assert(f.calls.some(x=>x[0]==='write'&&x[1]==='LCD target pixels'&&x[3]===16128));assert(f.calls.some(x=>x[0]==='write'&&x[1]==='LCD parameters'&&x[3]===64));
 assert(f.calls.some(x=>x[0]==='dispatch'&&x[1]===63));assert(f.calls.some(x=>x[0]==='draw'&&x[1]===3));assert.equal(r.backend.frames,1);r.backend.destroy();
});
test('unchanged framebuffer is not uploaded on every frame',async()=>{const f=fixture(),r=new LCDRenderer(f.canvas);await r.init();r.draw(.016,settings);r.draw(.016,settings);assert.equal(f.calls.filter(x=>x[0]==='write'&&x[1]==='LCD target pixels').length,1);r.backend.destroy();});
test('missing WebGPU falls back to a fresh 2D canvas',async()=>{const f=fixture({noGPU:true}),r=new LCDRenderer(f.canvas);await r.init();assert.equal(r.name,'Canvas 2D');assert(f.calls.some(x=>x[0]==='replace'));r.draw(.016,settings);assert.equal(r.backend.frames,1);});
test('insecure context does not request an adapter',async()=>{const f=fixture({insecure:true}),r=new LCDRenderer(f.canvas);await r.init();assert.equal(r.name,'Canvas 2D');assert(!f.calls.some(x=>x[0]==='adapter'));});
test('unavailable GPU adapter falls back cleanly',async()=>{const f=fixture({noAdapter:true}),r=new LCDRenderer(f.canvas);await r.init();assert.equal(r.name,'Canvas 2D');assert.match(r.reason,/No WebGPU adapter/);});
test('shader compilation error destroys device and falls back',async()=>{const f=fixture({shaderError:true}),r=new LCDRenderer(f.canvas);await r.init();assert.equal(r.name,'Canvas 2D');assert.match(r.reason,/compilation error/);assert(f.calls.some(x=>x[0]==='destroy'));});
test('device loss replaces canvas without discarding framebuffer',async()=>{const f=fixture(),r=new LCDRenderer(f.canvas);await r.init();const pixels=new Uint32Array(4032);pixels[42]=1;r.upload(pixels);f.lost.resolve({message:'fixture device lost'});await new Promise(r=>setImmediate(r));assert.equal(r.name,'Canvas 2D');r.draw(.016,settings);assert.equal(r.backend.pixels[42],1);});
test('draw failure switches to Canvas and retains next-frame upload',async()=>{const f=fixture({drawError:true}),r=new LCDRenderer(f.canvas);await r.init();r.draw(.016,settings);assert.equal(r.name,'Canvas 2D');assert(r.needsUpload);r.draw(.016,settings);assert.equal(r.backend.frames,1);});
test('DPR rendering resolution is capped on very large displays',async()=>{const f=fixture({width:4000}),r=new LCDRenderer(f.canvas);await r.init();assert.equal(r.canvas.width,1680);assert.equal(r.canvas.height,960);r.backend.destroy();});
test('explicit Canvas selection skips all GPU initialization',async()=>{const f=fixture(),r=new LCDRenderer(f.canvas);await r.init(true);assert.equal(r.name,'Canvas 2D');assert(!f.calls.some(x=>x[0]==='adapter'));});

test('physical LCD projection respects a non-square-pixel display aperture',async()=>{const f=fixture({width:300,height:220}),r=new LCDRenderer(f.canvas);await r.init();assert.equal(r.canvas.width,600);assert.equal(r.canvas.height,440);r.backend.destroy();});
test('fallback reuses optical caches until size or settings change',async()=>{const f=fixture({noGPU:true}),r=new LCDRenderer(f.canvas);await r.init();r.draw(.016,settings);const cached=r.backend.surface;r.draw(.016,settings);assert.equal(r.backend.surface,cached);r.draw(.016,{...settings,angle:20});assert.notEqual(r.backend.surface,cached);});

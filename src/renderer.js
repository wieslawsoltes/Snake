import { LCD_WIDTH as W, LCD_HEIGHT as H } from './lcd.js';
import { opticalParameters, advanceCharge, aperture, opticalSurface } from './optics.js';
const N = W * H;
// One-bit RAM -> exponential charge response -> anisotropic reflective LCD projection.
const PARAMS = /* wgsl */`
struct Params {
 resolution: vec2f, delta: f32, contrast: f32,
 light: f32, ghosting: f32, grid: f32, ambient: f32,
 angle: f32, reflection: f32, rise: f32, fall: f32,
 padding: vec4f
}
`;
const WGSL = PARAMS + /* wgsl */`
@group(0) @binding(0) var<storage, read> pixelTargets: array<u32>;
@group(0) @binding(1) var<storage, read_write> charge: array<f32>;
@group(0) @binding(2) var<uniform> p: Params;
@compute @workgroup_size(64) fn update(@builtin(global_invocation_id) id: vec3u) {
 let i=id.x; if(i>=4032u){return;}
 let to=f32(pixelTargets[i]); let tau=select(p.fall,p.rise,to>charge[i]);
 let amount=select(1.0,1.0-exp(-clamp(p.delta,0.0,.1)/tau),p.ghosting>.5);
 var q=mix(charge[i],to,amount);
 if(q<.0001){q=0.0;} if(q>.9999){q=1.0;} charge[i]=q;
}
`;
const DRAW_WGSL = PARAMS + /* wgsl */`
@group(0) @binding(0) var<storage, read> charge: array<f32>;
@group(0) @binding(1) var<uniform> p: Params;
@vertex fn vs(@builtin(vertex_index) id:u32)->@builtin(position) vec4f {
 var positions=array<vec2f,3>(vec2f(-1,-1),vec2f(3,-1),vec2f(-1,3));
 return vec4f(positions[id],0,1);
}
fn noise(c:vec2u)->f32 {
 var h=c.x*374761393u+c.y*668265263u;
 h=(h^(h>>13u))*1274126177u;
 return f32(h^(h>>16u))/4294967295.0;
}
fn maskAt(q:vec2f,footprint:f32)->f32 {
 let f=fract(q); let d=min(f,1.0-f)-vec2f(.046,.052);
 let aa=clamp(d/footprint+.5,vec2f(0),vec2f(1));
 return select(1.0,aa.x*aa.y,p.grid>.5);
}
fn shadowAt(q:vec2f,footprint:f32)->f32 {
 if(any(q<vec2f(0))||any(q>=vec2f(84,48))){return 0.0;}
 let c=vec2u(q); return charge[c.y*84u+c.x]*maskAt(q,footprint);
}
@fragment fn fs(@builtin(position) pos:vec4f)->@location(0) vec4f {
 let uv=pos.xy/p.resolution;
 let q=clamp(uv*vec2f(84,48),vec2f(0),vec2f(83.999,47.999));
 let c=vec2u(q); let footprint=max(84.0/p.resolution.x,48.0/p.resolution.y);
 let coverage=maskAt(q,footprint);
 let ambient=sqrt(p.ambient); let edge=exp(-uv.x*9.0)+exp(-(1.0-uv.x)*9.0);
 let illum=(.40+.60*ambient)*(1.0-.075*length((uv-vec2f(.5,.48))*vec2f(1.4,1.1)));
 let led=p.light*(.15+.085*edge);
 let grain=(noise(vec2u(uv*vec2f(672,384)))-.5)*.012*p.reflection;
 let t=(uv.y+.36*uv.x-(.10+.08*p.angle))/.2;
 let reflection=exp(-t*t)*.045*p.reflection;
 let polar=1.0-.08*max(0.0,-p.angle);
 let bg=clamp((vec3f(.622,.669,.466)*illum*(1.0-p.light*.23)+vec3f(.53,.73,.235)*led)*polar+vec3f(reflection+grain),vec3f(0),vec3f(1));
 let ink=vec3f(.118,.153,.092)*(.65+.35*ambient)+p.light*vec3f(.017,.027,.002)+vec3f(reflection*.3);
 let density=clamp(p.contrast*(1.0-.27*abs(p.angle)+.055*p.angle),0.0,1.0);
 let shadow=shadowAt(q-vec2f(.14,.19),footprint)*.105;
 let alpha=clamp(charge[c.y*84u+c.x]*density*coverage,0.0,1.0);
 return vec4f(mix(bg*(1.0-shadow),ink,alpha),1.0);
}
`;

class GPULCD {
  static async create(canvas, onLost) {
    if (!navigator.gpu || !isSecureContext) throw new Error('WebGPU requires a supported browser and HTTPS or localhost.');
    const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'low-power' });
    if (!adapter) throw new Error('No WebGPU adapter available.');
    const device = await adapter.requestDevice();
    try {
      const target = device.createBuffer({ label: 'LCD target pixels', size: N * 4, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
      const charge = device.createBuffer({ label: 'LCD persistent pixel charge', size: N * 4, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
      const uniform = device.createBuffer({ label: 'LCD parameters', size: 64, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
      const format = navigator.gpu.getPreferredCanvasFormat();
      const computeModule = device.createShaderModule({ label: 'LCD response compute shader', code: WGSL });
      const drawModule = device.createShaderModule({ label: 'LCD display shader', code: DRAW_WGSL });
      for (const module of [computeModule, drawModule]) {
        if (module.getCompilationInfo) {
          const info = await module.getCompilationInfo();
          const errors = info.messages.filter(m => m.type === 'error');
          if (errors.length) throw new Error(errors.map(e => e.message).join('\n'));
        }
      }
      const compute = await device.createComputePipelineAsync({ label: 'LCD response', layout: 'auto', compute: { module: computeModule, entryPoint: 'update' } });
      const pipeline = await device.createRenderPipelineAsync({ label: 'Monochrome LCD', layout: 'auto', vertex: { module: drawModule, entryPoint: 'vs' }, fragment: { module: drawModule, entryPoint: 'fs', targets: [{ format }] }, primitive: { topology: 'triangle-list' } });
      const computeBind = device.createBindGroup({ layout: compute.getBindGroupLayout(0), entries: [ { binding: 0, resource: { buffer: target } }, { binding: 1, resource: { buffer: charge } }, { binding: 2, resource: { buffer: uniform } } ] });
      const drawBind = device.createBindGroup({ layout: pipeline.getBindGroupLayout(0), entries: [ { binding: 0, resource: { buffer: charge } }, { binding: 1, resource: { buffer: uniform } } ] });
      const context = canvas.getContext('webgpu');
      if (!context) throw new Error('WebGPU canvas context unavailable.');
      context.configure({ device, format, alphaMode: 'opaque' });
      const result = new GPULCD();
      Object.assign(result, { canvas, device, context, target, charge, uniform, compute, pipeline, computeBind, drawBind, params: new Float32Array(16), name: 'WebGPU', frames: 0, disposed: false });
      device.lost.then(info => { if (!result.disposed) onLost(info.message || 'GPU device lost'); });
      device.addEventListener('uncapturederror', e => { console.error('WebGPU:', e.error.message); if (!result.disposed) onLost(e.error.message); });
      return result;
    } catch (error) { device.destroy(); throw error; }
  }
  upload(pixels) { this.device.queue.writeBuffer(this.target, 0, pixels); }
  draw(dt, settings) {
    const p=opticalParameters(settings);
    this.params.set([this.canvas.width,this.canvas.height,dt,p.contrast,p.light,p.ghosting?1:0,p.grid?1:0,p.ambient,p.angle,p.reflection,p.rise,p.fall,0,0,0,0]);
    this.device.queue.writeBuffer(this.uniform, 0, this.params);
    const encoder = this.device.createCommandEncoder({ label: 'LCD frame' });
    const compute = encoder.beginComputePass(); compute.setPipeline(this.compute); compute.setBindGroup(0, this.computeBind); compute.dispatchWorkgroups(Math.ceil(N / 64)); compute.end();
    const pass = encoder.beginRenderPass({ colorAttachments: [{ view: this.context.getCurrentTexture().createView(), loadOp: 'clear', storeOp: 'store', clearValue: { r: 0.64, g: 0.72, b: 0.45, a: 1 } }] });
    pass.setPipeline(this.pipeline); pass.setBindGroup(0, this.drawBind); pass.draw(3); pass.end();
    this.device.queue.submit([encoder.finish()]); this.frames++;
  }
  destroy() { this.disposed = true; this.target.destroy(); this.charge.destroy(); this.uniform.destroy(); this.device.destroy(); }
}
/** Cached CPU projection. Static glass/illumination is baked only on resize or
 * optical-setting change; frames contain one charge loop and a linear RGBA loop.
 * No per-pixel DOM calls, allocations, noise functions, or gradients per frame. */
class CanvasLCD {
  constructor(canvas) {
    this.canvas=canvas; this.ctx=canvas.getContext('2d',{alpha:false});
    if(!this.ctx)throw new Error('Canvas is not available.');
    this.name='Canvas 2D';this.frames=0;this.pixels=new Uint32Array(N);this.charge=new Float32Array(N);
    this.scratch=typeof OffscreenCanvas==='function'?new OffscreenCanvas(84,48):document.createElement('canvas');
    this.scratchContext=this.scratch.getContext('2d',{alpha:false});this.cacheKey='';
  }
  upload(pixels){this.pixels.set(pixels);}
  bake(p){
    const width=Math.min(672,Math.max(W,this.canvas.width));
    const height=Math.max(H,Math.round(width*this.canvas.height/this.canvas.width));
    const footprint=Math.max(W/width,H/height),count=width*height;
    const key=JSON.stringify([width,height,p]);if(key===this.cacheKey)return;this.cacheKey=key;
    this.scratch.width=width;this.scratch.height=height;
    this.image=this.scratchContext.createImageData(width,height);
    this.surface=new Float32Array(count*6);this.coverage=new Float32Array(count);
    this.index=new Uint16Array(count);this.shadowIndex=new Int16Array(count);this.shadowCoverage=new Float32Array(count);
    this.density=opticalSurface(.5,.5,p)[6];
    for(let y=0,i=0;y<height;y++)for(let x=0;x<width;x++,i++){
      const qx=(x+.5)/width*W,qy=(y+.5)/height*H;
      const surf=opticalSurface((x+.5)/width,(y+.5)/height,p);
      this.surface.set(surf.slice(0,6),i*6);this.index[i]=Math.floor(qy)*W+Math.floor(qx);
      this.coverage[i]=aperture(qx%1,qy%1,p.grid,footprint);
      const sx=qx-.14,sy=qy-.19;
      this.shadowIndex[i]=sx<0||sy<0?-1:Math.floor(sy)*W+Math.floor(sx);
      this.shadowCoverage[i]=aperture(((sx%1)+1)%1,((sy%1)+1)%1,p.grid,footprint);
      this.image.data[i*4+3]=255;
    }
  }
  draw(dt,settings){
    const p=opticalParameters(settings);this.bake(p);
    const on=1-Math.exp(-Math.min(dt,.1)/p.rise),off=1-Math.exp(-Math.min(dt,.1)/p.fall);
    for(let i=0;i<N;i++){
      const to=this.pixels[i],old=this.charge[i];
      const q=p.ghosting?old+(to-old)*(to>old?on:off):to;
      this.charge[i]=q<.0001?0:q>.9999?1:q;
    }
    const data=this.image.data,s=this.surface,q=this.charge;
    for(let i=0,j=0,k=0;i<this.index.length;i++,j+=4,k+=6){
      const alpha=q[this.index[i]]*this.coverage[i]*this.density;
      const shadow=this.shadowIndex[i]<0?0:q[this.shadowIndex[i]]*this.shadowCoverage[i]*.105;
      const diffuse=(1-shadow)*(1-alpha);
      data[j]=Math.round(255*(s[k]*diffuse+s[k+3]*alpha));
      data[j+1]=Math.round(255*(s[k+1]*diffuse+s[k+4]*alpha));
      data[j+2]=Math.round(255*(s[k+2]*diffuse+s[k+5]*alpha));
    }
    this.scratchContext.putImageData(this.image,0,0);
    this.ctx.imageSmoothingEnabled=true;this.ctx.imageSmoothingQuality='high';
    this.ctx.drawImage(this.scratch,0,0,this.canvas.width,this.canvas.height);this.frames++;
  }
  destroy(){this.scratch.width=1;this.scratch.height=1;}
}
export class LCDRenderer {
  constructor(canvas, onChange = () => {}) {
    this.canvas = canvas; this.onChange = onChange; this.backend = null; this.pixels = new Uint32Array(N); this.reason = ''; this.needsUpload = true;
  }
  async init(forceCanvas = false) {
    try { if (forceCanvas) throw new Error('Canvas renderer selected'); this.backend = await GPULCD.create(this.canvas, message => this.fallback(message)); }
    catch (e) { this.fallback(e.message); }
    this.resize(); this.onChange(this.name, this.reason); return this;
  }
  fallback(reason) {
    this.reason = reason; this.backend?.destroy();
    // A canvas cannot change context type. Replacement also handles partial GPU initialization.
    const replacement = this.canvas.cloneNode(false); this.canvas.replaceWith(replacement); this.canvas = replacement;
    this.backend = new CanvasLCD(this.canvas); this.needsUpload = true; this.resize(); this.onChange(this.name, reason);
  }
  get name() { return this.backend?.name || 'Starting'; }
  resize() {
    const rect = this.canvas.getBoundingClientRect(), dpr = Math.min(3, window.devicePixelRatio || 1);
    const width = Math.max(W, Math.min(1680, Math.round(rect.width * dpr)));
    const aspect = rect.height > 0 ? rect.height / rect.width : H / W;
    const height = Math.max(H, Math.round(width * aspect));
    if (this.canvas.width !== width || this.canvas.height !== height) { this.canvas.width = width; this.canvas.height = height; }
    this.needsUpload = true;
  }
  upload(pixels) { this.pixels.set(pixels); this.needsUpload = true; }
  draw(dt, settings) {
    if (!this.backend) return;
    try { if (this.needsUpload) { this.backend.upload(this.pixels); this.needsUpload = false; } this.backend.draw(Math.max(dt,.001),settings); }
    catch (e) { if (this.name === 'WebGPU') this.fallback(e.message); else throw e; }
  }
}

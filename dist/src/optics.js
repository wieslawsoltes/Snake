/** Reflective monochrome LCD appearance model, not measured Nokia panel calibration.
 * RGB values are display-referred sRGB. Both GPU and CPU use the same operations.
 * Display data remains one bit; only the physical liquid-crystal response is analog.
 */
export const OPTICAL_DEFAULTS = Object.freeze({ambient:1, angle:0, reflection:true, rise:.032, fall:.085});
const clamp01 = value => Math.max(0, Math.min(1, value));
export function opticalParameters(settings = {}) {
  const finite = (value, fallback) => Number.isFinite(value) ? value : fallback;
  return {
    contrast: Math.max(.55, Math.min(1, finite(settings.contrast,.94))),
    light: settings.backlight ? 1 : 0, ghosting: settings.ghosting !== false,
    grid: settings.grid !== false, ambient: Math.max(.05, Math.min(1,finite(settings.ambient,1))),
    angle: Math.max(-45,Math.min(45,finite(settings.angle,0))) / 45,
    reflection: settings.reflection !== false ? 1 : 0, rise:.032, fall:.085
  };
}
export function advanceCharge(current, target, seconds, ghosting = true) {
  if (!ghosting) return target;
  const tau = target > current ? .032 : .085;
  const value = current + (target-current) * (1-Math.exp(-Math.max(0, Math.min(seconds,.1))/tau));
  return value < .0001 ? 0 : value > .9999 ? 1 : value;
}
export function surfaceNoise(x, y) {
  let h = (Math.imul(x,374761393) + Math.imul(y,668265263)) >>> 0;
  h = Math.imul(h ^ (h >>> 13),1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}
export function aperture(x, y, grid, footprint) {
  if (!grid) return 1;
  const dx = Math.min(x,1-x)-.046, dy = Math.min(y,1-y)-.052;
  return clamp01(dx / footprint + .5) * clamp01(dy / footprint + .5);
}
/** [background R,G,B, ink R,G,B, density] per point. No mutable global state. */
export function opticalSurface(u,v,p) {
  const light=p.light, ambient=Math.sqrt(p.ambient), angle=p.angle;
  const edge=Math.exp(-u*9)+Math.exp(-(1-u)*9);
  const illum=(.40+.60*ambient)*(1-.075*Math.hypot((u-.5)*1.4,(v-.48)*1.1));
  const led=light*(.15+.085*edge);
  const noise=(surfaceNoise(Math.floor(u*672),Math.floor(v*384))-.5)*.012*p.reflection;
  const reflection=Math.exp(-Math.pow((v+.36*u-(.10+.08*angle))/.2,2))*.045*p.reflection;
  const polar=1-.08*Math.max(0,-angle);
  const base=[.622,.669,.466], glow=[.53,.73,.235], ink=[.118,.153,.092];
  const bg=base.map((c,i)=>clamp01((c*illum*(1-light*.23)+glow[i]*led)*polar+reflection+noise));
  const dark=ink.map((c,i)=>clamp01(c*(.65+.35*ambient)+light*[.017,.027,.002][i]+reflection*.3));
  const density=clamp01(p.contrast*(1-.27*Math.abs(angle)+.055*angle));
  return [...bg,...dark,density];
}
export function shadeOpticalPixel(surface, charge, coverage=1, shadow=0) {
  const alpha=clamp01(charge*coverage*surface[6]);
  return surface.slice(0,3).map((bg,i)=>clamp01((bg*(1-shadow*.105))*(1-alpha)+surface[i+3]*alpha));
}

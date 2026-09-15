/** Original synthesized sounds. Audio is only unlocked by a user gesture. */
export class GameAudio {
  constructor() { this.context = null; this.enabled = true; this.haptics = true; }
  async unlock() {
    if (!this.enabled) return;
    try {
      if (!this.context) { const C = globalThis.AudioContext || globalThis.webkitAudioContext; if (C) this.context = new C(); }
      if (this.context && this.context.state === 'suspended') await this.context.resume();
    } catch { /* Audio is optional; denied autoplay never blocks the game. */ }
  }
  tone(frequency, duration = .05, when = 0, volume = .035) {
    if (!this.enabled || !this.context || this.context.state !== 'running') return;
    const c = this.context, t = c.currentTime + when, o = c.createOscillator(), gain = c.createGain();
    o.type='square'; o.frequency.value=frequency; gain.gain.setValueAtTime(0,t); gain.gain.linearRampToValueAtTime(volume,t+.003); gain.gain.exponentialRampToValueAtTime(.0001,t+duration);
    o.connect(gain); gain.connect(c.destination); o.start(t); o.stop(t+duration+.01);
    o.onended=()=>{o.disconnect();gain.disconnect();};
  }
  vibrate(pattern) { if (this.haptics && typeof navigator.vibrate==='function') { try { navigator.vibrate(pattern); } catch {} } }
  key() { this.tone(920,.019,0,.012); }
  play(event) {
    if (event==='food') { this.tone(1318,.045); this.vibrate(8); }
    if (event==='bonus') { [1047,1318,1568,2093].forEach((f,i)=>this.tone(f,.065,i*.055)); this.vibrate([14,30,14]); }
    if (event==='death') { [440,330,220,110].forEach((f,i)=>this.tone(f,.13,i*.095)); this.vibrate([35,45,70]); }
    if (event==='start') { this.tone(660,.055); this.tone(990,.065,.06); }
    if (event==='win') { [523,659,784,1047,784,1047].forEach((f,i)=>this.tone(f,.14,i*.12)); this.vibrate([30,50,30,50,80]); }
  }
}

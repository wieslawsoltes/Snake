const KEY = 'snake3310.v1';
export const DEFAULTS = Object.freeze({ level: 4, maze: 0, sound: true, haptics: true, backlight: false, ghosting: true, grid: true, contrast: .94, controls: 'keypad', ambient: 1, angle: 0, reflection: true });
export class GameStorage {
  constructor(storage = null) {
    this.storage = storage; this.available = !!storage; this.data = { settings: { ...DEFAULTS }, scores: [], games: 0, session: null };
    try {
      const raw = storage?.getItem(KEY); if (!raw) return;
      const saved = JSON.parse(raw); if (!saved || saved.version !== 1) return;
      const s = saved.settings || {};
      for (const key of ['sound','haptics','backlight','ghosting','grid','reflection']) if (typeof s[key] === 'boolean') this.data.settings[key] = s[key];
      if (Number.isInteger(s.level) && s.level >= 1 && s.level <= 9) this.data.settings.level = s.level;
      if (Number.isInteger(s.maze) && s.maze >= 0 && s.maze <= 5) this.data.settings.maze = s.maze;
      if (Number.isFinite(s.contrast) && s.contrast >= .55 && s.contrast <= 1) this.data.settings.contrast = s.contrast;
      if (['keypad','thumb'].includes(s.controls)) this.data.settings.controls = s.controls;
      if (Number.isFinite(s.ambient) && s.ambient >= .05 && s.ambient <= 1) this.data.settings.ambient=s.ambient;
      if (Number.isFinite(s.angle) && s.angle >= -45 && s.angle <= 45) this.data.settings.angle=s.angle;
      if (Number.isInteger(saved.games) && saved.games >= 0 && saved.games <= 1e9) this.data.games = saved.games;
      if (Array.isArray(saved.scores)) this.data.scores = saved.scores.filter(x => x && Number.isInteger(x.score) && x.score >= 0 && x.score <= 1e9 && Number.isInteger(x.level) && x.level >= 1 && x.level <= 9 && Number.isInteger(x.maze) && x.maze >= 0 && x.maze <= 5 && Number.isFinite(x.date) && x.date > 0).sort((a,b) => b.score-a.score).slice(0,10).map(x => ({ score:x.score, level:x.level, maze:x.maze, date:x.date }));
      if (saved.session && typeof saved.session === 'object') this.data.session = saved.session;
    } catch { this.available = false; }
  }
  get best() { return this.data.scores[0]?.score || 0; }
  save() { try { this.storage?.setItem(KEY, JSON.stringify({ version:1, ...this.data })); } catch { this.available = false; } }
  saveSettings(settings) { this.data.settings = { ...settings }; this.save(); }
  saveSession(game) { this.data.session = game && ['running','paused','ready'].includes(game.status) ? game.snapshot() : null; this.save(); }
  finish(game) {
    this.data.games++;
    this.data.scores.push({ score:game.score, level:game.level, maze:game.maze, date:Date.now() });
    this.data.scores.sort((a,b)=>b.score-a.score || b.date-a.date); this.data.scores.length = Math.min(10,this.data.scores.length);
    this.data.session = null; this.save();
  }
}

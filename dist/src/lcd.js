import { TITLE_ART } from './artwork.js';
import { UI_FONT } from './font.js';
export const LCD_WIDTH = 84, LCD_HEIGHT = 48;
// Hand-drawn 3×5 glyphs. No bitmap fonts or firmware assets are imported.
const glyphs = {
 ' ':['000','000','000','000','000'], A:['010','101','111','101','101'], B:['110','101','110','101','110'],
 C:['011','100','100','100','011'], D:['110','101','101','101','110'], E:['111','100','110','100','111'],
 F:['111','100','110','100','100'], G:['011','100','101','101','011'], H:['101','101','111','101','101'],
 I:['111','010','010','010','111'], J:['001','001','001','101','010'], K:['101','101','110','101','101'],
 L:['100','100','100','100','111'], M:['101','111','111','101','101'], N:['101','111','111','111','101'],
 O:['010','101','101','101','010'], P:['110','101','110','100','100'], Q:['010','101','101','011','001'],
 R:['110','101','110','101','101'], S:['011','100','010','001','110'], T:['111','010','010','010','010'],
 U:['101','101','101','101','111'], V:['101','101','101','101','010'], W:['101','101','111','111','101'],
 X:['101','101','010','101','101'], Y:['101','101','010','010','010'], Z:['111','001','010','100','111'],
 '0':['111','101','101','101','111'], '1':['010','110','010','010','111'], '2':['110','001','111','100','111'],
 '3':['110','001','010','001','110'], '4':['101','101','111','001','001'], '5':['111','100','110','001','110'],
 '6':['011','100','111','101','111'], '7':['111','001','010','010','010'], '8':['111','101','111','101','111'],
 '9':['111','101','111','001','110'], ':':['000','010','000','010','000'], '.':['000','000','000','000','010'],
 '-':['000','000','111','000','000'], '+':['000','010','111','010','000'], '/':['001','001','010','100','100'],
 '>':['100','010','001','010','100'], '<':['001','010','100','010','001'], '?':['110','001','010','000','010'],
 '!':['010','010','010','000','010'], '#':['101','111','101','111','101'], '=':['000','111','000','111','000'],
 '*':['101','010','111','010','101'], '%':['101','001','010','100','101'], '(':['001','010','010','010','001'],
 ')':['100','010','010','010','100'], '_':['000','000','000','000','111']
};
export class LCD {
  constructor() { this.pixels = new Uint32Array(LCD_WIDTH * LCD_HEIGHT); }
  clear() { this.pixels.fill(0); }
  pixel(x, y, on = 1) { if (x >= 0 && x < 84 && y >= 0 && y < 48) this.pixels[(y | 0) * 84 + (x | 0)] = on; }
  rect(x, y, w, h, on = 1) { for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) this.pixel(xx, yy, on); }
  box(x, y, w, h, on = 1) { this.rect(x, y, w, 1, on); this.rect(x, y + h - 1, w, 1, on); this.rect(x, y, 1, h, on); this.rect(x + w - 1, y, 1, h, on); }
  textWidth(text, scale = 1) { return Math.max(0, text.length * 4 - 1) * scale; }
  text(text, x, y, scale = 1, on = 1) {
    for (const ch of String(text).toUpperCase()) {
      const glyph = glyphs[ch] || glyphs['?'];
      for (let yy = 0; yy < 5; yy++) for (let xx = 0; xx < 3; xx++) if (glyph[yy][xx] === '1') this.rect(x + xx * scale, y + yy * scale, scale, scale, on);
      x += 4 * scale;
    }
  }
  center(text, y, scale = 1, on = 1) { this.text(text, Math.floor((84 - this.textWidth(text, scale)) / 2), y, scale, on); }
  heading(text) { this.center(text, 1); this.rect(0, 7, 84, 1); }
  uiTextWidth(value) { return Math.max(0,[...String(value)].reduce((w,ch)=>w+(UI_FONT[ch]||UI_FONT['?'])[0].length+1,0)-1); }
  uiText(value,x,y,on=1) {
    for(const ch of String(value)) {
      const g=UI_FONT[ch]||UI_FONT['?'];
      for(let yy=0;yy<7;yy++)for(let xx=0;xx<g[yy].length;xx++)if(g[yy][xx]==='1')this.pixel(x+xx,y+yy,on);
      x+=g[0].length+1;
    }
  }
  uiCenter(value,y,on=1) { this.uiText(value,Math.floor((84-this.uiTextWidth(value))/2),y,on); }
  snakeCell(cell, head = false, dir = 1) {
    const x = (cell % 28) * 3, y = 8 + Math.floor(cell / 28) * 3;
    this.rect(x, y, 3, 3); this.pixel(x + 1, y + 1, 0);
    if (head) {
      this.pixel(x + 1, y + 1, 1);
      const eyes = [ [[0,0],[2,0]], [[2,0],[2,2]], [[0,2],[2,2]], [[0,0],[0,2]] ][dir];
      for (const e of eyes) this.pixel(x + e[0], y + e[1], 0);
    }
  }
  drawGame(game) {
    this.clear(); const score=String(game.score).padStart(4,'0');
    this.uiText(score,83-this.uiTextWidth(score),0); this.rect(0,7,84,1);
    this.rect(2,1,3,5);this.rect(1,2,5,3);this.pixel(4,0);this.pixel(3,2,0);
    if (game.bonus >= 0) { this.box(28, 1, 30, 5); this.rect(30, 3, Math.ceil(game.bonusTTL / game.bonusDuration * 26), 1); }
    for (let i = 0; i < game.walls.length; i++) if (game.walls[i]) this.rect((i % 28) * 3, 8 + Math.floor(i / 28) * 3, 3, 3);
    for (let i = 0; i < game.length; i++) this.snakeCell(game.segment(i), i === game.length - 1, game.direction);
    if (game.food >= 0) {
      const x = game.food % 28 * 3, y = 8 + Math.floor(game.food / 28) * 3;
      this.rect(x, y + 1, 3, 1); this.rect(x + 1, y, 1, 3);
    }
    if (game.bonus >= 0) {
      const x = game.bonus % 28 * 3, y = 8 + Math.floor(game.bonus / 28) * 3;
      this.rect(x, y, 3, 3); this.pixel(x + 1, y + 1, 0);
      // A single-cell bug, with six tiny legs where there is free LCD space.
      this.pixel(x - 1, y); this.pixel(x + 3, y); this.pixel(x - 1, y + 2); this.pixel(x + 3, y + 2);
    }
  }
  panel(title, line1, line2) {
    this.rect(4, 14, 76, 29, 0); this.box(4, 14, 76, 29); this.box(6, 16, 72, 25);
    this.center(title, 19); if (line1) this.center(line1, 27); if (line2) this.center(line2, 35);
  }
  title(best = 0, canContinue = false) {
    this.clear();
    for(let y=0;y<48;y++)for(let x=0;x<84;x++)if(TITLE_ART[y][x]==='1')this.pixel(x,y);
    // The title card uses all 4,032 LCD dots. Scores and action labels remain outside the lens.
  }
  menu(title, items, selected) {
    this.clear();this.uiCenter(title==='SNAKE II'?'Snake II':title,0);this.rect(0,9,84,1);
    const first=Math.max(0,Math.min(selected-1,items.length-3));
    items.slice(first,first+3).forEach((item,i)=>{
      const active=i+first===selected,y=12+i*10;
      if(active)this.rect(0,y-1,80,9);
      let label=String(item);while(this.uiTextWidth(label)>74)label=label.slice(0,-1);
      this.uiText(label,3,y,active?0:1);
    });
    this.uiCenter('Select',41);
    if(items.length>3){this.rect(83,11,1,27);this.rect(82,11+Math.round(selected/(items.length-1)*22),2,5);}
  }
}

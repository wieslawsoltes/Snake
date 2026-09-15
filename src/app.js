import { SnakeGame, MAZES, createMaze } from './engine.js';
import { LCD } from './lcd.js';
import { LCDRenderer } from './renderer.js';
import { GameStorage } from './storage.js';
import { GameAudio } from './audio.js';

const $ = selector => document.querySelector(selector);
let local = null; try { local=window.localStorage; } catch {}
const store = new GameStorage(local), settings = { ...store.data.settings };
// Respect reduced motion on a first visit without overwriting an explicit stored preference.
try { if (!local?.getItem('snake3310.v1') && matchMedia('(prefers-reduced-motion: reduce)').matches) settings.ghosting = false; } catch {}
const lcd = new LCD(), audio = new GameAudio();
const state = { screen:'title', game:null, menuIndex:0, selectedLevel:settings.level-1, selectedMaze:settings.maze, helpPage:0, accumulator:0, lastTime:0, settleUntil:0, raf:0, dirty:true, boost:new Set(), finished:false, focus:false, lastSavedTick:0, deathTime:0, wakeLock:null, wakeRequest:0, toastTimer:0, fallbackNotice:false };
let renderer;
const hasDialog=()=>!!document.querySelector('dialog[open]');
const announce = text => { $('#announcer').textContent=text; };
function toast(text) { const el=$('#toast'); el.textContent=text; el.hidden=false; clearTimeout(state.toastTimer); state.toastTimer=setTimeout(()=>el.hidden=true,2500); }
function seed() { try { return crypto.getRandomValues(new Uint32Array(1))[0] || 0x3310; } catch { return Date.now()>>>0; } }
function invalidate() { state.dirty=true; state.settleUntil=performance.now()+1100; if (!state.raf) state.raf=requestAnimationFrame(frame); }
function menuItems() { return [...(state.game && ['paused','running'].includes(state.game.status)?['Continue']:[]),'New game',`Level: ${settings.level}`,`Maze: ${settings.maze}`,'Top score','Instructions','Settings']; }
function activeGame() { return state.game && ['running','paused','ready'].includes(state.game.status); }

function draw() {
  const g=state.game;
  if (state.screen==='title') lcd.title(store.best,!!activeGame());
  else if (['playing','paused','gameover'].includes(state.screen) && g) {
    lcd.drawGame(g);
    if (state.screen==='paused') lcd.panel('PAUSED',`SCORE ${g.score}`,'PRESS PLAY >');
    if (state.screen==='gameover') lcd.panel(g.status==='won'?'YOU DID IT!':'GAME OVER',`SCORE ${g.score}`,'PLAY AGAIN >');
  } else if (state.screen==='menu') lcd.menu('SNAKE II',menuItems(),state.menuIndex);
  else if (state.screen==='level') lcd.menu('SPEED LEVEL',Array.from({length:9},(_,i)=>`LEVEL ${i+1}${i+1===settings.level?' *':''}`),state.selectedLevel);
  else if (state.screen==='maze') lcd.menu('CHOOSE MAZE',MAZES.map((m,i)=>`${i} ${m}${i===settings.maze?' *':''}`),state.selectedMaze);
  else if (state.screen==='scores') {
    lcd.clear(); lcd.heading('TOP SCORE'); lcd.center(String(store.best).padStart(4,'0'),14,2); lcd.center(`${store.data.games} GAMES PLAYED`,29); lcd.center('BACK >',41);
  } else if (state.screen==='instructions') {
    lcd.clear(); lcd.heading(`HOW TO PLAY ${state.helpPage+1}/3`);
    const pages=[['2 UP  8 DOWN','4 LEFT  6 RIGHT','EAT + AND GROW','DO NOT BITE YOU!'],['EDGES WRAP','MAZE WALLS HURT','EVERY 5: A BONUS','CATCH IT QUICKLY'],['0 PAUSES THE GAME','HOLD 5 FOR BOOST','SWIPE TO STEER','SELECT TO RETURN']];
    pages[state.helpPage].forEach((s,i)=>lcd.center(s,11+i*8));
  }
  renderer?.upload(lcd.pixels);
  updateHUD();
}
function updateHUD() {
  const g=state.game, active=activeGame();
  $('#best-score').textContent=String(Math.max(store.best,g?.score||0)).padStart(4,'0');
  $('#best-caption').textContent=store.best>0?'Your next target. You’ve got this.':'Every legend starts at zero.';
  $('#level-label').textContent=`${String(active?g.level:settings.level).padStart(2,'0')} / 09`;
  $('#maze-label').textContent=MAZES[active?g.maze:settings.maze];
  $('#sound-label').textContent=settings.sound?'On':'Off';
  let text='Ready when you are', action='Play';
  if (state.screen==='playing') { text=`${g.score} points · ${g.length} long`; action='Pause'; }
  else if (state.screen==='paused') { text='Paused. Take your time.'; action='Continue'; }
  else if (state.screen==='gameover') { text=g.status==='won'?'A full screen. Incredible.':'One more game?'; action='Again'; }
  else if (state.screen==='title' && active) { text='Your saved game is here.'; action='Continue'; }
  else if (['menu','level','maze'].includes(state.screen)) { text='Choose with 2 / 8'; action='Select'; }
  else if (state.screen==='instructions') { text='A little refresher'; action=state.helpPage<2?'Next':'Back'; }
  else if (state.screen==='scores') { text='Your personal best'; action='Back'; }
  $('#game-status').replaceChildren(Object.assign(document.createElement('i'),{ariaHidden:'true'}),document.createTextNode(text));
  $('#softkey-label').textContent=action; $('#select-button').setAttribute('aria-label',`${action} Snake`);
  $('#start-label').textContent=active?(state.screen==='playing'?'Pause game':'Continue game'):'Let’s play';
  renderer?.canvas.setAttribute('aria-label',`Snake II. ${text}${g?`. Level ${g.level}, ${MAZES[g.maze]}.`:'.'}`);
  document.body.dataset.gameState=state.screen;
}
function frame(now) {
  state.raf=0;
  const elapsed=state.lastTime?now-state.lastTime:16.67; state.lastTime=now;
  if (state.screen==='playing' && state.game?.status==='running' && !hasDialog()) {
    if (elapsed>1200) pause('Paused after an interruption.');
    else {
      state.accumulator+=Math.min(elapsed,200);
      const interval=state.game.interval/(state.boost.size?2:1);
      let ticks=0;
      while (state.accumulator>=interval && ticks<4 && state.game.status==='running') {
        state.accumulator-=interval; ticks++;
        const event=state.game.step(); state.dirty=true; state.settleUntil=now+1100;
        if (event!=='none') {
          audio.play(event);
          if (event==='food'||event==='bonus') {
            announce(`${event==='bonus'?'Bonus. ':''}${state.game.score} points.`);
            store.saveSession(state.game); state.lastSavedTick=state.game.ticks;
          }
          if (event==='death'||event==='win') finish();
        }
      }
      if (ticks===4) state.accumulator=0;
    }
  }
  if (state.dirty) { draw(); state.dirty=false; }
  if (now<=state.settleUntil || state.screen==='playing') renderer?.draw(Math.min(elapsed/1000,.1),settings);
  if (!document.hidden && (state.screen==='playing'||now<state.settleUntil)) state.raf=requestAnimationFrame(frame);
  else state.lastTime=0;
}
async function keepAwake() {
  if (!navigator.wakeLock || document.hidden || state.game?.status!=='running' || state.wakeLock) return;
  const request=++state.wakeRequest;
  try { const lock=await navigator.wakeLock.request('screen'); if (request!==state.wakeRequest||state.game?.status!=='running') { await lock.release(); return; } state.wakeLock=lock; lock.addEventListener('release',()=>{if(state.wakeLock===lock)state.wakeLock=null;}); } catch {}
}
function releaseAwake() { state.wakeRequest++; if (state.wakeLock) { state.wakeLock.release().catch(()=>{}); state.wakeLock=null; } }
function startGame() {
  closeDialogs();
  state.game=new SnakeGame({level:settings.level,maze:settings.maze,seed:seed()});
  state.finished=false; state.accumulator=0; state.lastTime=0; state.boost.clear(); state.lastSavedTick=0;
  state.game.start(); state.screen='playing'; store.saveSession(state.game);
  $('#screen-wrap').focus({preventScroll:true});
  audio.unlock().then(()=>audio.play('start')); keepAwake(); announce(`Game started. Level ${settings.level}. ${MAZES[settings.maze]}.`); invalidate();
}
function play() {
  if (hasDialog()) return;
  if (activeGame()) {
    state.game.start(); state.screen='playing'; state.accumulator=0; state.lastTime=0;
    $('#screen-wrap').focus({preventScroll:true}); audio.unlock(); keepAwake(); announce('Game resumed.'); invalidate();
  } else startGame();
}
function pause(message='Paused.') {
  if (state.game?.status==='running') {
    state.game.pause(); state.screen='paused'; state.boost.clear(); state.accumulator=0;
    store.saveSession(state.game); releaseAwake(); announce(message); invalidate();
  }
}
function togglePause() {
  if (state.screen==='playing') pause();
  else if (['title','paused','gameover'].includes(state.screen)) play();
  else select();
}
function finish() {
  if (state.finished) return; state.finished=true; state.screen='gameover'; state.boost.clear(); state.deathTime=performance.now();
  const previous=store.best; store.finish(state.game); releaseAwake();
  announce(`${state.game.status==='won'?'You filled the board!':'Game over.'} Score ${state.game.score}.${state.game.score>previous?' A new personal best!':''}`);
}
function openMenu() {
  if (state.screen==='playing') pause();
  state.screen='menu'; state.menuIndex=0; audio.key(); invalidate();
}
function back() {
  if (hasDialog()) { document.querySelector('dialog[open]').close(); return; }
  if (state.screen==='playing'||state.screen==='paused'||state.screen==='gameover'||state.screen==='title') openMenu();
  else if (state.screen==='menu') { state.screen=activeGame()?'paused':'title'; invalidate(); }
  else { state.screen='menu'; state.menuIndex=0; invalidate(); }
}
function navigate(delta) {
  if (hasDialog()) return;
  if (state.screen==='title') { openMenu(); return; }
  if (state.screen==='menu') state.menuIndex=(state.menuIndex+delta+menuItems().length)%menuItems().length;
  else if (state.screen==='level') state.selectedLevel=(state.selectedLevel+delta+9)%9;
  else if (state.screen==='maze') state.selectedMaze=(state.selectedMaze+delta+6)%6;
  else if (state.screen==='instructions') state.helpPage=(state.helpPage+delta+3)%3;
  else if (state.screen==='playing') { steer(delta<0?0:2); return; }
  else { openMenu(); return; }
  audio.key(); invalidate();
}
function select() {
  if (hasDialog()) return;
  audio.unlock();
  if (state.screen==='playing') { pause(); return; }
  if (['title','paused','gameover'].includes(state.screen)) { play(); return; }
  if (state.screen==='menu') {
    const item=menuItems()[state.menuIndex];
    if (item==='Continue') play();
    else if (item==='New game') requestNewGame();
    else if (item.startsWith('Level:')) { state.screen='level'; state.selectedLevel=settings.level-1; }
    else if (item.startsWith('Maze:')) { state.screen='maze'; state.selectedMaze=settings.maze; }
    else if (item==='Top score') state.screen='scores';
    else if (item==='Instructions') { state.screen='instructions'; state.helpPage=0; }
    else openDialog('settings-dialog');
  } else if (state.screen==='level') { settings.level=state.selectedLevel+1; applySettings(); state.screen='menu'; }
  else if (state.screen==='maze') { settings.maze=state.selectedMaze; applySettings(); state.screen='menu'; }
  else if (state.screen==='instructions' && state.helpPage<2) state.helpPage++;
  else { state.screen='menu'; state.menuIndex=0; }
  invalidate();
}
function steer(direction) {
  if (hasDialog()) return;
  audio.unlock();
  if (['menu','level','maze','instructions'].includes(state.screen)) { if (direction===0||direction===2) navigate(direction===0?-1:1); else if (direction===1) select(); else back(); return; }
  if (state.screen==='scores') { back(); return; }
  if (state.screen==='gameover' && performance.now()-state.deathTime<400) return;
  if (state.screen!=='playing') play();
  if (state.game?.queueTurn(direction)) { audio.key(); invalidate(); }
}
function requestNewGame() { if (activeGame() && state.game.ticks>0) openDialog('restart-dialog'); else startGame(); }
function openDialog(id) {
  pause(); state.boost.clear();
  if (id==='scores-dialog') renderScores();
  if (id==='settings-dialog') syncSettingsUI();
  const dialog=$(`#${id}`); if (!dialog.open) dialog.showModal();
}
function closeDialogs() { document.querySelectorAll('dialog[open]').forEach(d=>d.close()); }
function syncSettingsUI() {
  $('#level-range').value=settings.level; $('#level-output').value=`${settings.level} / 9`;
  $('#contrast-range').value=Math.round(settings.contrast*100); $('#contrast-output').value=`${Math.round(settings.contrast*100)}%`;
  for (const key of ['sound','haptics','backlight','ghosting','grid','reflection']) $(`#${key}-toggle`).checked=settings[key];
  $('#angle-range').value=settings.angle; $('#angle-output').value=`${settings.angle}°`;
  $('#ambient-range').value=Math.round(settings.ambient*100); $('#ambient-output').value=`${Math.round(settings.ambient*100)}%`;
  document.querySelectorAll('[data-lighting]').forEach(button=>{
    const preset=button.dataset.lighting;
    const active=preset==='daylight'?!settings.backlight&&settings.ambient===1:preset==='night'?settings.backlight&&settings.ambient===.08:settings.backlight&&settings.ambient===.7;
    button.setAttribute('aria-pressed',String(active));
  });
  document.querySelectorAll('[data-control]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.control===settings.controls)));
  document.querySelectorAll('[data-maze]').forEach(b=>b.setAttribute('aria-pressed',String(Number(b.dataset.maze)===settings.maze)));
}
function applySettings(save=true) {
  audio.enabled=settings.sound; audio.haptics=settings.haptics;
  document.body.dataset.backlight=settings.backlight?'on':'off';
  document.documentElement.style.setProperty('--case-light',String(.42+.58*Math.sqrt(settings.ambient)));
  document.body.classList.toggle('thumb-mode',settings.controls==='thumb');
  $('#control-switch').setAttribute('aria-pressed',String(settings.controls==='thumb'));
  $('#control-switch').innerHTML=settings.controls==='thumb'?'Classic keypad <span>↗</span>':'Thumb controls <span>↗</span>';
  $('#sound-button use').setAttribute('href',settings.sound?'#i-sound':'#i-mute');
  $('#sound-button').setAttribute('aria-label',settings.sound?'Mute sound':'Enable sound');
  if (save) store.saveSettings(settings);
  syncSettingsUI(); if (renderer) renderer.resize(); invalidate();
}
function toggleSound() { settings.sound=!settings.sound; applySettings(); if(settings.sound)audio.unlock().then(()=>audio.key()); toast(`Sound ${settings.sound?'on':'off'}`); }
function toggleFocus() {
  state.focus=!state.focus; document.body.classList.toggle('focus-mode',state.focus);
  $('#focus-button').setAttribute('aria-pressed',String(state.focus)); $('#focus-button').setAttribute('aria-label',state.focus?'Exit focus mode':'Enter focus mode');
  renderer?.resize(); invalidate();
}
function renderScores() {
  const list=$('#score-list'); list.replaceChildren();
  if (!store.data.scores.length) { const p=document.createElement('p'); p.className='score-empty'; p.textContent='No scores yet. Your first game is calling.'; list.append(p); }
  for (const [i,run] of store.data.scores.entries()) {
    const row=document.createElement('div'); row.className='score-entry';
    const rank=document.createElement('span'); rank.className='score-rank'; rank.textContent=String(i+1).padStart(2,'0');
    const score=document.createElement('span'); score.className='score-value'; score.textContent=String(run.score).padStart(4,'0');
    const details=document.createElement('span'); details.className='score-details'; details.append(document.createTextNode(`Level ${run.level} · ${MAZES[run.maze]}`),document.createElement('br'),document.createTextNode(new Date(run.date).toLocaleDateString(undefined,{day:'numeric',month:'short'})));
    row.append(rank,score,details); list.append(row);
  }
  $('#total-runs').textContent=`${store.data.games} ${store.data.games===1?'game':'games'} played`;
}
function buildMazes() {
  const root=$('#maze-grid');
  for (let m=0;m<MAZES.length;m++) {
    const button=document.createElement('button'); button.className='maze-option'; button.dataset.maze=m;
    button.setAttribute('aria-label',`Maze ${m}: ${MAZES[m]}`);
    const cells=createMaze(m), ns='http://www.w3.org/2000/svg';
    const svg=document.createElementNS(ns,'svg'); svg.setAttribute('viewBox','0 0 28 13'); svg.setAttribute('aria-hidden','true');
    if (!m) {
      const path=document.createElementNS(ns,'path'); path.setAttribute('d','M3 6h8v-3h5v6h7v-1h-6v-6h-7v3H3z'); svg.append(path);
    }
    for (let i=0;i<cells.length;i++) if(cells[i]) { const r=document.createElementNS(ns,'rect'); r.setAttribute('x',i%28); r.setAttribute('y',Math.floor(i/28)); r.setAttribute('width',1); r.setAttribute('height',1); svg.append(r); }
    button.append(svg,document.createTextNode(MAZES[m])); button.addEventListener('click',()=>{settings.maze=m;applySettings();}); root.append(button);
  }
}
/** Pointerdown latency, pointer capture, cancellation, and keyboard-generated clicks. */
function bindPress(button, action, release=null) {
  const held=new Set();
  button.addEventListener('pointerdown',e=>{
    if (e.button!==0) return; e.preventDefault();
    held.add(e.pointerId); button.classList.add('pressed');
    try{button.setPointerCapture(e.pointerId);}catch{}
    action(e.pointerId);
  });
  const up=e=>{if(!held.delete(e.pointerId))return; if(!held.size)button.classList.remove('pressed'); release?.(e.pointerId);};
  for(const name of ['pointerup','pointercancel','lostpointercapture'])button.addEventListener(name,up);
  // Touch-generated click events may report detail=0; only non-pointer clicks are keyboard/AT activation.
  button.addEventListener('click',e=>{if(e.detail===0&&!e.pointerType){action('keyboard-click');release?.('keyboard-click');}});
}
function bindInputs() {
  document.querySelectorAll('[data-dir]').forEach(button=>bindPress(button,()=>steer(Number(button.dataset.dir))));
  document.querySelectorAll('[data-boost]').forEach(button=>bindPress(button,id=>{
    if(hasDialog())return; if(state.screen==='title'||state.screen==='paused')play();
    if(state.screen==='playing'){state.boost.add(`p${id}`);audio.unlock();invalidate();}
  },id=>state.boost.delete(`p${id}`)));
  document.querySelectorAll('[data-nav]').forEach(b=>bindPress(b,()=>navigate(b.dataset.nav==='up'?-1:1)));
  document.querySelectorAll('[data-action="pause"]').forEach(b=>bindPress(b,togglePause));
  document.querySelectorAll('[data-key]').forEach(b=>bindPress(b,()=>{
    const key=b.dataset.key;
    if(key==='0')togglePause(); else if(key==='*')toggleSound(); else if(key==='#')toggleFocus();
    else if(key==='3')openDialog('settings-dialog'); else if(key==='7')openDialog('scores-dialog');
    else if(key==='9'){settings.backlight=!settings.backlight;applySettings();}
    else if(key==='1'){pause();state.screen='instructions';state.helpPage=0;invalidate();}
  }));
  bindPress($('#power-button'),()=>{settings.backlight=!settings.backlight;applySettings();});
  bindPress($('#select-button'),select); bindPress($('#back-button'),back);
  $('#new-game-button').addEventListener('click',()=>state.screen==='playing'?pause():play());
  $('#settings-button').addEventListener('click',()=>openDialog('settings-dialog')); $('#tune-button').addEventListener('click',()=>openDialog('settings-dialog'));
  $('#sound-button').addEventListener('click',toggleSound); $('#focus-button').addEventListener('click',toggleFocus);
  $('#scores-button').addEventListener('click',()=>openDialog('scores-dialog')); $('#about-button').addEventListener('click',()=>openDialog('about-dialog'));
  $('#control-switch').addEventListener('click',()=>{settings.controls=settings.controls==='thumb'?'keypad':'thumb';applySettings();});
  $('#focus-menu').addEventListener('click',openMenu); $('#leave-focus').addEventListener('click',toggleFocus);
  $('#confirm-restart').addEventListener('click',startGame);
  document.querySelectorAll('[data-close]').forEach(b=>b.addEventListener('click',()=>b.closest('dialog').close()));
  document.querySelectorAll('dialog').forEach(d=>{
    d.addEventListener('click',e=>{if(e.target!==d)return;const r=d.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)d.close();});
    d.addEventListener('close',()=>{state.lastTime=0;if(!hasDialog())$('#screen-wrap').focus({preventScroll:true});invalidate();});
  });
  $('#fullscreen-button').addEventListener('click',async()=>{
    closeDialogs();if(!state.focus)toggleFocus();
    try{if(document.fullscreenElement)await document.exitFullscreen();else if(document.documentElement.requestFullscreen)await document.documentElement.requestFullscreen();else toast('Focus mode is ready. Fullscreen isn’t available here.');}catch{toast('Focus mode is ready. Fullscreen was not available.');}
  });
  $('#angle-range').addEventListener('input',e=>{settings.angle=Number(e.target.value);applySettings();});
  $('#ambient-range').addEventListener('input',e=>{settings.ambient=Number(e.target.value)/100;applySettings();});
  document.querySelectorAll('[data-lighting]').forEach(b=>b.addEventListener('click',()=>{
    const preset=b.dataset.lighting;
    settings.backlight=preset!=='daylight';settings.ambient=preset==='daylight'?1:preset==='night'?.08:.7;
    settings.angle=0;applySettings();
  }));
  $('#level-range').addEventListener('input',e=>{settings.level=Number(e.target.value);applySettings();});
  $('#contrast-range').addEventListener('input',e=>{settings.contrast=Number(e.target.value)/100;applySettings();});
  for(const key of ['sound','haptics','backlight','ghosting','grid','reflection'])$(`#${key}-toggle`).addEventListener('change',e=>{settings[key]=e.target.checked;applySettings();if(key==='sound'&&settings.sound)audio.unlock();});
  document.querySelectorAll('[data-control]').forEach(b=>b.addEventListener('click',()=>{settings.controls=b.dataset.control;applySettings();}));
  const keyDirection={ArrowUp:0,ArrowRight:1,ArrowDown:2,ArrowLeft:3,w:0,d:1,s:2,a:3,'2':0,'6':1,'8':2,'4':3};
  document.addEventListener('keydown',e=>{
    if(e.ctrlKey||e.metaKey||e.altKey||e.isComposing||hasDialog())return;
    if(e.target.closest?.('input,textarea,select,[contenteditable=true]'))return;
    const key=e.key.length===1?e.key.toLowerCase():e.key;
    if((key==='Enter'||key===' ')&&e.target.closest?.('button,a'))return;
    if(keyDirection[key]!==undefined){e.preventDefault();if(!e.repeat)steer(keyDirection[key]);}
    else if(key==='5'){e.preventDefault();if(!e.repeat){if(state.screen==='title'||state.screen==='paused')play();if(state.screen==='playing')state.boost.add('key5');}}
    else if(['Enter',' ','Escape','0','p','m','f'].includes(key)){
      e.preventDefault();if(e.repeat)return;
      if(key==='Enter')select();else if(key===' '||key==='0'||key==='p')togglePause();else if(key==='Escape')back();else if(key==='m')toggleSound();else toggleFocus();
    }
  });
  document.addEventListener('keyup',e=>{if(e.key==='5')state.boost.delete('key5');});
  // Continuous swipes support more than one corner without lifting a thumb.
  let gesture=null;
  const surface=$('#screen-wrap');
  surface.addEventListener('pointerdown',e=>{
    if(e.button!==0||gesture)return;e.preventDefault();surface.focus({preventScroll:true});
    gesture={id:e.pointerId,x:e.clientX,y:e.clientY,startX:e.clientX,startY:e.clientY,turned:false,time:performance.now()};
    try{surface.setPointerCapture(e.pointerId);}catch{}
  });
  surface.addEventListener('pointermove',e=>{
    if(!gesture||e.pointerId!==gesture.id)return;
    const dx=e.clientX-gesture.x,dy=e.clientY-gesture.y;
    if(Math.max(Math.abs(dx),Math.abs(dy))<16)return;
    const direction=Math.abs(dx)>Math.abs(dy)?(dx>0?1:3):(dy>0?2:0);
    steer(direction);gesture.x=e.clientX;gesture.y=e.clientY;gesture.turned=true;
  });
  surface.addEventListener('pointerup',e=>{
    if(!gesture||e.pointerId!==gesture.id)return;
    if(!gesture.turned&&Math.hypot(e.clientX-gesture.startX,e.clientY-gesture.startY)<16&&performance.now()-gesture.time<450)togglePause();
    gesture=null;
  });
  for(const name of ['pointercancel','lostpointercapture'])surface.addEventListener(name,()=>gesture=null);
  surface.addEventListener('contextmenu',e=>e.preventDefault());
  window.addEventListener('blur',()=>{state.boost.clear();gesture=null;pause('Paused because the window lost focus.');});
  document.addEventListener('visibilitychange',()=>{if(document.hidden){pause('Paused while away.');state.boost.clear();releaseAwake();}else{state.lastTime=0;invalidate();}});
  window.addEventListener('pagehide',()=>{pause();store.saveSession(state.game);releaseAwake();});
  window.addEventListener('pageshow',()=>{state.lastTime=0;invalidate();});
  document.addEventListener('fullscreenchange',()=>{renderer?.resize();invalidate();});
  window.addEventListener('resize',()=>{renderer?.resize();invalidate();});
  new ResizeObserver(()=>{renderer?.resize();invalidate();}).observe(surface);
}

async function initialize() {
  buildMazes(); bindInputs(); applySettings(false);
  if(store.data.session){try{state.game=SnakeGame.restore(store.data.session);}catch{store.data.session=null;store.save();}}
  renderer=new LCDRenderer($('#lcd'),(name,reason)=>{
    $('#renderer-badge b').textContent=name;
    $('#renderer-badge').title=reason||'Real WebGPU compute + rendering';
    $('#renderer-info').textContent=`${name} · 84 × 48 one-bit LCD · reflective optics · 28 × 13 cells${reason?`\n${reason}`:'\nGPU asymmetric response + polarizer, lens, matrix and edge lighting'}`;
    invalidate();
  });
  await renderer.init(new URLSearchParams(location.search).get('renderer')==='canvas');
  if(!store.available)toast('Browser storage is unavailable. This session still works.');
  invalidate();
  // Opt-in, read-only diagnostic hook for reproducible browser validation.
  if(new URLSearchParams(location.search).has('debug'))Object.defineProperty(window,'__snake',{value:{
    inspect:()=>({version:'2.0.0',screen:state.screen,renderer:renderer.name,reason:renderer.reason,settings:{...settings},game:state.game?.snapshot(),gameStatus:state.game?.status,turnCount:state.game?.turnCount,boost:state.boost.size,frames:renderer.backend?.frames,finished:state.finished,canvas:{width:renderer.canvas.width,height:renderer.canvas.height}})
  },configurable:false});
  if('serviceWorker'in navigator&&isSecureContext&&location.protocol!=='file:'&&!new URLSearchParams(location.search).has('nosw')){
    try{await navigator.serviceWorker.register('./sw.js');}catch(error){console.info('Offline caching unavailable:',error.message);}
  }
}
initialize().catch(error=>{
  console.error(error);announce('Unable to initialize the game.');
  $('#game-status').textContent='Could not initialize. Reload to try again.';
  toast(`Could not initialize: ${error.message}`);
});

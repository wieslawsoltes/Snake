import test from 'node:test';
import assert from 'node:assert/strict';
import { SnakeGame, COLS, ROWS, CAPACITY, SPEEDS, MAZES, createMaze } from '../src/engine.js';
import { LCD } from '../src/lcd.js';
import { GameStorage, DEFAULTS } from '../src/storage.js';
const at=(x,y)=>y*COLS+x;
function setup(body,{direction=1,food=at(20,10),bonus=-1,growth=0}={}){
  const g=new SnakeGame();g.body.fill(0);g.occupied.fill(0);g.tail=0;g.length=body.length;
  body.forEach((p,i)=>{g.body[i]=p;g.occupied[p]=1;});
  Object.assign(g,{direction,food,bonus,growth,status:'running',bonusTTL:bonus<0?0:20});return g;
}
function invariants(g){
  assert(g.length>=2&&g.length<=CAPACITY);
  const b=Array.from({length:g.length},(_,i)=>g.segment(i));assert.equal(new Set(b).size,b.length);
  assert.equal(g.occupied.reduce((a,b)=>a+b,0),g.length);
  for(const c of b){assert.equal(g.occupied[c],1);assert.equal(g.walls[c],0);}
  for(const c of [g.food,g.bonus])if(c>=0){assert.equal(g.occupied[c],0);assert.equal(g.walls[c],0);}
  if(g.food>=0)assert.notEqual(g.food,g.bonus);
}
test('board is exactly 28×13 = 364 cells',()=>{assert.equal(COLS,28);assert.equal(ROWS,13);assert.equal(CAPACITY,364);});
test('84×48 LCD is a 4032-pixel monochrome framebuffer',()=>{const l=new LCD();assert.equal(l.pixels.length,4032);assert(l.pixels.every(v=>v===0));});
test('all nine speed levels strictly increase speed',()=>{assert.equal(SPEEDS.length,9);for(let i=1;i<9;i++)assert(SPEEDS[i]<SPEEDS[i-1]);});
test('bad level and maze values are rejected',()=>{for(const level of [0,10,-1,1.5,NaN,'4'])assert.throws(()=>new SnakeGame({level}));for(const maze of [-1,6,NaN,'0'])assert.throws(()=>new SnakeGame({maze}));});
for(let maze=0;maze<6;maze++)test(`maze ${maze}: safe spawn and reachable food (${MAZES[maze]})`,()=>{
 const g=new SnakeGame({maze});invariants(g);g.start();for(let i=0;i<5;i++)g.step();assert.equal(g.status,'running');assert.equal(g.eaten,1);
 const visited=new Set([g.head]),queue=[g.head];for(let i=0;i<queue.length;i++){const c=queue[i],x=c%28,y=Math.floor(c/28);for(const n of [at((x+1)%28,y),at((x+27)%28,y),at(x,(y+1)%13),at(x,(y+12)%13)])if(!g.walls[n]&&!visited.has(n)){visited.add(n);queue.push(n);}}
 assert.equal(visited.size,CAPACITY-g.walls.reduce((a,b)=>a+b,0),'maze must not have inaccessible pockets');
});
test('non-running games do not advance',()=>{const g=new SnakeGame();let s=g.snapshot();assert.equal(g.step(),'none');assert.deepEqual(g.snapshot(),s);g.start();g.pause();s=g.snapshot();g.step();assert.deepEqual(g.snapshot(),s);});
test('movement preserves length without food',()=>{const g=new SnakeGame();g.start();const head=g.head;g.step();assert.equal(g.head,head+1);assert.equal(g.length,5);invariants(g);});
test('horizontal wrap crosses the right edge',()=>{const g=setup([at(25,5),at(26,5),at(27,5)]);g.step();assert.equal(g.head,at(0,5));invariants(g);});
test('horizontal wrap crosses the left edge',()=>{const g=setup([at(2,5),at(1,5),at(0,5)],{direction:3});g.step();assert.equal(g.head,at(27,5));invariants(g);});
test('vertical wrap crosses the top edge',()=>{const g=setup([at(8,2),at(8,1),at(8,0)],{direction:0});g.step();assert.equal(g.head,at(8,12));invariants(g);});
test('vertical wrap crosses the bottom edge',()=>{const g=setup([at(8,10),at(8,11),at(8,12)],{direction:2});g.step();assert.equal(g.head,at(8,0));invariants(g);});
test('direct reversal and duplicate heading are ignored',()=>{const g=new SnakeGame();assert.equal(g.queueTurn(3),false);assert.equal(g.queueTurn(1),false);assert.equal(g.turnCount,0);});
test('two rapid corners are buffered, one per tick',()=>{const g=new SnakeGame();g.start();assert(g.queueTurn(0));assert(g.queueTurn(3));assert.equal(g.queueTurn(2),false);g.step();assert.equal(g.direction,0);assert.equal(g.turnCount,1);g.step();assert.equal(g.direction,3);assert.equal(g.turnCount,0);});
test('reversal is rejected against queued heading, not old heading',()=>{const g=new SnakeGame();assert(g.queueTurn(0));assert.equal(g.queueTurn(2),false);assert(g.queueTurn(3));});
test('out of range turn input is rejected',()=>{const g=new SnakeGame();for(const x of [-1,4,NaN,Infinity,'2',null])assert.equal(g.queueTurn(x),false);});
test('food grows by one and scores exactly the selected level',()=>{const g=new SnakeGame({level:7});g.food=g.head+1;g.start();assert.equal(g.step(),'food');assert.equal(g.length,6);assert.equal(g.score,7);assert.equal(g.eaten,1);invariants(g);});
test('walls are fatal and do not corrupt the body',()=>{const g=new SnakeGame({maze:1});g.food=at(4,2);g.start();let event;for(let i=0;i<30&&g.status==='running';i++)event=g.step();assert.equal(event,'death');assert.equal(g.status,'over');invariants(g);});
test('a non-tail self collision is fatal',()=>{const g=setup([at(0,1),at(1,1),at(2,1),at(3,1),at(3,2),at(2,2),at(1,2)],{direction:3});g.queueTurn(0);assert.equal(g.step(),'death');assert.equal(g.deathCell,at(1,1));invariants(g);});
test('moving into a vacating tail is legal',()=>{const g=setup([at(1,1),at(2,1),at(2,2),at(1,2)],{direction:3});g.queueTurn(0);assert.equal(g.step(),'none');assert.equal(g.head,at(1,1));assert.equal(g.length,4);invariants(g);});
test('moving into a growing/non-vacating tail is fatal',()=>{const g=setup([at(1,1),at(2,1),at(2,2),at(1,2)],{direction:3,growth:1});g.queueTurn(0);assert.equal(g.step(),'death');invariants(g);});
test('a bonus spawns on the fifth ordinary food',()=>{const g=new SnakeGame();g.eaten=4;g.food=g.head+1;g.start();g.step();assert(g.bonus>=0);assert.equal(g.bonusTTL,29);invariants(g);});
test('bonus score depends on remaining ticks and grows over three ticks',()=>{const g=setup([at(6,6),at(7,6),at(8,6)],{bonus:at(9,6)});assert.equal(g.step(),'bonus');assert.equal(g.score,g.level*20);assert.equal(g.length,4);assert.equal(g.growth,2);g.step();g.step();assert.equal(g.length,6);assert.equal(g.growth,0);invariants(g);});
test('expired bonus disappears without affecting score',()=>{const g=new SnakeGame();g.bonus=at(20,2);g.bonusTTL=1;g.start();g.step();assert.equal(g.bonus,-1);assert.equal(g.bonusTTL,0);assert.equal(g.score,0);});
test('pause freezes the bonus timer',()=>{const g=new SnakeGame();g.bonus=at(20,2);g.bonusTTL=20;g.start();g.pause();g.step();assert.equal(g.bonusTTL,20);});
test('free-cell selection never places food in snake, wall or exclusion',()=>{const g=new SnakeGame({maze:5});for(let i=0;i<1000;i++){const p=g.findFree(g.food);assert(p>=0);assert.equal(g.walls[p],0);assert.equal(g.occupied[p],0);assert.notEqual(p,g.food);}});
test('full board terminates with a win and no food',()=>{
 const body=[];for(let y=0;y<13;y++)for(let x=0;x<28;x++)body.push(at(y%2?27-x:x,y));
 const final=body.pop(),g=setup(body,{food:final});assert.equal(g.length,363);assert.equal(g.step(),'win');assert.equal(g.length,364);assert.equal(g.freeCount,0);assert.equal(g.food,-1);assert.equal(g.status,'won');invariants(g);
});
test('findFree terminates immediately on a full board',()=>{const g=new SnakeGame();g.occupied.fill(1);assert.equal(g.findFree(),-1);});
test('snapshot round trip is exact and always resumes paused',()=>{const g=new SnakeGame({level:7,maze:3,seed:9981});g.start();g.queueTurn(0);g.step();const saved=g.snapshot(),restored=SnakeGame.restore(saved);assert.equal(restored.status,'paused');assert.deepEqual(restored.snapshot(),saved);invariants(restored);});
test('seeded simulations have identical trajectories and food',()=>{
 const a=new SnakeGame({seed:101}),b=new SnakeGame({seed:101});a.start();b.start();for(let i=0;i<100;i++){if(i%8===0){a.queueTurn(i%16?2:0);b.queueTurn(i%16?2:0);}a.step();b.step();assert.deepEqual(a.snapshot(),b.snapshot());}
});
test('saved RNG preserves subsequent spawns',()=>{const a=new SnakeGame({seed:219}),b=SnakeGame.restore(a.snapshot());for(let i=0;i<100;i++)assert.equal(a.findFree(),b.findFree());});
test('corrupt saved games are rejected',()=>{
 const base=new SnakeGame().snapshot();
 for(const change of [{version:99},{body:[]},{direction:4},{food:999},{score:-1},{rng:0},{level:0},{maze:6},{bonus:30,bonusTTL:0},{bonus:-1,bonusTTL:2},{body:[1,1,2]},{body:[1,2,10]},{direction:3}])assert.throws(()=>SnakeGame.restore({...base,...change}));
 assert.throws(()=>SnakeGame.restore(null));
});
test('food cannot be restored onto the snake',()=>{const s=new SnakeGame().snapshot();s.food=s.body[0];assert.throws(()=>SnakeGame.restore(s));});
test('ring deque survives thousands of wrapped updates',()=>{
 const g=new SnakeGame();g.start();g.food=at(10,10);for(let i=0;i<10000;i++){assert.equal(g.step(),'none');assert.equal(g.status,'running');if(i%71===0)invariants(g);}assert.equal(g.length,5);
});
test('randomized input maintains all occupancy invariants',()=>{
 let r=0xdeadbeef;const rand=()=>{r^=r<<13;r^=r>>>17;r^=r<<5;return r>>>0;};
 for(let round=0;round<250;round++){
  const g=new SnakeGame({maze:round%6,level:round%9+1,seed:rand()});g.start();
  for(let i=0;i<500&&g.status==='running';i++){if(rand()%3===0)g.queueTurn(rand()%4);if(rand()%8===0)g.queueTurn(rand()%4);g.step();invariants(g);}
 }
});
test('pixel operations clip correctly without expanding the buffer',()=>{const l=new LCD();l.rect(-10,-10,20,20);l.rect(80,44,20,20);assert.equal(l.pixels.reduce((a,b)=>a+b,0),116);assert.equal(l.pixels.length,4032);});
test('all LCD screens remain monochrome and in bounds',()=>{
 const l=new LCD(),g=new SnakeGame();
 for(const fn of [()=>l.title(2008),()=>l.drawGame(g),()=>l.panel('PAUSED','SCORE 10','PRESS PLAY >'),()=>l.menu('SNAKE II',['NEW GAME','LEVEL 4','TOP SCORE'],0)]){fn();assert(l.pixels.every(v=>v===0||v===1));assert.equal(l.pixels.length,4032);}
});
test('storage works when unavailable',()=>{const s=new GameStorage();s.saveSettings(DEFAULTS);s.saveSession(new SnakeGame());s.finish(new SnakeGame());assert.equal(s.data.games,1);assert.equal(s.best,0);});
test('storage tolerates denied access and quota errors',()=>{const s=new GameStorage({getItem(){throw Error('Denied');},setItem(){throw Error('Quota');}});assert.equal(s.available,false);assert.doesNotThrow(()=>s.save());});
test('storage sanitizes corrupt settings and scoreboard entries',()=>{
 const s=new GameStorage({getItem:()=>JSON.stringify({version:1,settings:{level:900,maze:-1,contrast:NaN,sound:'yes',controls:'bad'},scores:[{score:'100',level:1,maze:0,date:1},{score:20,level:3,maze:2,date:1}],games:-1}),setItem(){}});
 assert.deepEqual(s.data.settings,DEFAULTS);assert.equal(s.best,20);assert.equal(s.data.games,0);
});
test('top ten scores sort descending and persist after reopening',()=>{
 let data=null;const mem={getItem:()=>data,setItem:(key,value)=>data=value};const s=new GameStorage(mem);
 for(let i=0;i<20;i++){const g=new SnakeGame();g.score=i*4;s.finish(g);}
 const loaded=new GameStorage(mem);assert.equal(loaded.best,76);assert.equal(loaded.data.scores.length,10);assert.equal(loaded.data.games,20);assert.equal(loaded.data.session,null);
});
test('settings and paused session persist independently',()=>{
 let data=null;const mem={getItem:()=>data,setItem:(key,value)=>data=value};const s=new GameStorage(mem),g=new SnakeGame();g.start();g.step();s.saveSession(g);s.saveSettings({...DEFAULTS,level:9,controls:'thumb'});
 const loaded=new GameStorage(mem);assert.equal(loaded.data.settings.level,9);assert.equal(loaded.data.settings.controls,'thumb');assert.equal(SnakeGame.restore(loaded.data.session).level,4);
});

/** Deterministic, DOM-free game model. One cell is three LCD pixels. */
export const COLS = 28;
export const ROWS = 13;
export const CAPACITY = COLS * ROWS;
export const SPEEDS = Object.freeze([280, 245, 215, 185, 155, 125, 100, 80, 65]);
export const DIRECTIONS = Object.freeze({ UP: 0, RIGHT: 1, DOWN: 2, LEFT: 3 });
export const MAZES = Object.freeze(['No maze', 'Box', 'Rails', 'Courtyard', 'Passages', 'Labyrinth']);
const DX = [0, 1, 0, -1], DY = [-1, 0, 1, 0];
const integer = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;

export function createMaze(index) {
  const cells = new Uint8Array(CAPACITY);
  const put = (x, y) => { if (x >= 0 && y >= 0 && x < COLS && y < ROWS) cells[y * COLS + x] = 1; };
  const h = (x1, x2, y) => { for (let x = x1; x <= x2; x++) put(x, y); };
  const v = (x, y1, y2) => { for (let y = y1; y <= y2; y++) put(x, y); };
  if (index === 1) { h(0, 27, 0); h(0, 27, 12); v(0, 0, 12); v(27, 0, 12); }
  if (index === 2) { h(4, 23, 3); h(4, 23, 9); }
  if (index === 3) {
    h(4, 10, 2); h(17, 23, 2); h(4, 10, 10); h(17, 23, 10);
    v(4, 2, 4); v(23, 2, 4); v(4, 8, 10); v(23, 8, 10);
  }
  if (index === 4) {
    v(5, 1, 4); v(5, 8, 11); v(14, 0, 3); v(14, 9, 12);
    v(22, 1, 4); v(22, 8, 11); h(8, 11, 3); h(17, 19, 9);
  }
  if (index === 5) {
    h(2, 11, 2); v(2, 2, 9); h(2, 8, 9);
    h(16, 25, 10); v(25, 3, 10); h(19, 25, 3);
    v(13, 0, 3); v(14, 9, 12); h(9, 18, 6);
    // Leave a safe starting corridor through the center-left.
    h(18, 18, 5);
  }
  return cells;
}

/** Typed ring deque and occupancy map: O(1) movement, bounded turn queue. */
export class SnakeGame {
  constructor({ level = 4, maze = 0, seed = 0x3310 } = {}) {
    if (!integer(level, 1, 9) || !integer(maze, 0, 5)) throw new RangeError('Invalid level or maze');
    this.level = level; this.maze = maze; this.rng = (seed >>> 0) || 0x3310;
    this.walls = createMaze(maze);
    this.body = new Uint16Array(CAPACITY);
    this.occupied = new Uint8Array(CAPACITY);
    this.tail = 0; this.length = 5; this.direction = 1;
    this.turns = new Uint8Array(2); this.turnCount = 0;
    this.score = 0; this.eaten = 0; this.ticks = 0; this.growth = 0;
    this.status = 'ready'; this.food = -1; this.bonus = -1; this.bonusTTL = 0;
    this.bonusDuration = 30; this.deathCell = -1; this.lastEvent = 'none';
    this.eventPoints = 0;
    let start = this.findStart();
    for (let i = 0; i < this.length; i++) { this.body[i] = start + i; this.occupied[start + i] = 1; }
    const first = start + this.length + 4;
    this.food = first < CAPACITY && Math.floor(first / COLS) === Math.floor(start / COLS) && !this.walls[first] ? first : this.findFree();
  }
  get head() { return this.body[(this.tail + this.length - 1) % CAPACITY]; }
  get interval() { return SPEEDS[this.level - 1]; }
  get freeCount() { let n = 0; for (let i = 0; i < CAPACITY; i++) if (!this.walls[i] && !this.occupied[i]) n++; return n; }
  segment(i) { return this.body[(this.tail + i) % CAPACITY]; }
  findStart() {
    for (const y of [6, 5, 7, 4, 8, 1, 11]) {
      for (let x = 6; x < 19; x++) {
        let safe = true;
        for (let k = 0; k < 10; k++) if (x + k >= COLS || this.walls[y * COLS + x + k]) { safe = false; break; }
        if (safe) return y * COLS + x;
      }
    }
    throw new Error('Maze has no starting corridor');
  }
  random() {
    let x = this.rng; x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
    this.rng = x >>> 0; return this.rng / 4294967296;
  }
  findFree(exclude = -1) {
    let count = 0;
    for (let i = 0; i < CAPACITY; i++) if (!this.walls[i] && !this.occupied[i] && i !== exclude) count++;
    if (!count) return -1;
    let target = Math.floor(this.random() * count);
    for (let i = 0; i < CAPACITY; i++) if (!this.walls[i] && !this.occupied[i] && i !== exclude && target-- === 0) return i;
    return -1;
  }
  start() { if (this.status === 'ready' || this.status === 'paused') this.status = 'running'; }
  pause() { if (this.status === 'running') this.status = 'paused'; }
  queueTurn(direction) {
    if (!integer(direction, 0, 3) || this.turnCount >= 2 || !['running', 'ready', 'paused'].includes(this.status)) return false;
    const previous = this.turnCount ? this.turns[this.turnCount - 1] : this.direction;
    if (direction === previous || direction === (previous + 2) % 4) return false;
    this.turns[this.turnCount++] = direction; return true;
  }
  step() {
    this.lastEvent = 'none'; this.eventPoints = 0;
    if (this.status !== 'running') return this.lastEvent;
    if (this.turnCount) { this.direction = this.turns[0]; this.turns[0] = this.turns[1]; this.turnCount--; }
    const x = this.head % COLS, y = Math.floor(this.head / COLS);
    const nx = (x + DX[this.direction] + COLS) % COLS;
    const ny = (y + DY[this.direction] + ROWS) % ROWS;
    const next = ny * COLS + nx;
    const food = next === this.food, bonus = next === this.bonus;
    const addGrowth = food ? 1 : bonus ? 3 : 0;
    const grows = this.growth + addGrowth > 0;
    // Moving into the tail is legal ONLY when the tail vacates on this tick.
    if (this.walls[next] || (this.occupied[next] && (next !== this.body[this.tail] || grows))) {
      this.status = 'over'; this.deathCell = next; this.lastEvent = 'death'; return this.lastEvent;
    }
    this.growth += addGrowth;
    if (!this.growth) { this.occupied[this.body[this.tail]] = 0; this.tail = (this.tail + 1) % CAPACITY; this.length--; }
    else this.growth--;
    this.body[(this.tail + this.length) % CAPACITY] = next; this.length++; this.occupied[next] = 1;
    this.ticks++;
    if (food) {
      this.eaten++; this.eventPoints = this.level; this.score += this.eventPoints; this.lastEvent = 'food';
      this.food = this.findFree(this.bonus);
      if (this.eaten % 5 === 0 && this.bonus === -1 && this.freeCount > 1) {
        this.bonus = this.findFree(this.food); this.bonusTTL = this.bonusDuration;
      }
    }
    if (bonus) {
      this.eventPoints = this.level * this.bonusTTL; this.score += this.eventPoints;
      this.bonus = -1; this.bonusTTL = 0; this.lastEvent = 'bonus';
    } else if (this.bonus >= 0 && --this.bonusTTL <= 0) { this.bonus = -1; this.bonusTTL = 0; }
    if (this.freeCount === 0) { this.status = 'won'; this.food = -1; this.bonus = -1; this.lastEvent = 'win'; }
    // A bonus can occupy the last free cell. Restore normal food after expiry.
    else if (this.food < 0 && this.bonus < 0) this.food = this.findFree();
    return this.lastEvent;
  }
  snapshot() {
    return { version: 1, level: this.level, maze: this.maze, rng: this.rng,
      body: Array.from({ length: this.length }, (_, i) => this.segment(i)), direction: this.direction,
      score: this.score, eaten: this.eaten, ticks: this.ticks, growth: this.growth,
      food: this.food, bonus: this.bonus, bonusTTL: this.bonusTTL };
  }
  static restore(data) {
    if (!data || data.version !== 1 || !Array.isArray(data.body) || data.body.length < 2 || data.body.length > CAPACITY) throw new Error('Invalid saved game');
    const g = new SnakeGame(data);
    for (const key of ['score', 'eaten', 'ticks', 'growth']) if (!integer(data[key], 0, key === 'growth' ? CAPACITY : 1e9)) throw new Error(`Invalid ${key}`);
    if (!integer(data.direction, 0, 3) || !integer(data.rng, 1, 0xffffffff) || !integer(data.food, -1, CAPACITY - 1) || !integer(data.bonus, -1, CAPACITY - 1) || !integer(data.bonusTTL, 0, 30)) throw new Error('Invalid saved positions');
    g.occupied.fill(0); g.body.fill(0); g.tail = 0; g.length = data.body.length;
    for (let i = 0; i < g.length; i++) {
      const p = data.body[i];
      if (!integer(p, 0, CAPACITY - 1) || g.walls[p] || g.occupied[p]) throw new Error('Invalid saved body');
      if (i) {
        const prev = data.body[i - 1], dx = Math.abs(p % COLS - prev % COLS), dy = Math.abs(Math.floor(p / COLS) - Math.floor(prev / COLS));
        if (!((dy === 0 && (dx === 1 || dx === COLS - 1)) || (dx === 0 && (dy === 1 || dy === ROWS - 1)))) throw new Error('Disconnected saved body');
      }
      g.body[i] = p; g.occupied[p] = 1;
    }
    for (const p of [data.food, data.bonus]) if (p >= 0 && (g.occupied[p] || g.walls[p])) throw new Error('Occupied saved food');
    if (data.food >= 0 && data.food === data.bonus) throw new Error('Overlapping saved food');
    if ((data.bonus === -1) !== (data.bonusTTL === 0)) throw new Error('Invalid saved bonus timer');
    const neck = g.segment(g.length - 2), head = g.head;
    const expected = ((neck % COLS + DX[data.direction] + COLS) % COLS) + ((Math.floor(neck / COLS) + DY[data.direction] + ROWS) % ROWS) * COLS;
    if (expected !== head) throw new Error('Invalid saved heading');
    for (const key of ['score', 'eaten', 'ticks', 'growth', 'food', 'bonus', 'bonusTTL', 'direction', 'rng']) g[key] = data[key];
    g.status = 'paused'; return g;
  }
}

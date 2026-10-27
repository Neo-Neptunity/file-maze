// ファイル迷路 — 迷路の生成と形（画面を持たない）
// ふつうの迷路（分かれ道と行き止まりのある、ゴールへの道が1本だけの迷路）を作る。
// スタートからゴールまでの道を、フォルダの数だけ順に区切って「区域」にし、行き止まりの枝は、つながっている所の区域に入れる。
// 壁は、ふつうの壁。壁の飾り（ファイル名）は draw.js が付ける。

export const CELL = 38;               // 通路の幅
export const WALL = 24;               // 壁の厚み（ここに名前を刻む）
export const PITCH = CELL + WALL;
export const HALF = 8;                // プレイヤーの四角の半分

export const UP = 1, RIGHT = 2, DOWN = 4, LEFT = 8;
const DIRS = [
  { bit: UP, dx: 0, dy: -1, opp: DOWN },
  { bit: RIGHT, dx: 1, dy: 0, opp: LEFT },
  { bit: DOWN, dx: 0, dy: 1, opp: UP },
  { bit: LEFT, dx: -1, dy: 0, opp: RIGHT },
];

export const SIZES = { small: [21, 13], normal: [31, 19], large: [41, 25] };
// 「いちばん新しく足した升から続ける」割合。大きいほど長く曲がりくねった道（行き止まりは約 14%）、小さいほど分かれ道が多く道のりは短い（約 31%）。
// 0.6 より小さくしても、行き止まりの割合は頭打ち（約 30%）。31×19 での測定：1.0 は 10%・道のり 317、0.8 は 23%・152、0.5 は 31%・95
export const BRANCH = { few: 0.95, normal: 0.8, many: 0.5 };

// 全部の升をつなぐ、輪のない迷路。open[升] は、つながっている向きの bit の和
export function generate(w, h, rnd, newest) {
  const open = new Uint8Array(w * h), seen = new Uint8Array(w * h), live = [];
  const s = Math.floor(rnd() * w * h);
  seen[s] = 1;
  live.push(s);
  while (live.length) {
    const k = rnd() < newest ? live.length - 1 : Math.floor(rnd() * live.length);
    const c = live[k], x = c % w, y = (c / w) | 0;
    const next = DIRS.filter((d) => {
      const nx = x + d.dx, ny = y + d.dy;
      return nx >= 0 && ny >= 0 && nx < w && ny < h && !seen[ny * w + nx];
    });
    if (!next.length) { live[k] = live[live.length - 1]; live.pop(); continue; }
    const d = next[Math.floor(rnd() * next.length)], n = (y + d.dy) * w + x + d.dx;
    open[c] |= d.bit;
    open[n] |= d.opp;
    seen[n] = 1;
    live.push(n);
  }
  return open;
}

// src からの幅優先。dist は歩数、prev は「src へ向かう1つ手前の升」
export function bfs(open, w, h, src) {
  const dist = new Int32Array(w * h).fill(-1), prev = new Int32Array(w * h).fill(-1), q = new Int32Array(w * h);
  let qh = 0, qt = 0;
  dist[src] = 0;
  q[qt++] = src;
  while (qh < qt) {
    const c = q[qh++], x = c % w, y = (c / w) | 0;
    for (const d of DIRS) {
      if (!(open[c] & d.bit)) continue;
      const n = (y + d.dy) * w + x + d.dx;
      if (dist[n] < 0) { dist[n] = dist[c] + 1; prev[n] = c; q[qt++] = n; }
    }
  }
  return { dist, prev };
}

function farthest({ dist }, rnd) {
  let best = 0;
  for (const d of dist) if (d > best) best = d;
  const tie = [];
  dist.forEach((d, i) => { if (d === best) tie.push(i); });
  return tie[Math.floor(rnd() * tie.length)];
}

// 迷路を作る。regions は、スタートからゴールまでの道を区切る数（フォルダの数）
export function makeMaze({ w, h, rnd, newest = BRANCH.normal, regions = 1 }) {
  const open = generate(w, h, rnd, newest);
  // いちばん遠い2つを、スタートとゴールにする（長い道のりになる）
  const a = farthest(bfs(open, w, h, Math.floor(rnd() * w * h)), rnd);
  const b = farthest(bfs(open, w, h, a), rnd);
  const [start, goal] = rnd() < 0.5 ? [a, b] : [b, a];
  const toGoal = bfs(open, w, h, goal).prev;           // toGoal[升] は、ゴールへ向かう次の升
  const path = [start];
  for (let c = start; c !== goal;) { c = toGoal[c]; path.push(c); }

  // 区域：道を順に区切る。行き止まりの枝は、道につながっている所の区域に入れる
  const N = Math.max(1, Math.min(regions, path.length));
  const region = new Int16Array(w * h).fill(-1);
  const q = [];
  path.forEach((c, i) => { region[c] = Math.min(N - 1, Math.floor((i * N) / path.length)); q.push(c); });
  const mid = new Array(N).fill(null);                 // 各区域の、道の真ん中の升（名前を床に出す場所）
  const span = Array.from({ length: N }, () => []);
  path.forEach((c) => span[region[c]].push(c));
  span.forEach((cells, k) => { mid[k] = cells[Math.floor(cells.length / 2)]; });
  for (let qi = 0; qi < q.length; qi++) {
    const c = q[qi], x = c % w, y = (c / w) | 0;
    for (const d of DIRS) {
      if (!(open[c] & d.bit)) continue;
      const n = (y + d.dy) * w + x + d.dx;
      if (region[n] < 0) { region[n] = region[c]; q.push(n); }
    }
  }

  const maze = { w, h, open, start, goal, toGoal, path, region, regions: N, mid, W: w * PITCH + WALL, H: h * PITCH + WALL };
  Object.assign(maze, wallRuns(maze));
  return maze;
}

// ---- 形：座標と壁 ---------------------------------------------------------------

export const cellCenter = (maze, c) => ({ x: WALL + (c % maze.w) * PITCH + CELL / 2, y: WALL + ((c / maze.w) | 0) * PITCH + CELL / 2 });

// 位置にいちばん近い升（壁の厚みの真ん中で分ける）
export function cellNear(maze, x, y) {
  const cx = Math.max(0, Math.min(maze.w - 1, Math.floor((x - WALL / 2) / PITCH)));
  const cy = Math.max(0, Math.min(maze.h - 1, Math.floor((y - WALL / 2) / PITCH)));
  return cy * maze.w + cx;
}

// (x, y) が壁の中か。柱（壁と壁のつなぎ目）はいつも壁。世界の外も壁
export function isWall(maze, x, y) {
  if (x < 0 || y < 0 || x >= maze.W || y >= maze.H) return true;
  const ix = Math.floor(x / PITCH), iy = Math.floor(y / PITCH);
  const rx = x - ix * PITCH, ry = y - iy * PITCH;
  const inWallX = rx < WALL, inWallY = ry < WALL;
  if (inWallX && inWallY) return true;
  if (inWallX) {                                  // 縦の壁：左の升と右の升のあいだ
    if (ix === 0 || ix === maze.w || iy >= maze.h) return true;
    return !(maze.open[iy * maze.w + ix - 1] & RIGHT);
  }
  if (inWallY) {                                  // 横の壁：上の升と下の升のあいだ
    if (iy === 0 || iy === maze.h || ix >= maze.w) return true;
    return !(maze.open[(iy - 1) * maze.w + ix] & DOWN);
  }
  return ix >= maze.w || iy >= maze.h;
}

const freeAt = (maze, x, y) => !(isWall(maze, x - HALF, y - HALF) || isWall(maze, x + HALF, y - HALF) || isWall(maze, x - HALF, y + HALF) || isWall(maze, x + HALF, y + HALF));
export const canStand = freeAt;

// 1 画素ずつ、軸ごとに動く。壁に当たったら、その軸だけ止まる（壁に沿ってすべる）。p を書きかえる
export function stepMove(maze, p, dx, dy) {
  let rx = dx;
  while (Math.abs(rx) > 1e-6) {
    const st = Math.max(-1, Math.min(1, rx));
    if (freeAt(maze, p.x + st, p.y)) p.x += st; else break;
    rx -= st;
  }
  let ry = dy;
  while (Math.abs(ry) > 1e-6) {
    const st = Math.max(-1, Math.min(1, ry));
    if (freeAt(maze, p.x, p.y + st)) p.y += st; else break;
    ry -= st;
  }
  return p;
}

// ---- 壁のつながり：名前を刻む板 ------------------------------------------------------
// 同じ向きにつながった壁を、1枚の長い板にする。板ごとに、ファイル名を刻む。
//   rect：板の全体（つなぎ目の柱を含む）。text：文字を置ける範囲
//   segRun：壁の1区画 → 板の番号（"h列,行" / "v列,行"）
function wallRuns(maze) {
  const { w, h, open } = maze;
  const runs = [], segRun = new Map();
  const hasH = (i, j) => j === 0 || j === h || !(open[(j - 1) * w + i] & DOWN);
  const hasV = (i, j) => i === 0 || i === w || !(open[j * w + i - 1] & RIGHT);
  for (let j = 0; j <= h; j++) {
    for (let i = 0; i < w;) {
      if (!hasH(i, j)) { i++; continue; }
      let b = i;
      while (b < w && hasH(b, j)) b++;
      const rect = { x: i * PITCH, y: j * PITCH, w: (b - i) * PITCH + WALL, h: WALL };
      const id = runs.length;
      runs.push({ dir: "h", rect, text: { ...rect }, from: i, to: b, line: j, cell: Math.min(h - 1, j) * w + Math.min(w - 1, i + ((b - i - 1) >> 1)) });
      for (let k = i; k < b; k++) segRun.set(`h${k},${j}`, id);
      i = b;
    }
  }
  for (let i = 0; i <= w; i++) {
    for (let j = 0; j < h;) {
      if (!hasV(i, j)) { j++; continue; }
      let b = j;
      while (b < h && hasV(i, b)) b++;
      const rect = { x: i * PITCH, y: j * PITCH, w: WALL, h: (b - j) * PITCH + WALL };
      const text = { x: i * PITCH, y: j * PITCH + WALL, w: WALL, h: (b - j) * PITCH - WALL };
      const id = runs.length;
      runs.push({ dir: "v", rect, text, from: j, to: b, line: i, cell: (j + ((b - j - 1) >> 1)) * w + Math.min(w - 1, i) });
      for (let k = j; k < b; k++) segRun.set(`v${i},${k}`, id);
      j = b;
    }
  }
  return { runs, segRun };
}

// 升のまわりの、ふさがっている壁の板の番号
export function wallsAround(maze, c) {
  const x = c % maze.w, y = (c / maze.w) | 0, out = [];
  const add = (k) => { const id = maze.segRun.get(k); if (id !== undefined) out.push(id); };
  if (!(maze.open[c] & UP)) add(`h${x},${y}`);
  if (!(maze.open[c] & DOWN)) add(`h${x},${y + 1}`);
  if (!(maze.open[c] & LEFT)) add(`v${x},${y}`);
  if (!(maze.open[c] & RIGHT)) add(`v${x + 1},${y}`);
  return out;
}

// 行き止まりの数（分かれ道の多さの目安）
export function deadEnds(maze) {
  let n = 0;
  for (const o of maze.open) if (o === UP || o === RIGHT || o === DOWN || o === LEFT) n++;
  return n;
}

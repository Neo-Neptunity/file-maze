// ファイル迷路 — 歩く・描く
// 迷路の中でプレイヤーを動かす。カメラはプレイヤーについていく。ゴールの升に着いたら hooks.onGoal。
// 区域（フォルダ）が変わったら hooks.onRegion。迷路の全体は見えない。歩いた所だけが、右下の地図に残る。
import { stepMove, cellNear, cellCenter, HALF, RIGHT, DOWN } from "./maze.js";

const SPEEDS = { slow: 120, normal: 180, fast: 240 };

// 駒の形を描く（中心 x,y・大きさ size）
export function drawPiece(c, shape, x, y, size, color, edge) {
  const h = size / 2;
  c.save();
  c.fillStyle = color;
  c.strokeStyle = edge;
  c.lineWidth = 2;
  c.beginPath();
  if (shape === "circle") c.arc(x, y, h, 0, Math.PI * 2);
  else if (shape === "diamond") { c.moveTo(x, y - h * 1.15); c.lineTo(x + h * 1.05, y); c.lineTo(x, y + h * 1.15); c.lineTo(x - h * 1.05, y); c.closePath(); }
  else if (shape === "star") {
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5, r = i % 2 ? h * 0.5 : h * 1.2;
      c[i ? "lineTo" : "moveTo"](x + Math.cos(a) * r, y + Math.sin(a) * r);
    }
    c.closePath();
  } else if (shape === "cat") {
    c.moveTo(x - h, y - h * 0.2); c.lineTo(x - h * 0.9, y - h * 1.15); c.lineTo(x - h * 0.3, y - h * 0.6);
    c.lineTo(x + h * 0.3, y - h * 0.6); c.lineTo(x + h * 0.9, y - h * 1.15); c.lineTo(x + h, y - h * 0.2);
    c.quadraticCurveTo(x + h * 1.1, y + h, x, y + h); c.quadraticCurveTo(x - h * 1.1, y + h, x - h, y - h * 0.2);
    c.closePath();
  } else if (shape === "ghost") {
    c.moveTo(x - h, y + h); c.lineTo(x - h, y - h * 0.1); c.quadraticCurveTo(x - h, y - h * 1.1, x, y - h * 1.1);
    c.quadraticCurveTo(x + h, y - h * 1.1, x + h, y - h * 0.1); c.lineTo(x + h, y + h);
    c.lineTo(x + h * 0.5, y + h * 0.6); c.lineTo(x, y + h); c.lineTo(x - h * 0.5, y + h * 0.6); c.closePath();
  } else c.roundRect(x - h, y - h, size, size, size * 0.2);
  c.fill();
  c.stroke();
  if (shape === "cat" || shape === "ghost" || shape === "circle" || shape === "star") {
    c.fillStyle = edge;
    const ey = shape === "star" ? y + h * 0.05 : y - h * 0.1;
    c.beginPath(); c.arc(x - h * 0.35, ey, size * 0.07, 0, Math.PI * 2); c.arc(x + h * 0.35, ey, size * 0.07, 0, Math.PI * 2); c.fill();
  }
  c.restore();
}

export function createPlay(stage, hooks) {
  const canvas = document.createElement("canvas");
  canvas.id = "cv";
  stage.append(canvas);
  const c = canvas.getContext("2d");
  const map = document.createElement("canvas");
  map.id = "mm";
  map.width = 200; map.height = 120;
  map.hidden = true;
  stage.append(map);
  const m = map.getContext("2d");

  let maze = null, layers = null, theme = null, skin = null;
  let speed = SPEEDS.normal, useMouse = true;
  const p = { x: 0, y: 0 };
  const keys = new Set();
  let pointer = null;                    // 押している間の位置（迷路の座標）
  let paused = true, done = false;
  let seen = null, curCell = -1, curRegion = -1;
  let hint = null;                       // { cells, until }
  let t = 0, last = 0, raf = 0;
  let fade = 0;
  let view = { s: 1, camX: 0, camY: 0, vw: 1, vh: 1, dpr: 1 };
  let moved = 0;
  let drive = null;                      // 試験用：キーの代わりに向きを渡す { dx, dy }
  let showMap = true;

  const fit = () => {
    const r = stage.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.max(1, Math.round(r.width)), h = Math.max(1, Math.round(r.height));
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
      canvas.style.width = `${w}px`; canvas.style.height = `${h}px`;
    }
    view.vw = w; view.vh = h; view.dpr = dpr;
  };
  new ResizeObserver(fit).observe(stage);
  fit();

  function drawMap() {
    m.clearRect(0, 0, map.width, map.height);
    if (!maze || !showMap) return;
    const k = Math.min((map.width - 12) / maze.w, (map.height - 12) / maze.h);
    const ox = (map.width - maze.w * k) / 2, oy = (map.height - maze.h * k) / 2;
    const at = (cell) => ({ x: ox + (cell % maze.w + 0.5) * k, y: oy + (((cell / maze.w) | 0) + 0.5) * k });
    m.strokeStyle = theme.edge;
    m.lineWidth = Math.max(1.5, k * 0.45);
    m.lineCap = "round";
    m.beginPath();
    for (let cell = 0; cell < seen.length; cell++) {
      if (!seen[cell]) continue;
      const a = at(cell);
      m.moveTo(a.x, a.y); m.lineTo(a.x, a.y);
      for (const [bit, dx, dy] of [[RIGHT, 1, 0], [DOWN, 0, 1]]) {
        if (!(maze.open[cell] & bit)) continue;
        const n = cell + dx + dy * maze.w;
        if (seen[n]) { const b = at(n); m.moveTo(a.x, a.y); m.lineTo(b.x, b.y); }
      }
    }
    m.stroke();
    const s = at(maze.start);
    m.fillStyle = theme.start;
    m.beginPath(); m.arc(s.x, s.y, Math.max(2.5, k * 0.6), 0, Math.PI * 2); m.fill();
    const me = at(curCell);
    m.fillStyle = "#fff";
    m.beginPath(); m.arc(me.x, me.y, Math.max(2.5, k * 0.6), 0, Math.PI * 2); m.fill();
  }

  function update(dt) {
    let dx = 0, dy = 0;
    if (keys.has("KeyA") || keys.has("ArrowLeft")) dx -= 1;
    if (keys.has("KeyD") || keys.has("ArrowRight")) dx += 1;
    if (keys.has("KeyW") || keys.has("ArrowUp")) dy -= 1;
    if (keys.has("KeyS") || keys.has("ArrowDown")) dy += 1;
    if (drive) { dx = drive.dx; dy = drive.dy; }
    if (!dx && !dy && pointer && useMouse) {
      const vx = pointer.x - p.x, vy = pointer.y - p.y, d = Math.hypot(vx, vy);
      if (d > 6) { dx = vx / d; dy = vy / d; }
    }
    const len = Math.hypot(dx, dy);
    if (len > 0) {
      const k = (speed * dt) / len;
      const x0 = p.x, y0 = p.y;
      stepMove(maze, p, dx * k, dy * k);
      moved += Math.hypot(p.x - x0, p.y - y0);
    }
    const cell = cellNear(maze, p.x, p.y);
    if (cell !== curCell) {
      curCell = cell;
      seen[cell] = 1;
      drawMap();
      const r = maze.region[cell];
      if (r !== curRegion) { curRegion = r; hooks.onRegion(r); }
    }
    const g = cellCenter(maze, maze.goal);
    if (!done && Math.hypot(p.x - g.x, p.y - g.y) < 16) { done = true; hooks.onGoal(); }
  }

  function draw() {
    const { vw, vh, dpr } = view;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.fillStyle = theme.bg;
    c.fillRect(0, 0, vw, vh);
    if (!maze) return;
    const s = Math.max(0.7, Math.min(1.5, vw / 1280));
    const vwW = vw / s, vhW = vh / s;
    const camX = maze.W <= vwW ? -(vwW - maze.W) / 2 : Math.max(0, Math.min(maze.W - vwW, p.x - vwW / 2));
    const camY = maze.H <= vhW ? -(vhW - maze.H) / 2 : Math.max(0, Math.min(maze.H - vhW, p.y - vhW / 2));
    view = { ...view, s, camX, camY };
    const x0 = Math.max(0, camX), y0 = Math.max(0, camY);
    const x1 = Math.min(maze.W, camX + vwW), y1 = Math.min(maze.H, camY + vhW);
    const q = layers.q;
    c.imageSmoothingEnabled = true;
    c.imageSmoothingQuality = "high";
    const blit = (img) => c.drawImage(img, x0 * q, y0 * q, (x1 - x0) * q, (y1 - y0) * q, (x0 - camX) * s, (y0 - camY) * s, (x1 - x0) * s, (y1 - y0) * s);
    blit(layers.floor);
    c.save();
    c.scale(s, s);
    c.translate(-camX, -camY);
    // 手がかり：ゴールへの道すじ（光る点）
    const now = performance.now();
    if (hint && now < hint.until) {
      const pulse = 0.5 + 0.5 * Math.sin(t * 6);
      hint.cells.forEach((cell, i) => {
        const pt = cellCenter(maze, cell);
        c.globalAlpha = (0.9 - i * 0.04) * (0.6 + pulse * 0.4);
        c.fillStyle = theme.goal;
        c.beginPath(); c.arc(pt.x, pt.y, 5.5 + pulse * 1.5, 0, Math.PI * 2); c.fill();
      });
      c.globalAlpha = 1;
    }
    // ゴールの旗
    const g = cellCenter(maze, maze.goal);
    const pulse = 0.5 + 0.5 * Math.sin(t * 5);
    c.strokeStyle = theme.goal;
    c.lineWidth = 3;
    c.globalAlpha = 0.3 + pulse * 0.4;
    c.beginPath(); c.arc(g.x, g.y, 14 + pulse * 5, 0, Math.PI * 2); c.stroke();
    c.globalAlpha = 1;
    c.fillStyle = theme.goal;
    c.fillRect(g.x - 1.5, g.y - 12, 3, 22);
    c.beginPath(); c.moveTo(g.x + 1.5, g.y - 12); c.lineTo(g.x + 14, g.y - 7); c.lineTo(g.x + 1.5, g.y - 2); c.closePath(); c.fill();
    // プレイヤー
    drawPiece(c, skin.shape, p.x, p.y, HALF * 2 + 3, skin.color, theme.bg);
    c.restore();
    blit(layers.walls);
    if (fade > 0.001) { c.fillStyle = theme.bg; c.globalAlpha = Math.min(1, fade); c.fillRect(0, 0, vw, vh); c.globalAlpha = 1; }
  }

  function frame(ts) {
    const gap = last ? ts - last : 0;
    const dt = Math.min(0.05, gap / 1000);
    last = ts;
    t += dt;
    // 画面が止まっていた（別のタブにいた）あとは、遊んでいる途中なら中断にする
    if (gap > 1500 && maze && !paused) hooks.onStall(gap);
    if (fade > 0) fade = Math.max(0, fade - dt * 3);
    if (maze && !paused) update(dt);
    if (maze && layers) draw(); else { c.setTransform(view.dpr, 0, 0, view.dpr, 0, 0); c.fillStyle = theme ? theme.bg : "#000"; c.fillRect(0, 0, view.vw, view.vh); }
    raf = requestAnimationFrame(frame);
  }
  raf = requestAnimationFrame(frame);

  const toWorld = (e) => {
    const r = canvas.getBoundingClientRect();
    return { x: (e.clientX - r.left) / view.s + view.camX, y: (e.clientY - r.top) / view.s + view.camY };
  };
  const onKeyDown = (e) => {
    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(e.code)) e.preventDefault();
    if (e.repeat) return;
    if (e.code === "Escape") { hooks.onEsc(); return; }
    if (e.code === "KeyH" || e.code === "KeyE") { hooks.onHint(); return; }
    if (e.code === "KeyM") { showMap = !showMap; map.hidden = !showMap || paused || !maze; drawMap(); return; }
    keys.add(e.code);
  };
  const onKeyUp = (e) => keys.delete(e.code);
  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
  window.addEventListener("blur", () => { keys.clear(); pointer = null; });
  canvas.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    pointer = toWorld(e);
    try { canvas.setPointerCapture(e.pointerId); } catch { /* つかめなくても、押している間は動ける */ }
  });
  canvas.addEventListener("pointermove", (e) => { if (pointer) pointer = toWorld(e); });
  const release = () => { pointer = null; };
  canvas.addEventListener("pointerup", release);
  canvas.addEventListener("pointercancel", release);
  canvas.addEventListener("contextmenu", (e) => e.preventDefault());

  return {
    canvas,
    setTheme(th, sk) { theme = th; skin = sk; },
    setSettings(s) { speed = SPEEDS[s.speed] || SPEEDS.normal; useMouse = s.mouse !== false; },
    // 新しい迷路で始める。プレイヤーはスタートの升の真ん中
    setMaze(mz, ly) {
      maze = mz; layers = ly;
      const s = cellCenter(mz, mz.start);
      p.x = s.x; p.y = s.y;
      done = false; hint = null; pointer = null; keys.clear();
      seen = new Uint8Array(mz.w * mz.h);
      curCell = -1; curRegion = -1; moved = 0;
      fade = 1;
      update(0);
    },
    setLayers(ly) { layers = ly; },
    hint(cells, ms = 8000) { hint = { cells, until: performance.now() + ms }; },
    pause(v) { paused = v; map.hidden = v || !maze || !showMap; if (v) { keys.clear(); pointer = null; } },
    clear() { maze = null; layers = null; map.hidden = true; },
    get cell() { return curCell; },
    get player() { return p; },
    get maze() { return maze; },
    get moved() { return moved; },
    get view() { return view; },
    // 試験用：向きを渡して、1 コマ進める
    drive(v) { drive = v; },
    tick(dt) { if (maze) update(dt); },
    destroy() { cancelAnimationFrame(raf); window.removeEventListener("keydown", onKeyDown); window.removeEventListener("keyup", onKeyUp); canvas.remove(); map.remove(); },
  };
}

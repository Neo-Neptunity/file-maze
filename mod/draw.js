// ファイル迷路 — 迷路を絵にする：床の層と、壁の層（壁の板にファイル名を刻む）
import { WALL, CELL, PITCH, cellCenter, wallsAround } from "./maze.js";
import { hashStr, rng } from "./tree.js";

const FONT = '"Yu Gothic UI","Yu Gothic","Meiryo","Segoe UI","Noto Sans JP",sans-serif';
const MAX_PIXELS = 14e6;      // 絵の大きさの上限（画素数）。大きい迷路で重くならないように

const hex = (c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
export function mix(a, b, t) {
  const x = hex(a), y = hex(b);
  return `rgb(${x.map((v, i) => Math.round(v + (y[i] - v) * t)).join(",")})`;
}

function layer(w, h, q) {
  const c = document.createElement("canvas");
  c.width = Math.ceil(w * q);
  c.height = Math.ceil(h * q);
  const g = c.getContext("2d");
  g.scale(q, q);
  return { c, g };
}

// 板の長さに合わせて、名前をつなげる。長すぎる分は、板の端で切れる
function textFor(pool, rnd, len, g, forced) {
  let s = "", guard = 0;
  while (g.measureText(s).width < len && guard++ < 60) {
    s += (s ? "　" : "") + (forced || pool[Math.floor(rnd() * pool.length)]);
  }
  return s;
}

// 床と壁の絵を作る。
//   pools：区域ごとの名前の一覧、labels：区域ごとの床の大きな文字、forced：スタートとゴールの名前
//   返すのは { floor, walls, q }。どちらも、世界の大きさ × q の絵
export function drawLayers({ maze, theme, pools, labels, forced, seed, dpr = 1 }) {
  const { W, H } = maze;
  let q = Math.max(1, Math.min(2, dpr));
  if (W * H * q * q > MAX_PIXELS) q = Math.max(1, Math.sqrt(MAX_PIXELS / (W * H)));
  const rnd = rng(seed);

  // ---- 床：地の色と、区域ごとのほのかな色。区域のフォルダ名を大きく薄く ----
  const fl = layer(W, H, q), f = fl.g;
  f.fillStyle = theme.floor;
  f.fillRect(0, 0, W, H);
  const hue = (k) => (hashStr(labels[k] || String(k)) % 360);
  for (let c = 0; c < maze.w * maze.h; c++) {
    const x = c % maze.w, y = (c / maze.w) | 0;
    f.fillStyle = `hsla(${hue(maze.region[c])},50%,55%,0.07)`;
    f.fillRect(x * PITCH + WALL / 2, y * PITCH + WALL / 2, PITCH, PITCH);
  }
  f.textAlign = "center";
  f.textBaseline = "middle";
  f.fillStyle = theme.mark;
  maze.mid.forEach((c, k) => {
    if (c == null || !labels[k]) return;
    const p = cellCenter(maze, c);
    let size = 120;
    f.font = `800 ${size}px ${FONT}`;
    const w = f.measureText(labels[k]).width;
    if (w > 640) { size = Math.floor((size * 640) / w); f.font = `800 ${size}px ${FONT}`; }
    f.fillText(labels[k], p.x, p.y);
  });
  // スタートの升
  const sp = cellCenter(maze, maze.start);
  f.fillStyle = theme.start;
  f.globalAlpha = 0.3;
  f.fillRect(sp.x - CELL / 2, sp.y - CELL / 2, CELL, CELL);
  f.globalAlpha = 1;

  // ---- 壁：板にファイル名を刻む。スタートとゴールのまわりの板は、その名前と色 ----
  const wl = layer(W, H, q), g = wl.g;
  const role = new Map();
  for (const id of wallsAround(maze, maze.start)) role.set(id, "start");
  for (const id of wallsAround(maze, maze.goal)) role.set(id, "goal");
  const plate = mix(theme.floor, theme.wall, 0.2);
  const ink = mix(theme.floor, theme.wall, 0.8);
  const rim = mix(theme.floor, theme.bg, 0.6);
  const tint = { start: mix(plate, theme.start, 0.28), goal: mix(plate, theme.goal, 0.28) };
  const inkOf = { start: theme.start, goal: theme.goal };

  g.font = `700 16px ${FONT}`;
  g.textBaseline = "middle";
  g.textAlign = "left";
  const paintPlate = (r, id) => {
    const k = role.get(id);
    g.fillStyle = k ? tint[k] : plate;
    g.fillRect(r.rect.x, r.rect.y, r.rect.w, r.rect.h);
    g.strokeStyle = rim;
    g.lineWidth = 1;
    g.strokeRect(r.rect.x + 0.5, r.rect.y + 0.5, r.rect.w - 1, r.rect.h - 1);
  };
  const paintText = (r, id) => {
    const t = r.text;
    if (t.w < 8 || t.h < 8) return;
    const k = role.get(id);
    const len = r.dir === "h" ? t.w : t.h;
    const s = textFor(pools[maze.region[r.cell]] || pools[0], rnd, len - 8, g, k === "start" ? forced.start : k === "goal" ? forced.goal : null);
    g.save();
    g.beginPath();
    g.rect(t.x, t.y, t.w, t.h);
    g.clip();
    g.fillStyle = k ? inkOf[k] : ink;
    if (r.dir === "h") g.fillText(s, t.x + 5, t.y + t.h / 2 + 1);
    else {
      g.translate(t.x + t.w / 2, t.y + t.h);
      g.rotate(-Math.PI / 2);
      g.fillText(s, 5, 1);
    }
    g.restore();
  };
  // 縦の板 → 縦の文字 → 横の板 → 横の文字（柱の所は、横の板が上に重なる）
  maze.runs.forEach((r, id) => { if (r.dir === "v") paintPlate(r, id); });
  maze.runs.forEach((r, id) => { if (r.dir === "v") paintText(r, id); });
  maze.runs.forEach((r, id) => { if (r.dir === "h") paintPlate(r, id); });
  maze.runs.forEach((r, id) => { if (r.dir === "h") paintText(r, id); });

  return { floor: fl.c, walls: wl.c, q };
}

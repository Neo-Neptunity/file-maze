// 本物の index.js を、ヘッドレスの Edge で動かして、画面を撮る・ボットに最後まで歩かせる（偽の explorerPlus を渡す）。
//   使い方：node file-maze/dev/browser.mjs [出力フォルダ] [--scenario=look|gen|solve|flow] [--w=1280 --h=720] [--seeds=3]
//   出力フォルダに PNG を書く。コンソールのエラーも出す。Edge が無ければ Chrome を使う
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { fakeRoot } from "./fake-tree.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const MOD = path.resolve(here, "../mod");
const args = process.argv.slice(2);
const outDir = path.resolve(args.find((a) => !a.startsWith("--")) || path.join(os.tmpdir(), "fm-shots"));
const opt = Object.fromEntries(args.filter((a) => a.startsWith("--")).map((a) => { const [k, v] = a.slice(2).split("="); return [k, v ?? true]; }));
fs.mkdirSync(outDir, { recursive: true });

const scenario = opt.scenario || "look";
const settings = { speed: "normal", mouse: true, treeDepth: 4 };
const downloads = {
  entry: { id: "700", name: "Downloads", path: "C:\\Users\\me\\Downloads", kind: "folder", ext: "", hidden: false },
  children: ["a.zip", "b.pdf", "c.exe"].map((n, i) => ({ entry: { id: String(710 + i), name: n, path: `C:\\Users\\me\\Downloads\\${n}`, kind: "file", ext: n.split(".")[1], hidden: false, size: 1000, modified: Date.UTC(2025, 1, 1) } })),
};
const TREE = [fakeRoot(), downloads];

const HARNESS = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>html,body{margin:0;height:100%}</style>
<script>
const store = {};
const TREE = ${JSON.stringify(TREE)};
const opts = ${JSON.stringify(settings)};
window.__log = [];
const findNode = (nodes, p) => { for (const n of nodes) { if (n.entry.path === p) return n; const r = n.children && findNode(n.children, p); if (r) return r; } return null; };
const cut = (n, depth) => (n.entry.kind === "folder" && depth > 0 && n.children ? { entry: n.entry, children: n.children.map((c) => cut(c, depth - 1)) } : { entry: n.entry });
window.explorerPlus = {
  ready: async () => ({ apiVersion: 1, theme: "dark" }),
  settings: { get: async () => ({ ...opts }) },
  onSettings: () => () => {},
  storage: { get: async (k) => store[k], set: async (k, v) => { store[k] = JSON.parse(JSON.stringify(v)); }, delete: async () => {}, keys: async () => Object.keys(store) },
  quickAccess: { list: async () => TREE.map((t) => t.entry) },
  onQuickAccess: () => () => {},
  getTree: async ({ depth = 1, from }) => {
    window.__log.push("getTree " + from.path + " " + depth);
    const n = findNode(TREE, from.path);
    if (!n || n.entry.id !== from.id) { const e = new Error("folder id does not match"); e.code = "not-found"; throw e; }
    return cut(n, depth);
  },
  commands: { set: async () => {} }, onCommand: () => () => {},
  ui: { toast: async () => {}, confirm: async () => true, status: async () => {} },
  open: async (e, o) => { window.__log.push("open " + e.path + (o && o.newTab ? " newTab" : "")); },
};
</script></head><body><script type="module" src="/file-maze/index.js?debug"></script></body></html>`;

const TYPES = { ".js": "text/javascript", ".json": "application/json", ".html": "text/html" };
const server = http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split("?")[0]);
  if (url === "/" || url === "/index.html") { res.writeHead(200, { "content-type": "text/html" }); return res.end(HARNESS); }
  const m = /^\/file-maze\/(.+)$/.exec(url);
  const f = m && path.join(MOD, m[1]);
  if (f && f.startsWith(MOD) && fs.existsSync(f)) { res.writeHead(200, { "content-type": TYPES[path.extname(f)] || "application/octet-stream", "cache-control": "no-store" }); return res.end(fs.readFileSync(f)); }
  res.writeHead(404); res.end("not found");
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const port = server.address().port;

const exes = [
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
];
const exe = exes.find((p) => fs.existsSync(p));
if (!exe) throw new Error("Edge も Chrome も見つかりません");
const profile = fs.mkdtempSync(path.join(os.tmpdir(), "fm-edge-"));
const W = Number(opt.w || 1280), H = Number(opt.h || 720);
const dbg = 9300 + Math.floor(Math.random() * 500);
const proc = spawn(exe, [
  "--headless=new", `--remote-debugging-port=${dbg}`, `--user-data-dir=${profile}`, `--window-size=${W},${H}`,
  "--no-first-run", "--no-default-browser-check", "about:blank",
], { stdio: "ignore" });
const cleanup = () => { try { proc.kill(); } catch { /* 終わっていた */ } try { server.close(); } catch { /* 閉じていた */ } try { fs.rmSync(profile, { recursive: true, force: true }); } catch { /* 消せなくても困らない */ } };
process.on("exit", cleanup);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ws, seq = 0;
const pending = new Map();
const logs = [];
async function connect() {
  for (let i = 0; i < 60; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${dbg}/json/list`)).json();
      const pg = list.find((t) => t.type === "page");
      if (pg) {
        ws = new WebSocket(pg.webSocketDebuggerUrl);
        await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
        ws.onmessage = (m) => {
          const d = JSON.parse(m.data);
          if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); }
          else if (d.method === "Runtime.consoleAPICalled") logs.push(`[${d.params.type}] ${d.params.args.map((a) => a.value ?? a.description ?? "").join(" ")}`);
          else if (d.method === "Runtime.exceptionThrown") logs.push(`[exception] ${d.params.exceptionDetails.exception?.description || d.params.exceptionDetails.text}`);
        };
        return;
      }
    } catch { /* まだ起動中 */ }
    await sleep(250);
  }
  throw new Error("ブラウザにつながりません");
}
const send = (method, params = {}) => new Promise((res, rej) => {
  const id = ++seq;
  pending.set(id, (d) => (d.error ? rej(new Error(`${method}: ${d.error.message}`)) : res(d.result)));
  ws.send(JSON.stringify({ id, method, params }));
});
const ev = async (expr) => {
  const r = await send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return r.result.value;
};
const shot = async (name) => {
  const r = await send("Page.captureScreenshot", { format: "png" });
  fs.writeFileSync(path.join(outDir, `${name}.png`), Buffer.from(r.data, "base64"));
  console.log("  shot", name);
};
const act = (a, extra = "") => ev(`document.querySelector('[data-act="${a}"]${extra}').click()`);
const check = (cond, msg) => { console.log(cond ? "  ok" : "  NG", msg); if (!cond) process.exitCode = 1; };
const FM = (expr) => ev(`(() => { const d = window.__fm(); return ${expr}; })()`);

async function boot() {
  await connect();
  await send("Runtime.enable");
  await send("Page.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: Number(opt.dpr || 1), mobile: false });
  await send("Page.navigate", { url: `http://127.0.0.1:${port}/` });
  await sleep(1800);
}

// ページの中で動くボット：正解の道すじを、升の真ん中どうしで、本物の物理（stepMove）で歩く
const BOT = `
window.__bot = {
  async load() { this.mz = await import("/file-maze/maze.js"); this.tree = await import("/file-maze/tree.js"); },
  async solve() {
    await this.load();
    const fm = window.__fm(), play = fm.play, maze = play.maze, mz = this.mz;
    const crumbs = [];
    const record = () => { const t = document.getElementById("h-crumb").textContent; if (t && crumbs[crumbs.length - 1] !== t) crumbs.push(t); };
    record();
    let ticks = 0;
    // いまの升から、ゴールへ向かう道すじ（脇道に入っていても、そこから戻ってゴールへ）
    const route = [mz.cellNear(maze, play.player.x, play.player.y)];
    while (route[route.length - 1] !== maze.goal) route.push(maze.toGoal[route[route.length - 1]]);
    for (const c of route) {
      const t = mz.cellCenter(maze, c);
      let guard = 0;
      while (guard++ < 400) {
        const p = play.player, dx = t.x - p.x, dy = t.y - p.y, d = Math.hypot(dx, dy);
        if (d < 2) break;
        play.drive({ dx: dx / d, dy: dy / d });
        play.tick(1 / 60);
        ticks++;
        record();
        if (fm.scene !== "play") break;
      }
      if (guard >= 400) { play.drive(null); return { ok: false, why: "進めない", cell: c, pos: { ...play.player }, ticks }; }
      if (fm.scene !== "play") break;
    }
    play.drive(null);
    return { ok: fm.scene === "clear", crumbs, ticks, len: maze.path.length, scene: fm.scene };
  },
};`;

async function startFirst(i = 0) {
  await act("root", `[data-i="${i}"]`);
  await sleep(300);
}

// 迷路の全体を 1 枚の絵にする（床＋壁を縮めて）。デバッグ用：本番の画面は全体を見せない
async function overview(name, width = 1280) {
  const url = await ev(`(() => { const d = window.__fm(), ly = d.run.layers, m = d.play.maze;
    const k = ${width} / m.W, c = document.createElement("canvas"); c.width = ${width}; c.height = Math.round(m.H * k);
    const g = c.getContext("2d"); g.imageSmoothingQuality = "high"; g.drawImage(ly.floor, 0, 0, c.width, c.height); g.drawImage(ly.walls, 0, 0, c.width, c.height);
    const cell = (i) => { const p = ((i % m.w) * 62 + 24 + 19) * k, q = (((i / m.w) | 0) * 62 + 24 + 19) * k; return [p, q]; };
    g.strokeStyle = "rgba(255,210,77,.9)"; g.lineWidth = 3; g.beginPath(); m.path.forEach((c2, i) => { const [x, y] = cell(c2); i ? g.lineTo(x, y) : g.moveTo(x, y); }); g.stroke();
    return c.toDataURL("image/png"); })()`);
  fs.writeFileSync(path.join(outDir, `${name}.png`), Buffer.from(url.split(",")[1], "base64"));
  console.log("  shot", name);
}

const SCENARIOS = {
  // 見た目：はじめの画面・出発前・遊んでいる画面・迷路の全体
  async look() {
    await shot("1-home");
    await startFirst();
    await shot("2-brief");
    await act("go");
    await sleep(900);
    await shot("3-start");
    console.log("  迷路:", await FM("(() => { const m = d.play.maze; return JSON.stringify({ w: m.w, h: m.h, len: m.path.length, regions: m.regions, runs: m.runs.length, world: m.W + 'x' + m.H, q: d.run.layers.q }); })()"));
    await overview("4-overview");
    // 道すじの途中（区域が変わる所）へ動かして撮る
    const cells = await FM("(() => { const m = d.play.maze, out = []; let last = -1; m.path.forEach((c, i) => { if (m.region[c] !== last) { last = m.region[c]; out.push(i); } }); return out; })()");
    let n = 0;
    for (const i of cells.slice(1, 4)) {
      await FM(`(() => { const m = d.play.maze; const mz = window.__mz; const c = m.path[${i}]; const p = { x: 24 + (c % m.w) * 62 + 19, y: 24 + ((c / m.w) | 0) * 62 + 19 }; d.play.player.x = p.x; d.play.player.y = p.y; d.play.tick(0); return 1; })()`);
      await sleep(250);
      await shot(`5-region-${++n}`);
    }
    // 手がかり
    await FM("(d.useHint(), 0)");
    await sleep(300);
    await shot("6-hint");
  },

  // 大きさごとの迷路を作る時間・絵の大きさ・壁の板の数
  async gen() {
    await startFirst();
    for (const size of ["small", "normal", "large"]) {
      for (const branch of ["few", "normal", "many"]) {
        await act("opt", `[data-key="size"][data-v="${size}"]`);
        await act("opt", `[data-key="branch"][data-v="${branch}"]`);
        const t0 = Date.now();
        await act("go");
        for (let i = 0; i < 100 && (await FM("d.scene")) !== "play"; i++) await sleep(50);
        const ms = Date.now() - t0;
        const info = await FM("(() => { const m = d.play.maze; return { w: m.w, h: m.h, len: m.path.length, runs: m.runs.length, px: Math.round(d.run.layers.walls.width * d.run.layers.walls.height / 1e6 * 10) / 10 }; })()");
        console.log(`  ${size}/${branch}: ${info.w}×${info.h} 道のり ${info.len} 板 ${info.runs} 絵 ${info.px}Mpx ${ms}ms`);
        check(ms < 3000, `${size}/${branch}：3 秒以内に始まる（${ms}ms）`);
        await act("pause");
        await act("giveup");
        await startFirst();
      }
    }
    await act("opt", `[data-key="size"][data-v="large"]`);
    await act("go");
    await sleep(800);
    await overview("gen-large", 1600);
  },

  // ボットが、スタートからゴールまで歩く。道すじを進むと、上の道すじ表示が順に変わる
  async solve() {
    await ev(BOT);
    const seeds = Number(opt.seeds || 3);
    for (let k = 0; k < seeds; k++) {
      if (k === 0) await startFirst(); else { await act("reroll"); await sleep(300); }
      const info = await ev(`(() => { const d = window.__fm(), b = d.brief; return { rooms: b.pair.rooms.length, start: b.pair.start.e.name, goal: b.pair.goal.e.name }; })()`);
      await act("go");
      await sleep(700);
      const want = await ev(`(async () => { const t = await import("/file-maze/tree.js"); const d = window.__fm(); return d.run.rooms.map((n) => t.crumbs(n, d.run.root)); })()`);
      const t0 = Date.now();
      const r = await ev(`window.__bot.solve()`);
      console.log(`  迷路 ${k + 1}: ${info.start} → ${info.goal}  道のり ${r.len} マス ${r.ticks} 歩 ${Date.now() - t0}ms`);
      check(r.ok, `迷路 ${k + 1}：ボットがゴールにたどりつく ${r.ok ? "" : JSON.stringify(r)}`);
      if (r.ok) check(JSON.stringify(r.crumbs) === JSON.stringify(want), `迷路 ${k + 1}：道すじの表示が、フォルダの順に変わる（${r.crumbs.length} 回）`);
      if (k === 0) await shot("solve-clear");
      if (!r.ok) break;
      await sleep(200);
      if (k < seeds - 1) await act("next");
    }
  },

  // 画面のつながり：出発前の選択・手がかり・中断・クリア・コインとスタンプ・ショップ・図鑑・記録の保存・マウス
  async flow() {
    await ev(BOT);
    const vis = (sel) => ev(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); return !!e && !e.closest("[hidden]"); })()`);
    const text = (sel) => ev(`document.querySelector(${JSON.stringify(sel)})?.textContent || ""`);
    check((await text("#screen")).includes("Documents") && (await text("#screen")).includes("Downloads"), "はじめの画面に、クイックアクセスのフォルダが並ぶ");
    await startFirst(1);
    check((await text("#screen")).includes("小さすぎ"), "小さい場所は迷路にしない");
    await act("home");
    await startFirst(0);
    const brief = await text("#screen");
    check(brief.includes("出発") && brief.includes("迷路の大きさ") && brief.includes("分かれ道の多さ"), "出発前に、スタートとゴールと、迷路の選択が出る");
    check(!brief.includes("部屋") && !brief.includes("扉"), "出発前の文章に、部屋や扉の話がない");
    const g1 = await FM("d.brief.pair.goal.e.path");
    await act("reroll");
    check(g1 !== await FM("d.brief.pair.goal.e.path"), "べつの組みにすると、ゴールが変わる");
    await act("opt", '[data-key="size"][data-v="small"]');
    check(await FM("d.rec.size") === "small" && await ev(`document.querySelector('[data-key="size"][data-v="small"]').classList.contains("on")`), "迷路の大きさを選ぶと、記録される");
    await act("opt", '[data-key="branch"][data-v="many"]');
    await act("go");
    await sleep(700);
    check(await FM("d.scene") === "play" && await vis("#hud") && await vis("#mm"), "出発すると、上の帯と地図が出る");
    check(await FM("d.play.maze.w") === 21 && await FM("d.play.maze.h") === 13, "選んだ大きさの迷路ができる（小さい 21×13）");
    check((await text("#h-goal")).length > 0 && (await text("#h-crumb")).includes("Documents"), "帯にゴールの名前と、いまの道すじ");
    // キー
    const x0 = await FM("d.play.player.x"), y0 = await FM("d.play.player.y");
    await FM("(d.play.drive({ dx: 1, dy: 0 }), 0)");
    for (let i = 0; i < 40; i++) await FM("(d.play.tick(1 / 60), 0)");
    await FM("(d.play.drive({ dx: 0, dy: 1 }), 0)");
    for (let i = 0; i < 40; i++) await FM("(d.play.tick(1 / 60), 0)");
    await FM("(d.play.drive(null), 0)");
    check(await FM("d.play.moved") > 0 && (await FM("d.play.player.x") !== x0 || await FM("d.play.player.y") !== y0), "キーで歩ける");
    // 手がかり
    const before = await FM("d.run.hintsLeft");
    await act("hint");
    check(await FM("d.run.hintsLeft") === before - 1 && (await text("#h-hint")).includes(String(before - 1)), "手がかりを使うと、残りが減る");
    for (let i = 0; i < 4; i++) await act("hint");
    check(await FM("d.run.hintsLeft") === 0 && await ev(`document.getElementById("h-hint").disabled`), "使い切ると押せない");
    // 中断
    await act("pause");
    check(await FM("d.scene") === "pause" && (await text("#screen")).includes("中断"), "中断の画面");
    check(await ev(`document.getElementById("mm").hidden`), "中断中は地図を隠す");
    await sleep(1500);
    await act("resume");
    check(await FM("d.scene") === "play" && await FM("d.run.pausedMs") >= 1400, "つづける。中断のあいだは時間に数えない");
    // マウスの押しっぱなし：いまの升から、通路のある向きへ
    await ev(`(async () => { const d = window.__fm(), mz = await import("/file-maze/maze.js"), m = d.play.maze, p = d.play.player;
      const c = mz.cellNear(m, p.x, p.y); const dirs = [[mz.RIGHT, 1, 0], [mz.LEFT, -1, 0], [mz.DOWN, 0, 1], [mz.UP, 0, -1]].filter(([b]) => m.open[c] & b);
      const [, dx, dy] = dirs[0], v = d.play.view, cv = d.play.canvas, r = cv.getBoundingClientRect();
      const wx = p.x + dx * 80, wy = p.y + dy * 80;
      window.__m0 = d.play.moved;
      cv.dispatchEvent(new PointerEvent("pointerdown", { button: 0, clientX: r.left + (wx - v.camX) * v.s, clientY: r.top + (wy - v.camY) * v.s, pointerId: 77, bubbles: true })); })()`);
    await sleep(500);
    await ev(`window.__fm().play.canvas.dispatchEvent(new PointerEvent("pointerup", { button: 0, pointerId: 77, bubbles: true }))`);
    check(await FM("d.play.moved") > await ev("window.__m0") + 20, "マウスの押しっぱなしでも歩ける");
    // 壁は通れない：ボットが道すじを歩くあいだ、一度も壁の中に入らない（isWall を毎歩確かめる）
    const r = await ev(`window.__bot.solve()`);
    check(r.ok, "ボットがゴールにたどりつく");
    await sleep(300);
    check(await FM("d.scene") === "clear" && (await text("#screen")).includes("たどりついた") && (await text("#screen")).includes("マス"), "クリアの画面");
    check(await FM("d.rec.coins") > 0 && await FM("d.rec.total.clears") === 1 && await FM("Object.keys(d.rec.stamps).length") === 1, "コインと記録とスタンプが入る");
    await shot("flow-clear");
    await act("openGoal");
    check(await ev(`window.__log.some((l) => l.startsWith("open ") && l.endsWith("newTab"))`), "ゴールのフォルダを新しいタブで開く");
    // ショップ
    await act("home");
    await FM("(d.rec.coins = 500, 0)");
    await act("shop");
    check((await text("#screen")).includes("ショップ") && (await ev(`document.querySelectorAll("canvas[data-shape]").length`)) === 6, "ショップに駒が6つ");
    await act("buy", '[data-kind="theme"][data-id="ai"]');
    check(await FM("d.rec.theme") === "ai" && await FM("d.rec.coins") === 420, "壁の色を買うと、すぐ使う");
    await act("buy", '[data-kind="skin"][data-id="neko"]');
    check(await FM("d.rec.skin") === "neko" && await FM("d.rec.coins") === 270, "駒を買うと、すぐ使う");
    await act("equip", '[data-kind="skin"][data-id="kaku"]');
    check(await FM("d.rec.skin") === "kaku", "持っている駒に付けかえる");
    await act("home");
    await act("book");
    check((await text("#screen")).includes("図鑑") && await ev(`document.querySelectorAll(".stamp.got").length`) === 1, "図鑑にスタンプが1つ");
    check(await ev(`(async () => { const v = await window.explorerPlus.storage.get("rec"); return v && v.coins === window.__fm().rec.coins && v.owned.skins.includes("neko") && v.size === "small" && v.branch === "many"; })()`), "記録が ep.storage に保存される（迷路の選択も）");
    // 色を変えたあとの迷路
    await act("home");
    await startFirst(0);
    await act("go");
    await sleep(800);
    await shot("flow-ai-theme");
    await act("pause");
    await act("giveup");
    check(await FM("d.scene") === "home" && await ev(`document.getElementById("mm").hidden`), "あきらめるとはじめの画面");
  },
};

try {
  await boot();
  await SCENARIOS[scenario]();
} catch (e) {
  console.log("失敗:", e.message);
  process.exitCode = 1;
} finally {
  console.log(logs.length ? "コンソール:\n  " + logs.join("\n  ") : "コンソール: 出力なし");
  cleanup();
  process.exit(process.exitCode || 0);
}

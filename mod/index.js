// ファイル迷路 — ファイル名が壁に刻まれた迷路。新しいファイルから、古いファイルまで抜ける。
// 迷路はふつうに作る（分かれ道・行き止まりあり）。階層は、壁に刻む名前と、上の道すじの表示にだけ使う。
// ファイルには一切さわらない：読むのは名前・種類・大きさ・更新日時だけで、中身は読まず、書き換え・移動・削除もしない。通信もしない。
import { adopt, collectFiles, pickPair, poolOf, keyOf, hashStr, rng } from "./tree.js";
import { THEMES, SKINS, HINTS, normalizeRec, applyClear, buy, equip } from "./rewards.js";
import { SIZES, BRANCH, makeMaze, cellNear } from "./maze.js";
import { drawLayers } from "./draw.js";
import { createPlay } from "./play.js";
import { createUi } from "./ui.js";

const ep = window.explorerPlus;
const debug = new URL(import.meta.url).searchParams.has("debug");
const HINT_CELLS = 14;       // 手がかりで光る道すじの長さ（マス）

// ---- 状態 ----------------------------------------------------------------
await ep.ready();
let s = await ep.settings.get();
const rec = normalizeRec(await ep.storage.get("rec"));
const save = () => ep.storage.set("rec", rec).catch((err) => console.warn("記録を保存できませんでした", err.message));

let scene = "home";          // "home" | "loading" | "brief" | "play" | "pause" | "clear" | "shop" | "book"
let roots = [];              // クイックアクセスのフォルダ
let brief = null;            // 出発前：{ entry, root, pair }
let run = null;              // 遊んでいる迷路
let runSeq = 0;

const themeOf = () => THEMES.find((t) => t.id === rec.theme) || THEMES[0];
const skinOf = () => SKINS.find((k) => k.id === rec.skin) || SKINS[0];

const ui = createUi(document.body, { act });
const play = createPlay(ui.stage, { onGoal, onRegion, onEsc, onHint: () => act("hint"), onStall });
play.setSettings(s);
look();
ep.onSettings((next) => { s = next; play.setSettings(s); });

function look() {
  ui.theme(themeOf());
  play.setTheme(themeOf(), skinOf());
}

// ---- はじめの画面・出発前 --------------------------------------------------------
async function loadRoots() {
  try {
    roots = (await ep.quickAccess.list()).filter((e) => e.kind === "folder" && e.path);
  } catch (err) {
    console.warn("クイックアクセスを読めませんでした", err.message);
    roots = [];
  }
}
ep.onQuickAccess(() => loadRoots().then(() => { if (scene === "home") showHome(); }));

function showHome(msg = "") {
  scene = "home";
  play.pause(true);
  play.clear();
  ui.hud.stop();
  ui.home({ rec, roots, msg });
}

async function chooseRoot(entry) {
  if (!entry) return;
  scene = "loading";
  ui.loading(`${entry.name} を調べています`);
  try {
    const api = await ep.getTree({ depth: s.treeDepth || 4, from: { id: entry.id, path: entry.path } });
    brief = { entry, root: adopt(api), pair: null };
  } catch (err) {
    console.warn(`${entry.path} を調べられませんでした`, err.message);
    return showHome(`調べられませんでした：${err.message}`);
  }
  newPair();
}

function newPair() {
  const rnd = rng((Math.random() * 4294967296) >>> 0);
  brief.pair = pickPair(brief.root, { rnd, cleared: rec.clears });
  scene = "brief";
  if (!brief.pair) return ui.tooSmall(brief.entry);
  showBrief();
}

const showBrief = () => ui.brief({ entry: brief.entry, files: collectFiles(brief.root).length, pair: brief.pair, rec });

// ---- 迷路 ---------------------------------------------------------------------
// 迷路を作って、壁にファイル名を刻み、スタートの升から始める
async function startRun() {
  const { entry, root, pair } = brief;
  scene = "loading";
  ui.loading("迷路を作っています");
  await new Promise((r) => requestAnimationFrame(() => r()));
  const t0 = performance.now();
  const seed = (Math.random() * 4294967296) >>> 0;
  const [w, h] = SIZES[rec.size] || SIZES.normal;
  const maze = makeMaze({ w, h, rnd: rng(seed), newest: BRANCH[rec.branch] ?? BRANCH.normal, regions: pair.rooms.length });
  run = {
    id: ++runSeq, entry, root, start: pair.start, goal: pair.goal, rooms: pair.rooms, maze, seed, len: maze.path.length,
    hintsLeft: HINTS, hintsUsed: 0, t0: 0, pausedMs: 0, pauseAt: 0,
  };
  run.layers = paint();
  console.log(`迷路 ${w}×${h}：道のり ${run.len} マス 区域 ${maze.regions} ${Math.round(performance.now() - t0)}ms`);
  play.setMaze(maze, run.layers);
  run.t0 = performance.now();
  ui.hide();
  ui.hud.start(run);
  scene = "play";
  play.pause(false);
}

// 区域ごとの名前（そのフォルダのファイル名）を壁に刻んだ絵
function paint() {
  const { maze, rooms, start, goal } = run;
  return drawLayers({
    maze, theme: themeOf(), seed: run.seed ^ hashStr(run.entry.path),
    pools: rooms.map(poolOf), labels: rooms.map((n) => n.e.name),
    forced: { start: start.e.name, goal: goal.e.name }, dpr: window.devicePixelRatio || 1,
  });
}

const elapsed = () => (performance.now() - run.t0 - run.pausedMs) / 1000;

// 区域（フォルダ）が変わった：上の道すじの表示を変える
function onRegion(k) {
  if (run) ui.hud.crumb(run.rooms[k], run.root);
}

function onGoal() {
  if (scene !== "play") return;
  scene = "clear";
  play.pause(true);
  const seconds = elapsed();
  const goal = { key: keyOf(run.goal.e), name: run.goal.e.name, ext: run.goal.e.ext };
  const res = applyClear(rec, { goal, len: run.len, seconds, hintsUsed: run.hintsUsed });
  save();
  ui.hud.stop();
  ui.clear({ goal: run.goal, len: run.len, seconds, hintsUsed: run.hintsUsed, res, rec });
}

function onEsc() {
  if (scene === "play") act("pause");
  else if (scene === "pause") act("resume");
}

// 別のタブにいた間は、時間に数えない
function onStall(gapMs) {
  if (scene !== "play") return;
  act("pause");
  run.pauseAt -= gapMs;
}

// 手がかり：いまの場所からゴールまでの道すじの、先の部分が光る
function useHint() {
  if (scene !== "play") return;
  if (run.hintsLeft <= 0) return ui.toast("手がかりは使い切りました");
  const { maze } = run;
  const cells = [];
  for (let c = cellNear(maze, play.player.x, play.player.y); c !== maze.goal && cells.length < HINT_CELLS;) {
    c = maze.toGoal[c];
    cells.push(c);
  }
  play.hint(cells);
  run.hintsLeft--;
  run.hintsUsed++;
  ui.hud.hints(run.hintsLeft);
  ui.toast("光っている道すじが、ゴールへの道です");
}

// ---- 操作 ---------------------------------------------------------------------
async function act(a, d = {}) {
  switch (a) {
    case "home": return showHome();
    case "root": return chooseRoot(roots[Number(d.i)]);
    case "reroll": return newPair();
    case "go": return startRun();
    case "next": return newPair();
    case "opt":
      if ((d.key === "size" && d.v in SIZES) || (d.key === "branch" && d.v in BRANCH)) { rec[d.key] = d.v; save(); }
      return scene === "brief" && brief.pair ? showBrief() : undefined;
    case "hint": return useHint();
    case "pause":
      if (scene !== "play") return;
      scene = "pause";
      run.pauseAt = performance.now();
      play.pause(true);
      return ui.pause();
    case "resume":
      if (scene !== "pause") return;
      run.pausedMs += performance.now() - run.pauseAt;
      ui.hide();
      scene = "play";
      return play.pause(false);
    case "giveup": return showHome();
    case "openGoal":
      return ep.open(run.goal.parent.e, { newTab: true }).catch((err) => ui.toast(`開けませんでした：${err.message}`));
    case "shop": scene = "shop"; return ui.shop({ rec });
    case "book": scene = "book"; return ui.book({ rec });
    case "buy": {
      const r = buy(rec, d.kind, d.id);
      if (r.ok) { save(); look(); }
      return ui.shop({ rec, msg: r.ok ? "" : r.why });
    }
    case "equip":
      if (equip(rec, d.kind, d.id)) { save(); look(); }
      return ui.shop({ rec });
  }
}

setInterval(() => { if (scene === "play" && run) ui.hud.time(elapsed()); }, 250);

// ---- コマンド -----------------------------------------------------------------
ep.commands.set([
  { id: "home", label: "はじめの画面にもどる" },
  { id: "reroll", label: "べつの迷路にする" },
]);
ep.onCommand(async (id) => {
  if (id === "home") {
    if (scene === "play") act("pause");
    else if (scene !== "home") showHome();
  } else if (id === "reroll") {
    if (scene === "brief" && brief) newPair();
    else if (scene === "play" || scene === "pause" || scene === "clear") {
      if (scene === "play") act("pause");
      if (scene === "clear" || (await ep.ui.confirm("今の迷路をやめて、べつの迷路にしますか？", { okLabel: "やめる" }))) { if (brief) newPair(); }
    }
  }
});

// ---- はじめ -------------------------------------------------------------------
await loadRoots();
showHome();

if (debug) window.__fm = () => ({ play, ui, rec, get run() { return run; }, get scene() { return scene; }, get brief() { return brief; }, act, useHint, themes: THEMES });

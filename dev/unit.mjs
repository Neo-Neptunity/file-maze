// ファイル迷路 — 画面を持たない部品の試験。node だけで動く。
//   使い方：node file-maze/dev/unit.mjs
import fs from "node:fs";
import path from "node:path";
import { stage, MOD_DIR } from "./stage.mjs";

const st = stage("unit");
const tree = await import(st.url("tree.js"));
const mz = await import(st.url("maze.js"));
const rw = await import(st.url("rewards.js"));
const { fakeRoot } = await import("./fake-tree.mjs");

let fail = 0, total = 0;
const ok = (cond, msg) => { total++; if (!cond) { fail++; console.log("  NG", msg); } };
const eq = (a, b, msg) => ok(JSON.stringify(a) === JSON.stringify(b), `${msg}（${JSON.stringify(a)} ≠ ${JSON.stringify(b)}）`);
const section = (s) => console.log(s);

// ---- 乱数と ID ----------------------------------------------------------------
section("乱数");
{
  const a = tree.rng(7), b = tree.rng(7), c = tree.rng(8);
  const xs = [a(), a(), a()], ys = [b(), b(), b()], zs = [c(), c(), c()];
  eq(xs, ys, "同じ種なら同じ並び");
  ok(JSON.stringify(xs) !== JSON.stringify(zs), "種がちがえば別の並び");
  ok(xs.every((v) => v >= 0 && v < 1), "0 以上 1 未満");
  ok(tree.hashStr("議事録") === tree.hashStr("議事録") && tree.hashStr("a") !== tree.hashStr("b"), "ハッシュ");
  eq([...tree.shuffled([1, 2, 3, 4, 5, 6], tree.rng(3))].sort(), [1, 2, 3, 4, 5, 6], "シャッフルは並べかえるだけ");
}

// ---- 階層 ---------------------------------------------------------------------
section("階層");
const root = tree.adopt(fakeRoot());
{
  const names = tree.dirsOf(root).map((d) => d.e.name);
  ok(!names.includes(".secret") && !names.includes("node_modules"), "隠しフォルダと node_modules は数えない");
  ok(names.includes("仕事") && names.includes("写真"), "ふつうのフォルダは数える");
  const all = tree.collectFiles(root);
  ok(all.length > 40 && all.every((f) => f.e.kind === "file"), "ファイルを全部集める");
  ok(tree.countDirs(root) >= 12, "フォルダを数える");
  eq(tree.dirsOf(tree.dirsOf(root)[0])[0].depth, 2, "深さは親より 1 つ深い");
}

section("道すじのフォルダ");
{
  const all = tree.collectFiles(root);
  const a = all.find((f) => f.e.path.includes("\\仕事\\2019\\請求書\\"));
  const b = all.find((f) => f.e.path.includes("\\仕事\\2020\\企画\\旧案\\"));
  eq(tree.roomsBetween(a, b).map((r) => r.e.name), ["請求書", "2019", "仕事", "2020", "企画", "旧案"], "共通の親まで登って、降りる");
  eq(tree.roomsBetween(a, a).map((r) => r.e.name), ["請求書"], "同じファイルなら 1 つ");
  eq(tree.crumbs(tree.dirsOf(tree.dirsOf(root)[0])[0], root), "Documents › 仕事 › 2019", "道すじの文字");
}

section("スタートとゴールの組み");
{
  const pair = tree.pickPair(root, { rnd: tree.rng(1) });
  ok(pair && pair.start !== pair.goal, "組みが決まる");
  ok(pair.rooms.length >= 2 && pair.rooms.length <= 8, `道すじのフォルダ数が範囲に入る（${pair.rooms.length}）`);
  ok(pair.start.e.modified > pair.goal.e.modified, "スタートはゴールより新しい");
  const files = tree.collectFiles(root).sort((x, y) => y.e.modified - x.e.modified);
  ok(files.slice(0, Math.ceil(files.length * 0.2)).includes(pair.start), "スタートは新しいほうの 2 割から");
  ok(files.slice(files.length - Math.ceil(files.length * 0.5)).includes(pair.goal), "ゴールは古いほうの半分から");
  eq(tree.pickPair(root, { rnd: tree.rng(1) }).goal.e.path, pair.goal.e.path, "同じ種なら同じ組み");
  const cleared = {};
  const gs = new Set();
  for (let s = 1; s <= 30; s++) { const p = tree.pickPair(root, { rnd: tree.rng(s), cleared }); gs.add(p.goal.e.path); cleared[tree.keyOf(p.goal.e)] = { n: 1 }; }
  ok(gs.size >= 20, `クリア済みのゴールは避ける（${gs.size}/30 がちがうゴール）`);
  const small = tree.adopt({ entry: { id: "1", name: "x", path: "C:\\x", kind: "folder", ext: "", hidden: false }, children: [] });
  eq(tree.pickPair(small, { rnd: tree.rng(1) }), null, "小さすぎる場所では組みを作らない");
  const bogus = tree.adopt({ entry: { id: "1", name: "x", path: "C:\\x", kind: "folder", ext: "", hidden: false }, children: Array.from({ length: 12 }, (_, i) => ({ entry: { id: String(i + 2), name: `f${i}.zip`, path: `C:\\x\\f${i}.zip`, kind: "file", ext: "zip", hidden: false, modified: Date.UTC(1980, 0, 1) } })) });
  eq(tree.pickPair(bogus, { rnd: tree.rng(1) }), null, "1980 年の日付なしは古さに数えない");
}

section("壁に刻む名前");
{
  const work = tree.dirsOf(root).find((d) => d.e.name === "仕事");
  const pool = tree.poolOf(work);
  ok(pool.length >= 3, "ファイルが少なければ、フォルダ名も足す");
  const photos = tree.dirsOf(root).find((d) => d.e.name === "写真");
  ok(tree.poolOf(photos).every((n) => typeof n === "string" && n.length), "名前は文字");
  const empty = tree.dirsOf(root).find((d) => d.e.name === "からっぽ");
  eq(tree.poolOf(empty), ["からっぽ"], "空のフォルダは、フォルダ自身の名前");
}

section("表示の文字");
{
  const now = Date.UTC(2026, 9, 24);
  eq(tree.ageText(now - 3 * 86400000, now), "3日前", "日数");
  eq(tree.ageText(now - 90 * 86400000, now), "3か月前", "か月");
  eq(tree.ageText(now - 800 * 86400000, now), "2年前", "年");
  eq(tree.fmtTime(75), "1:15", "時間");
  eq(tree.fmtSize(1536), "1.5KB", "大きさ");
}

// ---- 迷路 ---------------------------------------------------------------------
section("迷路の生成");
const edgeCount = (open, w, h) => { let n = 0; for (let c = 0; c < w * h; c++) { if (open[c] & mz.RIGHT) n++; if (open[c] & mz.DOWN) n++; } return n; };
{
  for (const [w, h] of [[2, 2], [5, 4], [21, 13], [31, 19]]) {
    const open = mz.generate(w, h, tree.rng(w * 100 + h), 0.55);
    const { dist } = mz.bfs(open, w, h, 0);
    ok(dist.every((d) => d >= 0), `${w}×${h}：全部の升に行ける`);
    eq(edgeCount(open, w, h), w * h - 1, `${w}×${h}：輪のない迷路（通路の数 = 升の数 − 1）`);
    let sym = true;
    for (let c = 0; c < w * h; c++) {
      const x = c % w, y = (c / w) | 0;
      if ((open[c] & mz.RIGHT) && !(open[c + 1] & mz.LEFT)) sym = false;
      if ((open[c] & mz.DOWN) && !(open[c + w] & mz.UP)) sym = false;
      if ((open[c] & mz.LEFT) && x === 0) sym = false;
      if ((open[c] & mz.UP) && y === 0) sym = false;
    }
    ok(sym, `${w}×${h}：通路は両側から開いていて、外へは出ない`);
  }
  eq(Array.from(mz.generate(21, 13, tree.rng(5), 0.55)), Array.from(mz.generate(21, 13, tree.rng(5), 0.55)), "同じ種なら同じ迷路");
  ok(JSON.stringify(Array.from(mz.generate(21, 13, tree.rng(5), 0.55))) !== JSON.stringify(Array.from(mz.generate(21, 13, tree.rng(6), 0.55))), "種がちがえば別の迷路");

  // 分かれ道の多さ：「おおめ」のほうが行き止まりが多い
  const dead = (newest) => { let n = 0; for (let s = 1; s <= 12; s++) n += mz.deadEnds(mz.makeMaze({ w: 31, h: 19, rnd: tree.rng(s), newest })); return n / 12; };
  const few = dead(mz.BRANCH.few), mid = dead(mz.BRANCH.normal), many = dead(mz.BRANCH.many);
  ok(few < mid && mid < many, `分かれ道：すくなめ ${few.toFixed(0)} < ふつう ${mid.toFixed(0)} < おおめ ${many.toFixed(0)}（行き止まりの数）`);
  ok(mid > 589 * 0.08, `ふつうでも、行き止まりが十分ある（${mid.toFixed(0)}）`);
}

section("スタートとゴール・道すじ");
{
  for (let seed = 1; seed <= 20; seed++) {
    const m = mz.makeMaze({ w: 31, h: 19, rnd: tree.rng(seed), regions: 5 });
    const d = mz.bfs(m.open, m.w, m.h, m.start).dist;
    ok(m.path[0] === m.start && m.path[m.path.length - 1] === m.goal, `迷路 ${seed}：道はスタートからゴールまで`);
    eq(m.path.length, d[m.goal] + 1, `迷路 ${seed}：道は最短（1 本しかない）`);
    ok(Math.max(...d) === d[m.goal], `迷路 ${seed}：ゴールは、スタートからいちばん遠い升の 1 つ`);
    let step = true;
    for (let i = 1; i < m.path.length; i++) {
      const a = m.path[i - 1], b = m.path[i], diff = b - a;
      const bit = diff === 1 ? mz.RIGHT : diff === -1 ? mz.LEFT : diff === m.w ? mz.DOWN : diff === -m.w ? mz.UP : 0;
      if (!bit || !(m.open[a] & bit)) step = false;
    }
    ok(step, `迷路 ${seed}：道の隣どうしは、通路でつながっている`);
    // toGoal をたどればゴールに着く
    let c = m.start, n = 0;
    while (c !== m.goal && n++ < 5000) c = m.toGoal[c];
    ok(c === m.goal && n === m.path.length - 1, `迷路 ${seed}：toGoal をたどるとゴールに着く`);
  }
  const m = mz.makeMaze({ w: 31, h: 19, rnd: tree.rng(3) });
  ok(m.path.length >= 60, `ふつうの大きさなら、道のりは十分長い（${m.path.length} マス）`);
  const s = mz.makeMaze({ w: 21, h: 13, rnd: tree.rng(3) }), l = mz.makeMaze({ w: 41, h: 25, rnd: tree.rng(3) });
  ok(s.path.length < l.path.length, `大きい迷路のほうが、道のりが長い（${s.path.length} < ${l.path.length}）`);
}

section("区域（フォルダ）の割りふり");
{
  for (const N of [1, 2, 4, 7]) {
    const m = mz.makeMaze({ w: 31, h: 19, rnd: tree.rng(10 + N), regions: N });
    eq(m.regions, N, `${N} 区域：区域の数`);
    ok(m.region.every((r) => r >= 0 && r < N), `${N} 区域：全部の升がどこかの区域に入る`);
    let mono = true;
    for (let i = 1; i < m.path.length; i++) if (m.region[m.path[i]] < m.region[m.path[i - 1]]) mono = false;
    ok(mono, `${N} 区域：道を進むと、区域は順に進む`);
    eq(m.region[m.path[0]], 0, `${N} 区域：スタートは最初の区域`);
    eq(m.region[m.path[m.path.length - 1]], N - 1, `${N} 区域：ゴールは最後の区域`);
    const counts = new Array(N).fill(0);
    for (const c of m.path) counts[m.region[c]]++;
    ok(Math.max(...counts) - Math.min(...counts) <= 1, `${N} 区域：道は、ほぼ同じ長さに区切られる（${counts.join(",")}）`);
    // 行き止まりの枝は、道につながっている所の区域
    const onPath = new Set(m.path);
    let branchOk = true;
    for (let c = 0; c < m.w * m.h; c++) {
      if (onPath.has(c)) continue;
      let cur = c, guard = 0;
      while (!onPath.has(cur) && guard++ < 5000) cur = m.toGoal[cur];
      // cur は、枝が道につながっている升。ただし toGoal は道に着いたあとゴールへ向かうので、最初に道に入った升
      if (m.region[c] !== m.region[cur]) branchOk = false;
    }
    ok(branchOk, `${N} 区域：枝は、つながっている所の区域に入る`);
    ok(m.mid.every((c) => c != null && onPath.has(c)), `${N} 区域：床の名前を出す場所は、道の上`);
  }
  const tiny = mz.makeMaze({ w: 3, h: 3, rnd: tree.rng(1), regions: 99 });
  ok(tiny.regions <= tiny.path.length, "区域の数は、道の長さをこえない");
}

section("形：座標と壁");
{
  const m = mz.makeMaze({ w: 21, h: 13, rnd: tree.rng(4), regions: 3 });
  eq(m.W, 21 * mz.PITCH + mz.WALL, "世界の幅");
  let centersFree = true, hallsFree = true, wallsSolid = true, jointsSolid = true;
  for (let c = 0; c < m.w * m.h; c++) {
    const p = mz.cellCenter(m, c);
    if (mz.isWall(m, p.x, p.y) || !mz.canStand(m, p.x, p.y)) centersFree = false;
    if (mz.cellNear(m, p.x, p.y) !== c) centersFree = false;
    const x = c % m.w, y = (c / m.w) | 0;
    // 隣との境（壁の厚みの真ん中）：通路なら空き、そうでなければ壁
    const east = { x: p.x + mz.PITCH / 2, y: p.y }, south = { x: p.x, y: p.y + mz.PITCH / 2 };
    if (x < m.w - 1 && mz.isWall(m, east.x, east.y) !== !(m.open[c] & mz.RIGHT)) hallsFree = false;
    if (y < m.h - 1 && mz.isWall(m, south.x, south.y) !== !(m.open[c] & mz.DOWN)) hallsFree = false;
    // 柱（つなぎ目）はいつも壁
    if (!mz.isWall(m, x * mz.PITCH + 3, y * mz.PITCH + 3)) jointsSolid = false;
  }
  ok(centersFree, "どの升の真ん中にも立てる");
  ok(hallsFree, "壁の厚みの真ん中は、通路なら空き・そうでなければ壁");
  ok(jointsSolid, "柱はいつも壁");
  ok(mz.isWall(m, -1, 10) && mz.isWall(m, m.W + 1, 10) && mz.isWall(m, 10, m.H + 5), "世界の外は壁");
  ok(mz.isWall(m, 5, 5) && mz.isWall(m, m.W - 5, m.H - 5), "外の壁");
}

section("歩く");
{
  // 道すじを升の真ん中どうしで歩く：ちゃんと着く
  for (let seed = 1; seed <= 8; seed++) {
    const m = mz.makeMaze({ w: 31, h: 19, rnd: tree.rng(seed + 50), regions: 4 });
    const p = { ...mz.cellCenter(m, m.start) };
    let stuck = false;
    for (const c of m.path.slice(1)) {
      const t = mz.cellCenter(m, c);
      for (let n = 0; n < 200 && Math.hypot(t.x - p.x, t.y - p.y) > 1; n++) {
        const dx = t.x - p.x, dy = t.y - p.y, d = Math.hypot(dx, dy);
        const before = { ...p };
        mz.stepMove(m, p, (dx / d) * 3, (dy / d) * 3);
        if (before.x === p.x && before.y === p.y) { stuck = true; break; }
      }
      if (stuck) break;
    }
    const g = mz.cellCenter(m, m.goal);
    ok(!stuck && Math.hypot(g.x - p.x, g.y - p.y) < 2, `迷路 ${seed}：道すじを歩いて、ゴールに着く`);
  }
  // 壁は通れない：通路のない向きへ押し続けても、壁の手前で止まる
  const m = mz.makeMaze({ w: 21, h: 13, rnd: tree.rng(9) });
  let leaks = 0;
  for (let c = 0; c < m.w * m.h; c++) {
    for (const [bit, dx, dy] of [[mz.UP, 0, -1], [mz.RIGHT, 1, 0], [mz.DOWN, 0, 1], [mz.LEFT, -1, 0]]) {
      if (m.open[c] & bit) continue;
      const p = { ...mz.cellCenter(m, c) };
      for (let i = 0; i < 40; i++) mz.stepMove(m, p, dx * 3, dy * 3);
      if (mz.cellNear(m, p.x, p.y) !== c) leaks++;
    }
  }
  eq(leaks, 0, "壁のある向きへ押し続けても、となりの升へは出られない");
  const q = { ...mz.cellCenter(m, 0) };
  mz.stepMove(m, q, 2.5, 0);
  ok(q.x > mz.cellCenter(m, 0).x || !(m.open[0] & mz.RIGHT), "小数の歩みも動く");
  // 壁に沿ってすべる：横の壁に当たっていても、縦には動ける
  const r = { ...mz.cellCenter(m, 0) };
  const y0 = r.y;
  mz.stepMove(m, r, -50, 4);
  ok(r.y >= y0 && r.x >= mz.WALL + mz.HALF - 0.01, "壁に当たっても、ほかの軸にはすべれる");
}

section("壁の板（名前を刻む）");
{
  const m = mz.makeMaze({ w: 31, h: 19, rnd: tree.rng(6), regions: 4 });
  // 閉じている壁の区画は、すべて、ちょうど 1 枚の板に入る
  let closed = 0, mapped = 0;
  for (let j = 0; j <= m.h; j++) for (let i = 0; i < m.w; i++) {
    const wall = j === 0 || j === m.h || !(m.open[(j - 1) * m.w + i] & mz.DOWN);
    if (wall) { closed++; if (m.segRun.has(`h${i},${j}`)) mapped++; } else if (m.segRun.has(`h${i},${j}`)) mapped = -1e9;
  }
  for (let i = 0; i <= m.w; i++) for (let j = 0; j < m.h; j++) {
    const wall = i === 0 || i === m.w || !(m.open[j * m.w + i - 1] & mz.RIGHT);
    if (wall) { closed++; if (m.segRun.has(`v${i},${j}`)) mapped++; } else if (m.segRun.has(`v${i},${j}`)) mapped = -1e9;
  }
  eq(mapped, closed, "閉じた壁の区画は、すべて板に入っていて、開いた所は入っていない");
  ok(m.runs.every((r) => r.text.w > 0 && r.text.h > 0 && r.text.x >= r.rect.x && r.text.y >= r.rect.y && r.text.x + r.text.w <= r.rect.x + r.rect.w && r.text.y + r.text.h <= r.rect.y + r.rect.h), "文字を置く範囲は、板の中");
  ok(m.runs.some((r) => r.dir === "h" && r.to - r.from >= 3) && m.runs.some((r) => r.dir === "v" && r.to - r.from >= 2), "つながった壁は、長い板になる");
  ok(m.runs.every((r) => m.region[r.cell] >= 0), "板が属する区域が決まる");
  // スタートとゴールのまわりの壁
  const sw = mz.wallsAround(m, m.start), gw = mz.wallsAround(m, m.goal);
  ok(sw.length >= 1 && sw.length <= 3 && gw.length >= 1 && gw.length <= 3, "スタートとゴールは、行き止まりなので、壁が 1〜3 枚（出口の分は開いている）");
  // 全部の板の面積が、壁の面積と合う（重なりは柱だけ）
  const sumA = m.runs.reduce((a, r) => a + r.rect.w * r.rect.h, 0);
  ok(sumA > m.W * m.H * 0.2 && sumA < m.W * m.H * 0.6, `壁の面積は、世界の 2〜6 割（${(sumA / (m.W * m.H)).toFixed(2)}）`);
}

// ---- 報酬 ---------------------------------------------------------------------
section("報酬");
{
  const first = rw.coinsFor({ len: 120, seconds: 100, hintsUsed: 0, first: true });
  const slow = rw.coinsFor({ len: 120, seconds: 1200, hintsUsed: 2, first: true });
  const again = rw.coinsFor({ len: 120, seconds: 100, hintsUsed: 0, first: false });
  ok(first.coins > slow.coins, "早く・手がかりなしのほうが多い");
  eq(slow.coins, 20 + 60, "遅くて手がかりを使っても、基本は出る");
  ok(again.coins >= 1 && again.coins < first.coins * 0.2, "同じゴールのやり直しは少ない");
  ok(rw.coinsFor({ len: 200, seconds: 300, hintsUsed: 0, first: true }).coins > rw.coinsFor({ len: 60, seconds: 100, hintsUsed: 0, first: true }).coins, "長い道のりのほうが多い");

  const rec = rw.defaultRec();
  const g = { key: "42", name: "旅行メモ.docx", ext: "docx" };
  const a = rw.applyClear(rec, { goal: g, len: 100, seconds: 100, hintsUsed: 1 });
  ok(a.first && a.newStamp && a.title === "はじめの一歩", "最初のクリア：スタンプと称号");
  eq(rec.coins, a.coins, "コインが入る");
  eq(rec.total.clears, 1, "クリア数");
  eq(rec.total.len, 100, "歩いた道のり");
  const b = rw.applyClear(rec, { goal: g, len: 100, seconds: 80, hintsUsed: 0 });
  ok(!b.first && !b.newStamp && b.best && b.title === null, "二度目：新しいスタンプなし、記録は更新");
  eq(rec.clears["42"].n, 2, "回数");
  eq(rec.clears["42"].best, 80, "最短");
  ok(rw.titleFor(0) === "旅立ち前" && rw.titleFor(5) === "迷子の常連" && rw.titleFor(99) === "ファイルの案内人" && rw.titleFor(100) === "迷路の主", "称号");
  eq(rw.nextTitle(100), null, "最後の称号のあと");
  eq(rw.nextTitle(0)[0], 1, "次の称号");
  rw.applyClear(rec, { goal: { key: "7", name: "Makefile", ext: "" }, len: 80, seconds: 50, hintsUsed: 3 });
  ok(rec.stamps["-"], "拡張子の無いファイルも「-」で図鑑に入る");

  const r2 = rw.defaultRec();
  eq(rw.buy(r2, "skin", "maru"), { ok: false, why: "コインが足りません" }, "足りないと買えない");
  r2.coins = 100;
  ok(rw.buy(r2, "skin", "maru").ok && r2.coins === 70 && r2.skin === "maru", "買うと、コインが減って、すぐ使う");
  eq(rw.buy(r2, "skin", "maru").why, "もう持っています", "二重に買えない");
  ok(rw.equip(r2, "skin", "kaku") && r2.skin === "kaku", "持っているものは付けかえられる");
  ok(!rw.equip(r2, "theme", "yako"), "持っていないものは付けられない");
  ok(rw.buy(r2, "theme", "kami").ok && r2.theme === "kami", "壁の色も買える");
  eq(rw.buy(r2, "theme", "zzz").why, "ないものです", "知らない品");

  for (const raw of [null, undefined, 5, "x", [], { coins: -3, owned: { skins: ["zzz"], themes: 7 }, skin: "zzz", theme: 3, size: "huge", branch: 1, total: { clears: "a" } }]) {
    const n = rw.normalizeRec(raw);
    ok(n.coins >= 0 && n.owned.skins.includes("kaku") && n.owned.themes.includes("sumi") && n.skin === "kaku" && n.theme === "sumi" && n.total.clears === 0 && n.size === "normal" && n.branch === "normal", `壊れた記録を直す ${JSON.stringify(raw)}`);
  }
  const keep = rw.normalizeRec({ coins: 12.7, owned: { skins: ["kaku", "neko"], themes: ["sumi", "ai"] }, skin: "neko", theme: "ai", size: "large", branch: "many", clears: { a: { n: 1 } } });
  ok(keep.coins === 12 && keep.skin === "neko" && keep.theme === "ai" && keep.size === "large" && keep.branch === "many" && keep.clears.a.n === 1, "正しい記録はそのまま");
  ok(new Set(rw.THEMES.map((t) => t.id)).size === rw.THEMES.length && new Set(rw.SKINS.map((t) => t.id)).size === rw.SKINS.length, "品の id は重ならない");
  ok(rw.THEMES[0].cost === 0 && rw.SKINS[0].cost === 0, "最初の品は無料");
  ok(Object.keys(rw.SIZE_NAMES).every((k) => k in mz.SIZES) && Object.keys(rw.BRANCH_NAMES).every((k) => k in mz.BRANCH), "迷路の大きさと分かれ道の名前は、迷路の部品と合っている");
}

// ---- 決まり -------------------------------------------------------------------
section("決まり");
{
  const manifest = JSON.parse(fs.readFileSync(path.join(MOD_DIR, "manifest.json"), "utf8"));
  ok(/^[a-z0-9][a-z0-9.-]{1,62}[a-z0-9]$/.test(manifest.id), "id の形");
  ok(manifest.location === "none" && manifest.apiVersion === 1, "フォルダと無関係のビュー");
  const allowed = new Set(["tree", "quickAccess", "modified", "size"]);
  ok(manifest.uses.every((u) => allowed.has(u)), "使う情報は必要なものだけ");
  ok(!manifest.network && !manifest.uses.includes("fileContent") && !manifest.uses.includes("search") && !manifest.uses.includes("createFiles"), "通信・中身・検索・作成は宣言しない");
  ok(manifest.description.length <= 200, "説明は 200 文字まで");
  ok(manifest.settings.length <= 30 && manifest.settings.every((s) => s.label.length <= 40), "設定の数と見出し");

  const src = fs.readdirSync(MOD_DIR).filter((f) => f.endsWith(".js")).map((f) => [f, fs.readFileSync(path.join(MOD_DIR, f), "utf8")]);
  const code = (t) => t.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").map((l) => l.replace(/(^|\s)\/\/.*$/, "")).join("\n");
  const banned = [/\.trash\(/, /\.rename\(/, /\.files\.create/, /createShortcut/, /createFolder\(/, /ep\.net/, /\bfetch\(/, /readText\(|readBytes\(/, /clipboard\./, /\.search\./];
  for (const [f, t] of src) for (const b of banned) ok(!b.test(code(t)), `${f}: ファイルを変える・読む・通信する呼び出しがない ${b}`);
  for (const [f, t] of src) ok(!/[（）]/.test(code(t)), `${f}: 画面の文章に括弧の注釈がない`);
  ok(!src.some(([f]) => f === "room.js" || f === "grid.js"), "部屋と扉の作り（前の版）は残っていない");
}

console.log(fail ? `\n失敗 ${fail} / ${total}` : `\nすべて通りました ${total}`);
process.exit(fail ? 1 : 0);

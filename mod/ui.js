// ファイル迷路 — 画面（HTML）：はじめの画面・出発前・上の帯・クリア・ショップ・図鑑
import { THEMES, SKINS, COMMON_EXTS, SIZE_NAMES, BRANCH_NAMES, titleFor, nextTitle, stampKey, REPEAT_RATE } from "./rewards.js";
import { ageText, fmtSize, fmtTime, crumbs } from "./tree.js";
import { drawPiece } from "./play.js";

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

const CSS = `
html,body{margin:0;height:100%;background:var(--bg,#0d0f14);color:#e7ebf5;font:14px "Segoe UI","Yu Gothic UI","Meiryo",sans-serif;overflow:hidden;user-select:none;color-scheme:dark}
#app{position:fixed;inset:0}
#stage{position:absolute;inset:0}
#cv{position:absolute;inset:0;display:block;touch-action:none;cursor:crosshair}
button{font:inherit;color:#e7ebf5;background:#1a2030;border:1px solid #394563;border-radius:7px;padding:6px 14px;cursor:pointer}
button:hover{background:#252d44;border-color:var(--acc,#6f9bff)}
button:disabled{opacity:.4;cursor:default}
button.go{background:var(--acc,#6f9bff);border-color:var(--acc,#6f9bff);color:#071022;font-weight:800;font-size:16px;padding:10px 22px}
button.go:hover{filter:brightness(1.1)}
.screen{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(6,8,13,.78);backdrop-filter:blur(3px);overflow:auto}
.screen[hidden],#hud[hidden]{display:none}
.card{width:min(760px,calc(100% - 32px));max-height:calc(100% - 28px);overflow:auto;background:#10141d;border:1px solid #2a3350;border-radius:14px;padding:22px 26px;box-shadow:0 12px 60px #000b}
.card h1{margin:0 0 4px;font-size:30px;letter-spacing:.08em}
.card h2{margin:18px 0 8px;font-size:13px;letter-spacing:.14em;color:#8e9ab5;font-weight:700}
.sub{color:#9aa6c4;line-height:1.8;margin:0 0 12px}
.stats{display:flex;flex-wrap:wrap;gap:8px 18px;padding:10px 14px;background:#0a0d14;border:1px solid #232b44;border-radius:10px;margin:10px 0}
.stats b{color:var(--acc,#6f9bff)}
.coin{color:#ffd24d !important}
.row{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
.roots{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:8px}
.root{display:flex;flex-direction:column;align-items:flex-start;gap:2px;text-align:left;padding:10px 12px}
.root b{font-size:15px}
.root small{color:#8e9ab5;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;direction:rtl;text-align:left}
.msg{min-height:20px;color:#ffb08a;margin:8px 0 0}
.pair{display:grid;gap:8px;margin:12px 0}
.end{display:grid;grid-template-columns:64px 1fr;gap:12px;align-items:center;padding:10px 14px;background:#0a0d14;border:1px solid #232b44;border-radius:10px}
.end .tag{font-size:12px;font-weight:800;border-radius:6px;padding:3px 0;text-align:center;color:#071022}
.end .tag.s{background:var(--start,#5fe0a0)} .end .tag.g{background:var(--goal,#ffd24d)}
.end b{font-size:17px;word-break:break-all}
.end small{display:block;color:#8e9ab5;margin-top:2px}
.btns{display:flex;gap:10px;justify-content:flex-end;flex-wrap:wrap;margin-top:18px}
table.res{width:100%;border-collapse:collapse;margin:10px 0}
table.res td{padding:6px 0;border-bottom:1px solid #1e2640}
table.res td:last-child{text-align:right;font-variant-numeric:tabular-nums}
.big{font-size:22px;font-weight:800;color:#ffd24d}
.new{color:var(--start,#5fe0a0);font-weight:700}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px}
.item{display:flex;flex-direction:column;align-items:center;gap:6px;padding:12px 8px;background:#0a0d14;border:1px solid #232b44;border-radius:10px}
.item.on{border-color:var(--acc,#6f9bff)}
.chip{width:56px;height:40px;border-radius:8px;display:flex;align-items:center;justify-content:center;font:800 24px "Yu Gothic UI",sans-serif;border:1px solid #394563}
.item button{width:100%;padding:4px 6px;font-size:13px}
.stamps{display:grid;grid-template-columns:repeat(auto-fill,minmax(78px,1fr));gap:6px}
.stamp{padding:8px 4px;text-align:center;border-radius:8px;border:1px dashed #2a3350;color:#4a5575;font-weight:700}
.stamp.got{border:1px solid var(--goal,#ffd24d);color:var(--goal,#ffd24d);background:#171304}
.stamp small{display:block;font-weight:400;color:#8e9ab5}
.hist{width:100%;border-collapse:collapse}
.hist td{padding:4px 6px;border-bottom:1px solid #1a2238;font-size:13px}
.hist td:first-child{max-width:320px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.hist td:not(:first-child){text-align:right;color:#9aa6c4;font-variant-numeric:tabular-nums}
#hud{position:absolute;left:0;right:0;top:0;display:flex;align-items:center;gap:14px;padding:8px 12px;background:linear-gradient(180deg,rgba(6,8,13,.88),rgba(6,8,13,0));pointer-events:none}
#hud *{pointer-events:auto}
#hud .goal{display:flex;align-items:baseline;gap:8px;min-width:0;flex:1 1 40%}
#hud .goal .tag{font-size:11px;font-weight:800;background:var(--goal,#ffd24d);color:#071022;border-radius:5px;padding:2px 7px;flex:none}
#hud .goal b{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--goal,#ffd24d)}
#hud .goal small{color:#9aa6c4;white-space:nowrap;flex:none}
#hud .crumb{flex:1 1 30%;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#9aa6c4;text-align:center;direction:rtl}
#hud .right{display:flex;align-items:center;gap:8px;flex:none}
#hud .time{font-variant-numeric:tabular-nums;font-weight:700;min-width:44px;text-align:right}
#hud button{padding:4px 10px;font-size:13px;background:rgba(16,20,29,.85)}
#mm{position:absolute;right:12px;bottom:34px;background:rgba(6,8,13,.92);border:1px solid #2a3350;border-radius:8px;pointer-events:none}
#mm[hidden]{display:none}
.opt{display:flex;align-items:center;gap:10px;margin:8px 0;flex-wrap:wrap}
.opt > span{min-width:110px;color:#9aa6c4}
.seg{display:flex;gap:4px}
.seg button{padding:4px 12px;font-size:13px}
.seg button.on{background:var(--acc,#6f9bff);border-color:var(--acc,#6f9bff);color:#071022;font-weight:700}
#help{position:absolute;left:12px;bottom:8px;color:#aab5d0;font-size:12px;pointer-events:none;background:rgba(6,8,13,.82);padding:3px 10px;border-radius:6px}
#toast{position:absolute;left:50%;bottom:44px;transform:translateX(-50%);background:#10141d;border:1px solid var(--acc,#6f9bff);border-radius:8px;padding:8px 16px;opacity:0;transition:opacity .2s;pointer-events:none}
#toast.on{opacity:1}
.spin{color:#9aa6c4;padding:30px;text-align:center}
`;

export function createUi(root, host) {
  const style = document.createElement("style");
  style.textContent = CSS;
  document.head.append(style);
  root.id = "app";
  root.innerHTML = `<div id="stage"></div>
<div id="hud" hidden>
  <div class="goal"><span class="tag">ゴール</span><b id="h-goal"></b><small id="h-info"></small></div>
  <div class="crumb" id="h-crumb"></div>
  <div class="right"><span class="time" id="h-time">0:00</span><button data-act="hint" id="h-hint">手がかり</button><button data-act="pause">中断</button></div>
</div>
<div id="help" hidden>WASD か矢印で歩く　マウスは押しっぱなしで動く　H で手がかり　M で地図　Esc で中断</div>
<div class="screen" id="screen" hidden></div>
<div id="toast"></div>`;
  const $ = (id) => document.getElementById(id);
  const screen = $("screen");
  const onClick = (e) => {
    const b = e.target.closest("[data-act]");
    if (b && !b.disabled) host.act(b.dataset.act, b.dataset);
  };
  screen.addEventListener("click", onClick);
  $("hud").addEventListener("click", onClick);

  const show = (html) => { screen.innerHTML = html; screen.hidden = false; screen.scrollTop = 0; };
  const hide = () => { screen.hidden = true; screen.innerHTML = ""; };
  let toastTimer = 0;

  const statbar = (rec) => {
    const n = rec.total.clears, nt = nextTitle(n);
    return `<div class="stats"><span>コイン <b class="coin">${rec.coins}</b></span><span>称号 <b>${esc(titleFor(n))}</b></span><span>クリア <b>${n}</b></span>${nt ? `<span>あと ${nt[0] - n} 回で「${esc(nt[1])}」</span>` : ""}</div>`;
  };

  const endCard = (kind, node, extra) => {
    const e = node.e;
    return `<div class="end"><span class="tag ${kind === "start" ? "s" : "g"}">${kind === "start" ? "スタート" : "ゴール"}</span><div><b>${esc(e.name)}</b><small>${esc(extra)}</small></div></div>`;
  };

  return {
    stage: $("stage"),
    show, hide,

    theme(t) {
      const r = document.documentElement.style;
      r.setProperty("--bg", t.bg); r.setProperty("--acc", t.accent); r.setProperty("--start", t.start); r.setProperty("--goal", t.goal);
    },

    loading(text) { show(`<div class="card"><div class="spin">${esc(text)}</div></div>`); },

    home({ rec, roots, msg = "" }) {
      show(`<div class="card">
  <h1>ファイル迷路</h1>
  <p class="sub">フォルダが部屋、ファイル名の文字が壁。いちばん新しいファイルから、忘れていた古いファイルまで歩いてたどりつこう。</p>
  ${statbar(rec)}
  <div class="row"><button data-act="shop">ショップ</button><button data-act="book">図鑑と記録</button></div>
  <h2>舞台をえらぶ</h2>
  ${roots.length ? `<div class="roots">${roots.map((r, i) => `<button class="root" data-act="root" data-i="${i}"><b>${esc(r.name)}</b><small>${esc(r.path)}</small></button>`).join("")}</div>` : `<p class="sub">クイックアクセスにフォルダがありません。エクスプローラでフォルダをピン留めすると、ここに出ます。</p>`}
  <p class="msg">${esc(msg)}</p>
</div>`);
    },

    brief({ entry, files, pair, rec, now = Date.now() }) {
      const s = pair.start, g = pair.goal;
      const seg = (key, names) => `<div class="seg">${Object.entries(names).map(([v, n]) => `<button data-act="opt" data-key="${key}" data-v="${v}" class="${rec[key] === v ? "on" : ""}">${esc(n)}</button>`).join("")}</div>`;
      show(`<div class="card">
  <h1>${esc(entry.name)}</h1>
  <p class="sub">調べたファイルは ${files} 個。この中の新しいファイルから古いファイルまで、壁に名前が刻まれた迷路を抜けます。</p>
  <div class="pair">
    ${endCard("start", s, `${ageText(s.e.modified, now)} ・ ${s.parent.e.name}`)}
    ${endCard("goal", g, `${ageText(g.e.modified, now)} ・ ${fmtSize(g.e.size)} ・ ${g.parent.e.name}`)}
  </div>
  <div class="opt"><span>迷路の大きさ</span>${seg("size", SIZE_NAMES)}</div>
  <div class="opt"><span>分かれ道の多さ</span>${seg("branch", BRANCH_NAMES)}</div>
  <div class="btns"><button data-act="home">もどる</button><button data-act="reroll">べつの組みにする</button><button class="go" data-act="go">出発</button></div>
</div>`);
    },

    tooSmall(entry) {
      show(`<div class="card"><h1>${esc(entry.name)}</h1>
  <p class="sub">ここは、迷路にするには小さすぎます。日付のあるファイルが 6 つ以上ある場所を選んでください。</p>
  <div class="btns"><button data-act="home">もどる</button></div></div>`);
    },

    pause() {
      show(`<div class="card" style="width:min(420px,calc(100% - 32px))"><h1>中断</h1><p class="sub">時間は止まっています。</p>
  <div class="btns"><button data-act="giveup">あきらめる</button><button class="go" data-act="resume">つづける</button></div></div>`);
    },

    clear({ goal, len, seconds, hintsUsed, res, rec }) {
      show(`<div class="card">
  <h1>たどりついた</h1>
  <p class="sub">${esc(goal.e.name)}</p>
  <table class="res">
    <tr><td>道のり</td><td>${len} マス</td></tr>
    <tr><td>時間</td><td>${fmtTime(seconds)}${res.best && !res.first ? ' <span class="new">自己ベスト</span>' : ""}</td></tr>
    <tr><td>手がかり</td><td>${hintsUsed} 回</td></tr>
    <tr><td>コイン</td><td><span class="big">+${res.coins}</span></td></tr>
    ${res.first ? `<tr><td>内訳</td><td>道のりの長さ ${res.parts.base}${res.parts.quick ? ` ＋ はやさ ${res.parts.quick}` : ""}${res.parts.clean ? ` ＋ 手がかりなし ${res.parts.clean}` : ""}</td></tr>` : `<tr><td>内訳</td><td>同じゴールは ${Math.round(REPEAT_RATE * 100)}% だけ</td></tr>`}
    ${res.newStamp ? `<tr><td>スタンプ</td><td><span class="new">${esc(stampKey(goal.e.ext) === "-" ? "拡張子なし" : "." + goal.e.ext)} を図鑑に追加</span></td></tr>` : ""}
    ${res.title ? `<tr><td>称号</td><td><span class="new">「${esc(res.title)}」</span></td></tr>` : ""}
    <tr><td>いまのコイン</td><td>${rec.coins}</td></tr>
  </table>
  <div class="btns"><button data-act="openGoal">ゴールのフォルダを開く</button><button data-act="home">舞台をえらぶ</button><button class="go" data-act="next">つぎの迷路</button></div>
</div>`);
    },

    shop({ rec, msg = "" }) {
      const own = (kind, id) => (kind === "theme" ? rec.owned.themes : rec.owned.skins).includes(id);
      const on = (kind, id) => (kind === "theme" ? rec.theme : rec.skin) === id;
      const btn = (kind, it) => {
        if (on(kind, it.id)) return `<button disabled>使用中</button>`;
        if (own(kind, it.id)) return `<button data-act="equip" data-kind="${kind}" data-id="${it.id}">つかう</button>`;
        return `<button data-act="buy" data-kind="${kind}" data-id="${it.id}" ${rec.coins < it.cost ? "disabled" : ""}>${it.cost} コイン</button>`;
      };
      show(`<div class="card">
  <h1>ショップ</h1>
  <div class="stats"><span>コイン <b class="coin">${rec.coins}</b></span></div>
  <h2>壁の色</h2>
  <div class="grid">${THEMES.map((t) => `<div class="item ${on("theme", t.id) ? "on" : ""}"><div class="chip" style="background:${t.floor};color:${t.wall}">文</div><b>${esc(t.name)}</b>${btn("theme", t)}</div>`).join("")}</div>
  <h2>駒</h2>
  <div class="grid">${SKINS.map((k) => `<div class="item ${on("skin", k.id) ? "on" : ""}"><canvas width="56" height="56" data-shape="${k.shape}" data-color="${k.color}"></canvas><b>${esc(k.name)}</b>${btn("skin", k)}</div>`).join("")}</div>
  <p class="msg">${esc(msg)}</p>
  <div class="btns"><button data-act="home">もどる</button></div>
</div>`);
      for (const cv of screen.querySelectorAll("canvas[data-shape]")) drawPiece(cv.getContext("2d"), cv.dataset.shape, 28, 28, 28, cv.dataset.color, "#10141d");
    },

    book({ rec }) {
      const got = rec.stamps;
      const exts = [...COMMON_EXTS, ...Object.keys(got).filter((k) => k !== "-" && !COMMON_EXTS.includes(k)).sort()];
      const hist = Object.values(rec.clears).sort((a, b) => b.at - a.at).slice(0, 12);
      const total = rec.total;
      show(`<div class="card">
  <h1>図鑑と記録</h1>
  ${statbar(rec)}
  <div class="stats"><span>抜けた道のり <b>${total.len}</b> マス</span><span>かかった時間 <b>${fmtTime(total.seconds)}</b></span><span>集めたスタンプ <b>${Object.keys(got).length}</b></span></div>
  <h2>拡張子スタンプ　ゴールにしたファイルの種類が集まります</h2>
  <div class="stamps">${[...exts, "-"].map((x) => `<div class="stamp ${got[x] ? "got" : ""}">${x === "-" ? "なし" : "." + esc(x)}<small>${got[x] ? got[x].n + " 回" : "未"}</small></div>`).join("")}</div>
  <h2>さいきんのゴール</h2>
  ${hist.length ? `<table class="hist">${hist.map((h) => `<tr><td>${esc(h.name)}</td><td>${h.n} 回</td><td>${fmtTime(h.best)}</td></tr>`).join("")}</table>` : `<p class="sub">まだありません。</p>`}
  <div class="btns"><button data-act="home">もどる</button></div>
</div>`);
    },

    // 上の帯
    hud: {
      start(run, now = Date.now()) {
        $("hud").hidden = false; $("help").hidden = false;
        $("h-goal").textContent = run.goal.e.name;
        $("h-info").textContent = `${ageText(run.goal.e.modified, now)} ・ ${fmtSize(run.goal.e.size)}`;
        this.hints(run.hintsLeft);
      },
      stop() { $("hud").hidden = true; $("help").hidden = true; },
      crumb(node, root) { $("h-crumb").textContent = crumbs(node, root); },
      time(sec) { $("h-time").textContent = fmtTime(sec); },
      hints(n) { const b = $("h-hint"); b.textContent = `手がかり ${n}`; b.disabled = n <= 0; },
    },

    toast(text, ms = 2200) {
      const t = $("toast");
      t.textContent = text; t.classList.add("on");
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => t.classList.remove("on"), ms);
    },
  };
}

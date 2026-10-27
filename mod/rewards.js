// ファイル迷路 — 報酬と記録（画面を持たない）
// コイン・称号・拡張子スタンプ・駒と壁の色の買い物。記録は ep.storage の "rec" に入れる。

export const THEMES = [
  { id: "sumi", name: "墨", cost: 0, bg: "#0d0f14", floor: "#161a22", mark: "#212838", wall: "#cfd6e6", edge: "#8e9ab5", start: "#5fe0a0", goal: "#ffd24d", door: "#6f9bff", accent: "#6f9bff" },
  { id: "kami", name: "紙", cost: 40, bg: "#e6e0cf", floor: "#f2eee0", mark: "#e4dcc7", wall: "#2b2a33", edge: "#55525f", start: "#1f9d62", goal: "#d08a00", door: "#2f5fd0", accent: "#2f5fd0" },
  { id: "ai", name: "藍", cost: 80, bg: "#07122b", floor: "#0b1a3d", mark: "#132a5c", wall: "#8fb4ff", edge: "#5d7fd6", start: "#64f0c0", goal: "#ffe27a", door: "#ff8fb0", accent: "#8fb4ff" },
  { id: "wakakusa", name: "若草", cost: 120, bg: "#0d1a12", floor: "#13261a", mark: "#1c3626", wall: "#bfe8a8", edge: "#7fb26a", start: "#7df0ff", goal: "#ffd24d", door: "#f0a35a", accent: "#bfe8a8" },
  { id: "yuyake", name: "夕焼け", cost: 160, bg: "#2a0f17", floor: "#3a1621", mark: "#4b1e2c", wall: "#ffc7a1", edge: "#d98c6a", start: "#9dffb0", goal: "#fff17a", door: "#7fd0ff", accent: "#ffa070" },
  { id: "yako", name: "夜光", cost: 240, bg: "#000000", floor: "#05060a", mark: "#0c1222", wall: "#39ff88", edge: "#1fb860", start: "#ff4d8d", goal: "#ffe600", door: "#4de1ff", accent: "#39ff88" },
];

export const SKINS = [
  { id: "kaku", name: "かく", cost: 0, shape: "square", color: "#ffffff" },
  { id: "maru", name: "まる", cost: 30, shape: "circle", color: "#ffe9a8" },
  { id: "hishi", name: "ひし", cost: 60, shape: "diamond", color: "#9ff0ff" },
  { id: "hoshi", name: "ほし", cost: 100, shape: "star", color: "#ffd24d" },
  { id: "neko", name: "ねこ", cost: 150, shape: "cat", color: "#ffb37a" },
  { id: "obake", name: "おばけ", cost: 220, shape: "ghost", color: "#e6e9ff" },
];

const TITLES = [[0, "旅立ち前"], [1, "はじめの一歩"], [5, "迷子の常連"], [15, "文字のくぐり手"], [40, "ファイルの案内人"], [100, "迷路の主"]];

export const titleFor = (clears) => TITLES.filter(([n]) => clears >= n).pop()[1];
export const nextTitle = (clears) => TITLES.find(([n]) => n > clears) || null;

export const REPEAT_RATE = 0.1;   // 同じゴールをもう一度クリアしたときの、コインの割合
export const HINTS = 3;           // 1回の迷路で使える手がかりの数

export const defaultRec = () => ({
  v: 2, coins: 0, clears: {}, stamps: {},
  owned: { skins: ["kaku"], themes: ["sumi"] },
  skin: "kaku", theme: "sumi",
  size: "normal", branch: "normal",
  total: { clears: 0, len: 0, seconds: 0 },
});

export const SIZE_NAMES = { small: "小さい", normal: "ふつう", large: "大きい" };
export const BRANCH_NAMES = { few: "すくなめ", normal: "ふつう", many: "おおめ" };

const num = (v, d = 0) => (Number.isFinite(v) && v >= 0 ? v : d);
const obj = (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : {});

// 保存されていた値を、今の形に直す（壊れていても動くように）
export function normalizeRec(raw) {
  const d = defaultRec(), r = obj(raw);
  const own = obj(r.owned);
  const skins = Array.isArray(own.skins) ? own.skins.filter((id) => SKINS.some((s) => s.id === id)) : [];
  const themes = Array.isArray(own.themes) ? own.themes.filter((id) => THEMES.some((t) => t.id === id)) : [];
  if (!skins.includes("kaku")) skins.unshift("kaku");
  if (!themes.includes("sumi")) themes.unshift("sumi");
  const total = obj(r.total);
  return {
    v: 2,
    coins: Math.floor(num(r.coins)),
    clears: obj(r.clears),
    stamps: obj(r.stamps),
    owned: { skins, themes },
    skin: skins.includes(r.skin) ? r.skin : d.skin,
    theme: themes.includes(r.theme) ? r.theme : d.theme,
    size: r.size in SIZE_NAMES ? r.size : d.size,
    branch: r.branch in BRANCH_NAMES ? r.branch : d.branch,
    total: { clears: num(total.clears), len: num(total.len), seconds: num(total.seconds) },
  };
}

// len は、スタートからゴールまでの道の長さ（升の数）。長い迷路ほど多い
export function coinsFor({ len, seconds, hintsUsed, first }) {
  const base = 20 + Math.round(len * 0.5);
  const par = 40 + Math.round(len * 1.4);
  const quick = seconds < par ? Math.round(base * 0.5 * (1 - seconds / par)) : 0;
  const clean = hintsUsed === 0 ? Math.round(base * 0.3) : 0;
  const full = base + quick + clean;
  return { coins: first ? full : Math.max(1, Math.round(full * REPEAT_RATE)), parts: { base, quick, clean } };
}

export const stampKey = (ext) => ext || "-";

// クリアを記録に書く。goal は { key, name, ext }
export function applyClear(rec, { goal, len, seconds, hintsUsed, now = Date.now() }) {
  const prev = rec.clears[goal.key];
  const first = !prev;
  const { coins, parts } = coinsFor({ len, seconds, hintsUsed, first });
  const before = titleFor(rec.total.clears);
  rec.coins += coins;
  rec.clears[goal.key] = { n: (prev?.n || 0) + 1, best: prev ? Math.min(prev.best, seconds) : seconds, name: goal.name, ext: goal.ext, at: now };
  const sk = stampKey(goal.ext);
  const newStamp = !rec.stamps[sk];
  rec.stamps[sk] = { n: (rec.stamps[sk]?.n || 0) + 1, at: rec.stamps[sk]?.at || now };
  rec.total.clears += 1;
  rec.total.len += len;
  rec.total.seconds += seconds;
  const after = titleFor(rec.total.clears);
  return { coins, parts, first, newStamp, best: !prev || seconds < prev.best, title: after !== before ? after : null };
}

// 買う（買ってすぐ使う）。足りない・持っているときは理由を返す
export function buy(rec, kind, id) {
  const list = kind === "skin" ? SKINS : THEMES;
  const item = list.find((x) => x.id === id);
  if (!item) return { ok: false, why: "ないものです" };
  const own = kind === "skin" ? rec.owned.skins : rec.owned.themes;
  if (own.includes(id)) return { ok: false, why: "もう持っています" };
  if (rec.coins < item.cost) return { ok: false, why: "コインが足りません" };
  rec.coins -= item.cost;
  own.push(id);
  if (kind === "skin") rec.skin = id; else rec.theme = id;
  return { ok: true };
}

export function equip(rec, kind, id) {
  const own = kind === "skin" ? rec.owned.skins : rec.owned.themes;
  if (!own.includes(id)) return false;
  if (kind === "skin") rec.skin = id; else rec.theme = id;
  return true;
}

// 図鑑に並べる、よく見る拡張子
export const COMMON_EXTS = ["txt", "docx", "xlsx", "pptx", "pdf", "jpg", "png", "gif", "mp3", "wav", "mp4", "mov", "zip", "7z", "exe", "iso", "js", "json", "html", "css", "md", "csv", "psd", "py"];

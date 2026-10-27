// 試験用の偽のフォルダの木。本体の getTree の形（{ entry, children? }）で返す。
// 日本語と英語の名前・深い枝・たくさんの扉・空のフォルダ・読んでいない枝（children なし）を含む。
// （MOD 本体の tree.js は読まない。MOD のフォルダは ES モジュール扱いにならないので）
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const NOW = Date.UTC(2026, 9, 24);
const DAY = 86400000;
let nextId = 1000;

const file = (dir, name, ageDays, size = 4096) => ({
  entry: { id: String(nextId++), name, path: `${dir}\\${name}`, kind: "file", ext: name.includes(".") ? name.split(".").pop().toLowerCase() : "", hidden: false, size, modified: NOW - ageDays * DAY },
});
const folder = (dir, name, children) => ({
  entry: { id: String(nextId++), name, path: `${dir}\\${name}`, kind: "folder", ext: "", hidden: false, size: 0, modified: NOW - 30 * DAY },
  ...(children ? { children: children(`${dir}\\${name}`) } : {}),
});

const NAMES_JA = ["議事録_最終版", "旅行メモ", "請求書_2019", "企画書", "写真整理", "家計簿", "読書ノート", "履歴書", "見積もり", "日記", "レシピ集", "年賀状", "契約書", "報告書", "メモ"];
const EXTS = ["txt", "docx", "xlsx", "pdf", "jpg", "png", "pptx", "md", "csv", "zip"];

function files(dir, seed, n, newest = false) {
  const r = rng(seed);
  const out = [];
  for (let i = 0; i < n; i++) {
    const base = r() < 0.6 ? NAMES_JA[Math.floor(r() * NAMES_JA.length)] : `file_${Math.floor(r() * 900 + 100)}`;
    const ext = EXTS[Math.floor(r() * EXTS.length)];
    const age = newest ? Math.floor(r() * 20) : Math.floor(200 + r() * 2600);
    out.push(file(dir, `${base}_${i}.${ext}`, age, Math.floor(r() * 5e6)));
  }
  return out;
}

export function fakeRoot(base = "C:\\Users\\me\\Documents") {
  const name = base.split("\\").pop();
  const parent = base.slice(0, base.lastIndexOf("\\"));
  const root = {
    entry: { id: "500", name, path: base, kind: "folder", ext: "", hidden: false, size: 0, modified: NOW },
    children: [],
  };
  const d = base;
  const work = folder(d, "仕事", (p) => [
    folder(p, "2019", (q) => [...files(q, 1, 6), folder(q, "請求書", (s) => files(s, 11, 5))]),
    folder(p, "2020", (q) => [...files(q, 2, 5), folder(q, "企画", (s) => [...files(s, 12, 4), folder(s, "旧案", (t) => files(t, 21, 3))])]),
    folder(p, "最近", (q) => files(q, 3, 6, true)),
    ...files(p, 4, 3),
  ]);
  const photos = folder(d, "写真", (p) => [
    ...["旅行", "家族", "仕事", "イベント", "風景", "スクショ", "その他", "整理前", "古い写真"].map((n, i) => folder(p, n, (q) => files(q, 30 + i, 3 + (i % 4), i === 2))),
  ]);
  const empty = folder(d, "からっぽ", () => []);
  const unread = folder(d, "未読", undefined);
  const hidden = { entry: { id: "9", name: ".secret", path: `${d}\\.secret`, kind: "folder", ext: "", hidden: true, size: 0, modified: NOW } };
  const nm = folder(d, "node_modules", (p) => files(p, 99, 3));
  root.children = [work, photos, empty, unread, hidden, nm, ...files(d, 5, 8), ...files(d, 6, 3, true)];
  return root;
}

export const fakeNow = NOW;

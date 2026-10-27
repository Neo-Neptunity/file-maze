// ファイル迷路 — 階層の読みかえ（画面を持たない）
// 本体の getTree の結果を「フォルダの木」にして、スタートとゴールの組みと、道すじの順のフォルダを決める。
// 迷路の形には階層を使わない。階層が効くのは、壁に刻む名前と、画面上部の道すじの表示だけ。
// ファイルには一切さわらない。読むのは名前・種類・更新日時だけ。

export function hashStr(s) {
  let h = 2166136261;
  for (const ch of String(s)) { h ^= ch.codePointAt(0); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

// 種から決まる乱数（mulberry32）。同じ種なら、いつも同じ並び
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffled(list, rnd) {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const SKIP_DIRS = /^(node_modules|\.git|\$recycle\.bin|system volume information)$/i;
// 1990年より前の更新日時は「日付なし」（zip などの 1980 年）。古さの数えには使わない
const BOGUS_BEFORE = Date.UTC(1990, 0, 1);

const shown = (api) => {
  const e = api.entry;
  return !e.hidden && !e.name.startsWith(".") && !(e.kind === "folder" && SKIP_DIRS.test(e.name));
};

// 本体の TreeNode を、親を持つ木にする。kids が null なのは「まだ読んでいない」
export function adopt(api, parent = null) {
  const n = { e: api.entry, parent, depth: parent ? parent.depth + 1 : 0, kids: null };
  if (api.entry.kind === "folder" && api.children) n.kids = api.children.filter(shown).map((c) => adopt(c, n));
  return n;
}

export const isDir = (n) => n.e.kind === "folder";
export const dirsOf = (n) => (n.kids || []).filter(isDir);
export const filesOf = (n) => (n.kids || []).filter((k) => !isDir(k));

export function collectFiles(root, out = []) {
  for (const k of root.kids || []) (isDir(k) ? collectFiles(k, out) : out.push(k));
  return out;
}

export function countDirs(root) {
  let n = 0;
  for (const k of root.kids || []) if (isDir(k)) n += 1 + countDirs(k);
  return n;
}

const dated = (f) => typeof f.e.modified === "number" && f.e.modified >= BOGUS_BEFORE;

// a のあるフォルダから b のあるフォルダまでの、フォルダの並び（共通の親まで登って、降りる）
export function roomsBetween(a, b) {
  const up = [];
  for (let n = a.parent; n; n = n.parent) up.push(n);
  const upSet = new Set(up);
  const down = [];
  let lca = null;
  for (let n = b.parent; n; n = n.parent) {
    if (upSet.has(n)) { lca = n; break; }
    down.push(n);
  }
  if (!lca) return [];
  return [...up.slice(0, up.indexOf(lca) + 1), ...down.reverse()];
}

// 新しいファイルから、古いファイルへ。道すじのフォルダの数が範囲に入る組みを、種から選ぶ
//   cleared は「ゴールにしたことのあるファイル」の入れ物（キーは keyOf の値）
export function pickPair(root, { rnd, minRooms = 2, maxRooms = 8, cleared = {}, tries = 500 } = {}) {
  const files = collectFiles(root).filter(dated).sort((a, b) => b.e.modified - a.e.modified);
  if (files.length < 6) return null;
  const starts = files.slice(0, Math.max(3, Math.ceil(files.length * 0.2)));
  const olds = files.slice(files.length - Math.max(3, Math.ceil(files.length * 0.5)));
  const fresh = olds.filter((f) => !cleared[keyOf(f.e)]);
  const goals = fresh.length >= 3 ? fresh : olds;
  const pick = (list) => list[Math.floor(rnd() * list.length)];
  for (let pass = 0; pass < 2; pass++) {
    const lo = pass === 0 ? minRooms : 1;
    const hi = pass === 0 ? maxRooms : maxRooms + 4;
    for (let i = 0; i < tries; i++) {
      const start = pick(starts), goal = pick(goals);
      if (start === goal) continue;
      const rooms = roomsBetween(start, goal);
      if (rooms.length >= lo && rooms.length <= hi) return { start, goal, rooms };
    }
  }
  return null;
}

// 記録のキー。ファイルIDがあればそれ（名前を変えても同じ）、無ければパス
export const keyOf = (e) => e.id || String(e.path).toLowerCase();

// そのフォルダの壁に刻む名前。ファイル名を主に、足りなければ中のフォルダ名、それも無ければフォルダ自身の名前
export function poolOf(node) {
  const names = filesOf(node).map((f) => f.e.name);
  if (names.length < 3) names.push(...dirsOf(node).map((d) => d.e.name));
  return names.length ? names : [node.e.name];
}

export function crumbs(node, root) {
  const out = [];
  for (let n = node; n; n = n.parent) { out.push(n.e.name); if (n === root) break; }
  return out.reverse().join(" › ");
}

export function ageText(ms, now = Date.now()) {
  const d = Math.max(0, (now - ms) / 86400000);
  if (d < 1) return "きょう";
  if (d < 31) return `${Math.floor(d)}日前`;
  if (d < 365) return `${Math.floor(d / 30)}か月前`;
  return `${Math.floor(d / 365)}年前`;
}

export function fmtSize(b) {
  if (!(b >= 0)) return "";
  if (b < 1024) return `${b}B`;
  if (b < 1048576) return `${(b / 1024).toFixed(b < 10240 ? 1 : 0)}KB`;
  if (b < 1073741824) return `${(b / 1048576).toFixed(b < 10485760 ? 1 : 0)}MB`;
  return `${(b / 1073741824).toFixed(1)}GB`;
}

export function fmtTime(sec) {
  const s = Math.max(0, Math.round(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

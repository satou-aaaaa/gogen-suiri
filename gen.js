// 語源すいりの問題を作る（ブラウザと node の両方で使う）。データは data.js（GOGEN_DATA）。
// 問題の札（tag）は "種類|単語の番号|種"。同じ札なら、どの端末でも同じ問題（選び肢・並び）になる。
// 乱数 R は呼ぶ回数が毎回同じになるように使う（sort の比較の中では引かない）。
(function (root) {
  "use strict";
  const D = typeof module !== "undefined" && module.exports ? require("./data.js") : root.GOGEN_DATA;
  const { PARTS, WORDS, ORIGIN, CATS } = D;
  // 今日の5問・上級に使う単語の数。単語を足してもここを変えなければ、過去の日の問題は変わらない
  const DAILY_N = 158;
  const EPOCH = "2026-11-07";
  const LV = ["やさしい", "ふつう", "むずかしい"];
  // 種類：g0 意味あて（パーツの意味が見える）・b1 組み立て（意味からパーツを選ぶ）・g2 見やぶり（パーツの意味をかくす）
  const KINDS = [
    { id: "g0", lv: 0, name: "意味あて", how: "パーツの意味をつなげて、単語の意味を当てる" },
    { id: "b1", lv: 1, name: "組み立て", how: "意味に合うパーツを選んで、単語を組み立てる" },
    { id: "g2", lv: 2, name: "見やぶり", how: "パーツの意味を思い出して、単語の意味を当てる" },
  ];
  const BY = Object.fromEntries(KINDS.map((k) => [k.id, k]));

  function seedOf(str) { let h = 2166136261; for (const ch of String(str)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
  function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  const shuffle = (R, arr) => { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(R() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const pickN = (R, arr, n) => shuffle(R, arr).slice(0, n);

  const pm = (id) => PARTS[id][0];
  const idsOf = (w) => w.segs.map((s) => s[1]);
  const mset = (w) => idsOf(w).map(pm).sort().join("/");
  // パーツを使う単語の数（見やぶりは、どのパーツもほかの単語で出会えるものだけ）
  const poolOf = (i) => (i < DAILY_N ? WORDS.slice(0, DAILY_N) : WORDS);
  const USE = {};
  for (const w of WORDS) for (const id of new Set(idsOf(w))) USE[id] = (USE[id] || 0) + 1;
  const canHide = (w) => idsOf(w).every((id) => USE[id] >= 2);
  // パーツが単語の頭・おしりに来るか（組み立ての、まぎらわしい札を選ぶのに使う）
  const POS = {};
  for (const w of WORDS) w.segs.forEach(([, id], j) => { const p = (POS[id] = POS[id] || { h: 0, t: 0 }); if (j === 0) p.h++; if (j === w.segs.length - 1) p.t++; });

  // 「tele（遠く）＋ scope（見る）」
  const breakdown = (w) => w.segs.map(([t, id]) => `${t}（${pm(id)}）`).join(" ＋ ");

  function make(tag) {
    const [kind, wi] = String(tag).split("|"), w = WORDS[+wi], K = BY[kind];
    if (!w || !K) throw new Error("知らない札: " + tag);
    const R = rng(seedOf(tag)), pool = poolOf(w.i);
    const P = { tag, kind, lv: K.lv, name: K.name, w, why: breakdown(w) + " ＝ " + w.d, note: w.note };
    if (kind === "b1") {
      // 正しいパーツと、意味が重ならないまぎらわしいパーツ（頭・おしりの位置が同じものを先に）で、札を6枚
      const want = idsOf(w), means = new Set(want.map(pm)), ids = [...new Set(pool.flatMap(idsOf))];
      const okD = ids.filter((id) => !want.includes(id) && !means.has(pm(id)));
      const out = [], used = new Set(means);
      const need = 6 - want.length;
      want.forEach((id, j) => {
        const per = Math.ceil(need / want.length), head = j === 0, tail = j === want.length - 1;
        // 生まれた言葉（札の色・印）が同じものを先に。色で答えが分からないように
        const posOk = (x) => (head ? POS[x].h : 0) || (tail ? POS[x].t : 0) || (!head && !tail), og = PARTS[id][1];
        const near = [...shuffle(R, okD.filter((x) => posOk(x) && PARTS[x][1] === og)), ...shuffle(R, okD.filter((x) => posOk(x) && PARTS[x][1] !== og))];
        for (const x of near) { if (out.length >= need || out.filter((y) => y.j === j).length >= per) break; if (!used.has(pm(x))) { used.add(pm(x)); out.push({ id: x, j }); } }
      });
      const ogs = want.map((id) => PARTS[id][1]);
      for (const x of [...shuffle(R, okD.filter((x) => ogs.includes(PARTS[x][1]))), ...shuffle(R, okD)]) { if (out.length >= need) break; if (!used.has(pm(x))) { used.add(pm(x)); out.push({ id: x, j: -1 }); } }
      P.ans = want; P.cards = shuffle(R, [...want, ...out.map((o) => o.id)]);
      P.look = `最初のパーツは「${pm(want[0])}」という意味です。`;
      return P;
    }
    // 意味あて・見やぶり：答えと、なかまの近い3つの意味（パーツの意味の組が同じ単語は入れない）
    const ms = mset(w), ok = pool.filter((x) => x.i !== w.i && x.ja !== w.ja && mset(x) !== ms);
    const same = shuffle(R, ok.filter((x) => x.c === w.c)), other = shuffle(R, ok.filter((x) => x.c !== w.c));
    const pick = [];
    for (const x of [...same, ...other]) { if (pick.length >= 3) break; if (!pick.some((y) => y.ja === x.ja)) pick.push(x); }
    P.ans = w.ja; P.opts = shuffle(R, [w.ja, ...pick.map((x) => x.ja)]);
    P.hide = kind === "g2";
    const key = w.segs[0];
    P.look = P.hide ? "パーツの意味を出しました。つなげて読んでみましょう。" : `「${key[0]}＝${pm(key[1])}」に注目してみましょう。`;
    return P;
  }

  // 今日の5問：全部の単語を種で並べた列を、1日5語ずつ前から使う（1周するまで同じ語は出ない）
  const dayIndex = (date) => Math.round((Date.parse(date) - Date.parse(EPOCH)) / 864e5);
  const cyc = {};
  const cycle = (c) => cyc[c] || (cyc[c] = shuffle(rng(seedOf("cycle:" + c)), [...Array(DAILY_N).keys()]));
  function dailyWords(date) {
    const n = Math.max(0, dayIndex(date)), out = [];
    let p = n * 5;
    while (out.length < 5) { const c = Math.floor(p / DAILY_N), w = cycle(c)[p % DAILY_N]; if (!out.includes(w)) out.push(w); p++; }
    return out;
  }
  // 5語のうち、見やぶりにできる最後の1語をむずかしいに。残りを前から意味あて2・組み立て2
  function dailyTags(date) {
    const ws = dailyWords(date);
    let h = -1; for (let j = ws.length - 1; j >= 0; j--) if (canHide(WORDS[ws[j]])) { h = j; break; }
    const rest = ws.filter((_, j) => j !== h), kinds = ["g0", "g0", "b1", "b1", "g0"];
    const tags = rest.map((w, j) => `${kinds[j]}|${w}|${date}`);
    if (h >= 0) tags.push(`g2|${ws[h]}|${date}`);
    return tags;
  }
  // 上級：今日の5語と重ねず、見やぶりにできる語から3つ
  function hardTags(date) {
    const today = dailyWords(date), R = rng(seedOf("hard:" + date));
    const cand = WORDS.slice(0, DAILY_N).filter((w) => canHide(w) && !today.includes(w.i)).map((w) => w.i);
    return pickN(R, cand, 3).map((w) => `g2|${w}|h${date}`);
  }
  // 練習・とことんで出せる組（種類と単語）。見やぶりは canHide の語だけ
  const combos = (kind) => WORDS.filter((w) => kind !== "g2" || canHide(w)).map((w) => w.i);

  const GOGEN = { PARTS, WORDS, ORIGIN, CATS, KINDS, BY, LV, DAILY_N, EPOCH, USE, seedOf, rng, shuffle, pickN, make, dailyWords, dailyTags, hardTags, canHide, combos, breakdown, pm, idsOf };
  if (typeof module !== "undefined" && module.exports) module.exports = GOGEN;
  else root.GOGEN = GOGEN;
})(typeof self !== "undefined" ? self : this);

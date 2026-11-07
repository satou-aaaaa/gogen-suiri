// 語源すいりの検査。データ（単語がパーツをつないだ形・パーツの意味）・問題の作り方（答えが1つ・まぎらわしい札の色）・
// 今日の5問と上級の組み方（3年分・過去の日が変わらない）・とことんの並び（何百回）・通しで遊ぶ・まちがい・ヒント・続きから・
// 上級・練習・とことん・パーツ帳・実績・カレンダー・あとから・古いタブ・スマホ幅・PWA・引き継ぎコード・見やすさを確かめる。
// 使い方: node qa/run.mjs   失敗があれば終了コード 1。結果は qa-report/report.md。
import { chromium } from "playwright";
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { checkTransfer } from "./transfer-check.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const results = [];
const check = (name, ok, detail = "") => results.push({ name, ok: !!ok, detail: String(detail).slice(0, 400) });
const G = createRequire(import.meta.url)(path.join(root, "gen.js"));
const { PARTS, WORDS } = G;

// ---- 1. データと問題の作り方（ブラウザを使わない）----
{
  const badJoin = WORDS.filter((w) => w.segs.map((s) => s[0]).join("") !== w.w).map((w) => w.w);
  check("単語：パーツをつなぐと元の単語になる", badJoin.length === 0, badJoin.join(","));
  const badPart = WORDS.flatMap((w) => w.segs.filter(([t, id]) => !PARTS[id] || !PARTS[id][2].includes(t)).map(([t]) => `${w.w}:${t}`));
  check("単語：どのパーツも PARTS にあり、書き方が登録されている", badPart.length === 0, badPart.join(","));
  const dupW = WORDS.map((w) => w.w).filter((w, i, a) => a.indexOf(w) !== i);
  check("単語：同じ単語が2回ない・2つ以上のパーツでできている・1語の中で同じパーツを2回使わない", !dupW.length && WORDS.every((w) => w.segs.length >= 2 && new Set(G.idsOf(w)).size === w.segs.length), dupW.join(","));
  const unused = Object.keys(PARTS).filter((id) => !G.USE[id]);
  check("パーツ：どのパーツもどこかの単語で使う（パーツ帳を全部集められる）", unused.length === 0, unused.join(","));
  const long = WORDS.filter((w) => w.ja.length > 18 || w.d.length > 20 || w.note.length > 50).map((w) => w.w).concat(Object.entries(PARTS).filter(([, p]) => p[0].length > 12).map(([id]) => id));
  check("文は短く（意味18字・言いかえ20字・ひとこと50字・パーツの意味12字まで。やさしい日本語）", long.length === 0, long.join(","));
  check("単語は150語以上・今日の5問に使う数（DAILY_N）は単語の数より多くない", WORDS.length >= 150 && G.DAILY_N <= WORDS.length, `${WORDS.length}語`);
  check("生まれた言葉はギリシャ語・ラテン語・英語・フランス語・イタリア語のどれか（札の印に出す）", Object.values(PARTS).every((p) => G.ORIGIN[p[1]]));
  check("なかま（選び肢を選ぶ組）は決めたものだけ", WORDS.every((w) => G.CATS[w.c]));
}
{
  // 全部の単語×種類で、何通りもの種から作る：答えが1つ・選び肢4つがちがう・まぎらわしい札の意味が答えと重ならない
  const bad = [], give = [];
  let n = 0;
  for (const w of WORDS) for (const k of G.KINDS) {
    if (k.id === "g2" && !G.canHide(w)) continue;
    for (let s = 0; s < 6; s++) {
      const P = G.make(`${k.id}|${w.i}|s${s}`); n++;
      if (k.id === "b1") {
        const means = P.cards.map((c) => G.pm(c)), words = P.cards.flatMap((c) => G.pm(c).split("・"));
        // 意味のことばが1つでも重なる札は置かない（ultra「こえて」に super「上に・こえて」を並べない）
        if (P.cards.length !== 6 || new Set(P.cards).size !== 6 || new Set(means).size !== 6 || new Set(words).size !== words.length || P.ans.some((a) => !P.cards.includes(a)) || P.ans.join() !== G.idsOf(w).join()) bad.push(`${w.w}/b1`);
        const ao = P.ans.map((c) => PARTS[c][1]), dOk = P.cards.filter((c) => !P.ans.includes(c)).map((c) => PARTS[c][1]);
        if (dOk.every((o) => !ao.includes(o))) give.push(w.w);
      } else {
        if (P.opts.length !== 4 || new Set(P.opts).size !== 4 || P.opts.filter((o) => o === w.ja).length !== 1) bad.push(`${w.w}/${k.id}`);
        // 選び肢の単語は、パーツの意味の組が答えと同じではない（同じなら推理では分けられない）
        const ms = (x) => G.idsOf(x).map(G.pm).sort().join("/");
        const others = P.opts.filter((o) => o !== w.ja).map((o) => WORDS.find((x) => x.ja === o));
        if (others.some((x) => !x || ms(x) === ms(w))) bad.push(`${w.w}/${k.id}/same-meaning`);
      }
    }
  }
  check(`問題：どの単語・種類でも、答えが1つ・選び肢と札がちがう（${n}問を作って確かめる）`, bad.length === 0, [...new Set(bad)].slice(0, 8).join(","));
  {
    // DAILY_N の後ろに単語を足しても、今日の5問・上級の問題（見やぶりにできるか・札・選び肢）は変わらない
    const req = createRequire(import.meta.url), dp = path.join(root, "data.js"), gp = path.join(root, "gen.js");
    const days = Array.from({ length: 120 }, (_, d) => new Date(Date.parse(G.EPOCH) + d * 864e5).toISOString().slice(0, 10));
    const shot = (g) => days.map((k) => [...g.dailyTags(k), ...g.hardTags(k)].map((t) => { const P = g.make(t); return t + "=" + (P.opts || P.cards).join("/"); }).join(";")).join("\n");
    const before = shot(G), D = req(dp), n0 = D.WORDS.length;
    // 今日の5問の語とパーツを使い回す単語を2つ足す（見やぶりの数え方と、頭・おしりの数え方が動くはず）
    for (const w of D.WORDS.slice(0, 2)) D.WORDS.push({ i: D.WORDS.length, w: w.w + "x", segs: w.segs.slice().reverse(), ja: "テスト" + D.WORDS.length, d: "テスト", c: w.c, note: "" });
    delete req.cache[gp]; const G2 = req(gp), after = shot(G2);
    D.WORDS.length = n0; delete req.cache[gp];
    check("DAILY_N の後ろに単語を足しても、今日の5問・上級の問題は変わらない（120日分）", before === after);
  }
  check("組み立て：札の色（生まれた言葉）だけで答えが分からない（まぎらわしい札に答えと同じ言葉の札がある）", give.length === 0, [...new Set(give)].slice(0, 8).join(","));
  const same = ["telephone", "dinosaur", "transport"].every((x) => { const w = WORDS.find((y) => y.w === x); return JSON.stringify(G.make(`g0|${w.i}|z`)) === JSON.stringify(G.make(`g0|${w.i}|z`)); });
  check("同じ札なら同じ問題（種から作る）", same);
  check("見やぶりにできる単語（どのパーツもほかの単語で出会える）が60語以上", WORDS.filter(G.canHide).length >= 60, WORDS.filter(G.canHide).length);
  const combos = G.KINDS.reduce((a, k) => a + G.combos(k.id).length, 0);
  check("練習・とことんで出る問題（種類×単語）が300種類以上", combos >= 300, combos);
}
{
  // 今日の5問・上級を3年分：今日の5語は重ならない・上級は今日と重ならない・1周するまで同じ語は出ない
  const bad = [], seenCycle = new Map(); let noHard = 0, dup = 0;
  const start = Date.parse(G.EPOCH);
  for (let d = 0; d < 1100; d++) {
    const k = new Date(start + d * 864e5).toISOString().slice(0, 10);
    const t = G.dailyTags(k), h = G.hardTags(k), ws = t.map((x) => +x.split("|")[1]), hw = h.map((x) => +x.split("|")[1]);
    if (t.length !== 5 || new Set(ws).size !== 5 || h.length !== 3 || new Set(hw).size !== 3 || hw.some((w) => ws.includes(w))) bad.push(k);
    // 日ごとの種類：見やぶりにできる語がある日は 意味あて2・組み立て2・見やぶり1、無い日だけ 意味あて3・組み立て2。上級は見やぶり3
    const kn = (p) => t.filter((x) => x.startsWith(p)).length, can = ws.some((w) => G.canHide(G.WORDS[w]));
    if (kn("b1") !== 2 || kn("g0") !== (can ? 2 : 3) || kn("g2") !== (can ? 1 : 0) || !h.every((x) => x.startsWith("g2|"))) bad.push(k + "/kinds");
    if (!t[4].startsWith("g2")) noHard++;
    if (![...t, ...h].every((x) => { try { G.make(x); return true; } catch { return false; } })) bad.push(k + "/make");
    if (ws.some((w) => w >= G.DAILY_N) || hw.some((w) => w >= G.DAILY_N)) bad.push(k + "/n");
    if (d < Math.floor(G.DAILY_N / 5)) for (const w of ws) { if (seenCycle.has(w)) dup++; seenCycle.set(w, k); }
  }
  check("今日の5問（意味あて2・組み立て2・見やぶり1。見やぶりにできる語が無い日だけ意味あて3）と上級（見やぶり3・今日と重ならない）を3年分作れる", bad.length === 0, bad.slice(0, 5).join(","));
  check("今日の5問の5問目はほとんどの日で見やぶり（ない日は3年で30日まで）", noHard <= 30, `${noHard}日`);
  check(`今日の5問は、はじめの${Math.floor(G.DAILY_N / 5)}日で同じ単語を出さない（全部を一回りしてから次の周）`, dup === 0, dup);
  // 過去の日の問題が変わらない（data.js・gen.js を変えたら、ここの値が変わる。変えるなら PR に理由を書く）
  const snap = JSON.parse(readFileSync(path.join(root, "qa", "daily-snapshot.json"), "utf8"));
  const now = Object.fromEntries(Object.keys(snap).map((k) => [k, [...G.dailyTags(k), ...G.hardTags(k)].map((t) => { const P = G.make(t); return `${t}=${P.opts ? P.opts.join("/") : P.cards.join("/")}`; })]));
  const changed = Object.keys(snap).filter((k) => JSON.stringify(snap[k]) !== JSON.stringify(now[k]));
  check("過去と先の日の問題が、前に決めた問題と同じ（qa/daily-snapshot.json）", changed.length === 0, changed.slice(0, 5).join(","));
}

// ---- 2. ファイルの中身 ----
const html = readFileSync(path.join(root, "index.html"), "utf8"), gen = readFileSync(path.join(root, "gen.js"), "utf8"), data = readFileSync(path.join(root, "data.js"), "utf8");
const ext = [...html.matchAll(/(?:src|href)="(https?:[^"]+)"/g)].map((m) => m[1]).filter((u) => !/^https:\/\/fonts\.googleapis\.com(\/|$)|^https:\/\/ko-fi\.com\/satouaaaaa$|^https:\/\/(doi\.org|www\.etymonline\.com)\//.test(u));
check("外から読むのは文字（Google Fonts）だけ。スクリプト・広告・解析を入れない（出典のリンクは押したときに開くだけ）", ext.length === 0 && ![...html.matchAll(/<script[^>]+src="([^"]+)"/g)].some((m) => /^https?:/.test(m[1])), ext.join(","));
check("CSP で通信先を自分だけにしている", /connect-src 'self'/.test(html) && !/connect-src[^;"]*https/.test(html));
check("Math.random は練習・とことんの種だけ（今日の5問・上級は日付の乱数。gen.js・data.js には無い）", (html.match(/Math\.random/g) || []).length === 2 && !/Math\.random/.test(gen + data));
check("乱数は sort の比較の中で引かない（ブラウザで引く回数が変わる）", !/\.sort\(\s*\([^)]*\)\s*=>[^\n;]*\b(R|rng|rand|Math\.random)\s*\(/.test(html + gen));
check("一行の式の途中にコメント // を足さない（行の残りが消える。rosen-hitofude 2026-11-04）", !/;\s*\/\/[^\n]*;\s*\w/.test((gen + data).split("\n").filter((l) => !l.trim().startsWith("//")).join("\n")));
check("画面にお笑いの言葉を入れない（本物っぽく）", !/お笑い|ギャグ|ツッコミ|なんでやねん|（うそ）/.test(html + data));
check("語源の出典（Etymonline）を「このゲームについて」と答えのあとに出す", /etymonline\.com/.test(html) && /出典：Online Etymology Dictionary/.test(html));
check("好きなだけ遊べる：チケット・回数制限・🔒で開くモードを入れない", !/🎫|チケット|🔒|すると開く|のあとで開く/.test(html));
check("引き継ぎ：transfer.js をゲームの script より前に、このゲームの記録のキーだけで読む", /<script src="transfer\.js" data-game="gogen-suiri" data-keys="gogen-v1,gogen-fs"><\/script>\s*<\/head>/.test(html) && html.indexOf('src="transfer.js"') < html.indexOf('src="data.js"') && /data-hk/.test(html) && existsSync(path.join(root, "transfer.js")));
{ const og = (k) => (html.match(new RegExp(`<meta (?:property|name)="${k}" content="([^"]+)"`)) || [])[1] || "";
  const png = readFileSync(path.join(root, "og.png"));
  check("SNS で貼ると絵と題が出る（OGP・1200×630・絶対URL）", og("og:title") && og("og:description") && og("og:image") === "https://satou-aaaaa.github.io/gogen-suiri/og.png" && og("twitter:card") === "summary_large_image" && png.readUInt32BE(16) === 1200 && png.readUInt32BE(20) === 630); }
{ const fy = readFileSync(path.join(root, ".github/ISSUE_TEMPLATE/feedback.yml"), "utf8");
  check("感想フォームの name が3字以上（2字だとフォームが出ない。shared-workflows incidents/2026-11-05-feedback-form-not-shown.md）", [...((fy.match(/^name:\s*(.+)$/m) || [])[1] || "").trim()].length >= 3);
  check("感想フォームは名前・メールを聞かない", /id: fun/.test(fy) && !/id: (name|email|mail)/.test(fy) && /labels: \["感想"\]/.test(fy)); }
check("README の URL のすぐ後ろに全角の字を続けない（Link check が URL の一部と読む）", !/https?:\/\/[\x21-\x7e]*[^\x00-\x7f]/.test(readFileSync(path.join(root, "README.md"), "utf8").replace(/\]\(https?:\/\/[^)\s]+\)/g, "").replace(/<https?:\/\/[^>\s]+>/g, "")));
{ const sw = readFileSync(path.join(root, "sw.js"), "utf8"), mf = JSON.parse(readFileSync(path.join(root, "manifest.webmanifest"), "utf8"));
  const shell = JSON.parse(sw.match(/SHELL = (\[[^\]]+\])/)[1]);
  check("PWA：sw.js は画面のファイルを全部保存し（引き継ぎの transfer.js も）、外へ何も送らない", ["./index.html", "./data.js", "./gen.js", "./transfer.js", "./manifest.webmanifest", "./icon-192.png", "./icon-512.png"].every((f) => shell.includes(f)) && !/https?:\/\//.test(sw.replace(/^\/\/.*$/gm, "")));
  check("PWA：sw.js は install で取り直す（cache: reload）", /cache: "reload"/.test(sw));
  check("PWA：本文を受け取り終えるまで保存したものへの切り替えを待ち、保存も通信も無いときは20秒でエラーを返す", /arrayBuffer\(\)\.then\(\(\) => send\(res\)/.test(sw) && /setTimeout\([^;]*Response\.error\(\)[^;]*20000\)/.test(sw));
  check("「動きを減らす」のときは、すべるスクロールにしない", !/behavior: "smooth"/.test(html) && /A11y\.on\("calm"\) \? "auto" : "smooth"/.test(html));
  check("PWA：manifest にアイコン2つと名前がある", mf.name === "語源すいり" && mf.icons.length >= 2 && mf.start_url === "./"); }

// ---- 3. ブラウザで遊ぶ ----
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".png": "image/png", ".webmanifest": "application/manifest+json" };
const server = createServer((req, res) => {
  const p = decodeURIComponent(new URL(req.url, "http://x").pathname), f = path.join(root, p === "/" ? "index.html" : p);
  if (!f.startsWith(root) || !existsSync(f)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { "content-type": TYPES[path.extname(f)] || "application/octet-stream" }); res.end(readFileSync(f));
}).listen(0);
const url = `http://127.0.0.1:${server.address().port}/`;
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const errors = [];
// QA の間は、ブラウザの時計を始めた時刻に止める（日本時間の0時をまたいでも、TODAY とゲームの「今日」がずれない）
const START = Date.now();
const TODAY = new Date(START + 9 * 3600e3).toISOString().slice(0, 10);
const dayBefore = (n) => new Date(Date.parse(TODAY) - n * 864e5).toISOString().slice(0, 10);
async function newPage(w = 390, ctx) {
  const c = ctx || await browser.newContext({ viewport: { width: w, height: 800 } });
  if (!ctx) await c.clock.setFixedTime(START);
  await c.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  const p = await c.newPage();
  p.on("pageerror", (e) => errors.push(e.message));
  p.on("console", (m) => { if (m.type() === "error" && !/ERR_FAILED|net::/.test(m.text())) errors.push(m.text()); });
  await p.goto(url); await p.waitForTimeout(200);
  return p;
}
const closeHow = async (p) => { if (await p.locator("#howto[open]").count()) await p.click("#howto-ok"); };
const curOf = (p) => p.evaluate(() => { const c = __gg.cur(); return { kind: c.P.kind, ans: c.P.ans, opts: c.P.opts, cards: c.P.cards, wrong: c.wrong, got: c.got, i: c.i, tag: c.tag }; });
const mem = (p) => p.evaluate(() => JSON.parse(localStorage.getItem("gogen-v1") || "{}"));
// 1回まちがえる（意味あて・見やぶりは選び肢、組み立ては札）
async function miss(p) {
  const c = await curOf(p);
  if (c.kind === "b1") await p.click(`.card[data-j="${c.cards.findIndex((x) => !c.ans.includes(x) && !c.wrong.includes(x))}"]`);
  else await p.click(`.ch[data-j="${c.opts.findIndex((o) => o !== c.ans && !c.wrong.includes(o))}"]`);
}
async function solve(p, { wrong = 0 } = {}) {
  for (let i = 0; i < wrong; i++) await miss(p);
  const c = await curOf(p);
  if (c.kind === "b1") { for (const a of c.ans) if (!c.got.includes(a)) await p.click(`.card[data-j="${c.cards.indexOf(a)}"]`); }
  else await p.click(`.ch[data-j="${c.opts.indexOf(c.ans)}"]`);
  await p.waitForSelector(".verdict");
}

try {
  const p = await newPage();
  check("はじめて開くと遊び方が出る", await p.locator("#howto[open]").count() === 1);
  await p.click("#howto-ok");
  {
    // Esc で閉じても「見た」が残り、開き直しても遊び方が出ない（shared-workflows #186。ボタンでしか保存していなかった）
    const q = await newPage();
    await q.waitForSelector("#howto[open]");
    let bad = 0;
    for (let i = 0; i < 10; i++) {
      const r = i ? await newPage() : q;
      await r.waitForSelector("#howto[open]");
      await r.keyboard.press("Escape");
      if (!(await r.evaluate(() => __gg.load().tut))) bad++;   // 押したその場（すぐ読み直す）
      if (i) await r.context().close();
    }
    await q.reload(); await q.waitForSelector("#go-d");
    check("遊び方を Esc で閉じてすぐ読み直しても「見た」が残る（10回）・開き直しても出ない", bad === 0 && await q.locator("#howto[open]").count() === 0);
    await q.context().close();
    const o = await newPage();
    await o.waitForSelector("#howto[open]");
    await o.click("#howto-ok");
    check("「はじめる」を押したその場で「見た」が残る", await o.evaluate(() => __gg.load().tut) === true);
    await o.context().close();
  }
  check("ホームに今日のコツが出る", (await p.textContent("#tip")).includes("今日のコツ"));
  check("上級・とことん・練習は、はじめての日から押せる（鍵なし）", await p.locator("#go-h:not([disabled])").count() === 1 && await p.locator("#go-e:not([disabled])").count() === 1 && await p.locator("#go-p:not([disabled])").count() === 1);
  await p.click("#go-d");
  const tags = await p.evaluate(() => __gg.load().runs.d.list);
  check("今日の5問は日付から決まる（gen.js の dailyTags と同じ）", JSON.stringify(tags) === JSON.stringify(G.dailyTags(TODAY)));
  // 1問目（意味あて）：パーツの札と意味が見える
  check("意味あて：単語がパーツの札に分かれ、意味と生まれた言葉が見える・選び肢4つ", await p.locator(".word .seg").count() >= 2 && !(await p.textContent(".word")).includes("？？") && (await p.textContent(".word")).includes("語") && await p.locator(".ch").count() === 4);
  check("パーツの札には読み上げ用の名前がある", (await p.$$eval(".word .seg", (t) => t.filter((x) => !x.getAttribute("aria-label")).length)) === 0);
  await miss(p);
  check("まちがえると ✕ の印と「ちがう」の文字（色だけで分けない）・知らせは role=status", await p.locator(".ch.ng").count() === 1 && (await p.evaluate(() => getComputedStyle(document.querySelector(".ch.ng"), "::after").content)).includes("ちがう") && (await p.getAttribute("#msg", "role")) === "status");
  await p.reload(); await p.waitForTimeout(150); await p.click("#go-d");
  check("途中で閉じても続きから（同じ問題・まちがえた印のまま）", await p.locator(".ch.ng").count() === 1 && await p.evaluate(() => __gg.cur().i) === 0);
  await solve(p);
  check("正解すると ✓ の印・語源の説明と出典・★2（まちがい1回）", await p.locator(".ch.ok").count() === 1 && (await p.textContent(".verdict .why")).includes("＋") && await p.locator(".verdict .src a[href^='https://www.etymonline.com/word/']").count() === 1 && (await p.getAttribute(".verdict .stars", "aria-label")) === "星2つ");
  await p.click("#next");
  // 2問目：ヒント
  await p.click("#hint");
  check("ヒント1は注目するパーツを言う（選び肢は消さない）", (await p.textContent("#hintbox")).includes("💡") && await p.locator(".ch.ng").count() === 0);
  await p.click("#hint");
  check("ヒント2はまちがいの選び肢を消し、2つにしぼる・ヒントは2回まで", await p.locator(".ch.ng").count() === 2 && await p.locator("#hint:disabled").count() === 1);
  await solve(p);
  check("ヒント2回は★1", (await p.getAttribute(".verdict .stars", "aria-label")) === "星1つ");
  await p.click("#next");
  // 3問目：組み立て
  check("組み立て：意味と言いかえ・空きます・パーツの札6枚（生まれた言葉の字も付く）", (await curOf(p)).kind === "b1" && await p.locator(".slot").count() >= 2 && await p.locator(".card").count() === 6 && await p.locator(".card .lang").count() === 6);
  await miss(p);
  check("組み立て：入っていない札を押すと ✕ と知らせ", await p.locator(".card.ng").count() === 1 && (await p.textContent("#msg")).includes("入っていません"));
  { const c = await curOf(p); await p.click(`.card[data-j="${c.cards.indexOf(c.ans[c.ans.length - 1])}"]`); }
  check("組み立て：正しい札を押すと、その場所のますに入る（✓）", await p.locator(".slot.got").count() === 1 && await p.locator(".card.used").count() === 1);
  await p.reload(); await p.waitForTimeout(150); await p.click("#go-d");
  check("組み立て：途中で閉じても、置いた札とまちがえた札のまま", await p.locator(".slot.got").count() === 1 && await p.locator(".card.ng").count() === 1);
  await solve(p);
  await p.click("#next");
  await solve(p); await p.click("#next");
  // 5問目：見やぶり（あれば）
  const last = await curOf(p);
  if (last.kind === "g2") {
    check("見やぶり：パーツの意味をかくす（？？）", (await p.textContent(".word")).includes("？？"));
    await p.click("#hint");
    check("見やぶり：ヒント1でパーツの意味が出る", !(await p.textContent(".word")).includes("？？"));
    await solve(p);
  } else await solve(p);
  await p.click("#next"); await p.waitForTimeout(150);
  const s1 = await mem(p);
  const expM = [1, 2, 1, 0, last.kind === "g2" ? 1 : 0];
  check("5問で結果：今日の記録に1問ごとのまちがい＋ヒントの数", JSON.stringify(s1.days[TODAY]?.m) === JSON.stringify(expM), JSON.stringify(s1.days[TODAY]?.m));
  const share = await p.textContent(".share");
  const answers = tags.map((t) => WORDS[+t.split("|")[1]]);
  check("シェアの文に単語・答えを出さない（印だけ）", /第\d+回/.test(share) && /🔶/.test(share) && !answers.some((w) => share.includes(w.w) || share.includes(w.ja)));
  check("まちがいのある日は Ko-fi の一言を出さない", await p.locator(".kofi").count() === 0);
  check("結果に今日の単語と語源・あと少しの実績・続けて遊ぶ・上級のボタン", await p.locator("#rlist > div").count() === 5 && await p.locator("#achnext").count() === 1 && await p.locator("#go-e").count() === 1 && await p.locator("#go-h").count() === 1);
  check("パーツ帳に解いた単語のパーツが載る", Object.keys(s1.dex).length === 5);
  await p.click("#back");
  check("今日を終えたら、ホームは「今日の結果を見る」", (await p.textContent("#go-d")).includes("結果"));
  // 上級
  await p.click("#go-h");
  check("上級はヒントのボタンが無い・見やぶり3問", await p.locator("#hint").count() === 0 && JSON.stringify(await p.evaluate(() => __gg.load().runs.h.list)) === JSON.stringify(G.hardTags(TODAY)));
  for (let i = 0; i < 3; i++) { await solve(p); await p.click("#next"); }
  await p.waitForTimeout(100);
  check("上級の記録は hdays に入る", (await mem(p)).hdays[TODAY]?.m.length === 3);
  // 練習
  await p.click("#back");
  const before = await mem(p);
  await p.click("#go-p"); await p.click('.lv button[data-k="b1"]');
  const plist = await p.evaluate(() => __gg.load().runs.p.list);
  check("練習：選んだ種類で5問・まだ解いていない単語から", plist.length === 5 && plist.every((t) => t.startsWith("b1|")) && plist.every((t) => !before.dex[t.split("|")[1]]));
  for (let i = 0; i < 5; i++) { await solve(p); await p.click("#next"); }
  await p.waitForTimeout(100);
  const after = await mem(p);
  check("練習は今日の記録を増やさない（パーツ帳の数はふえる）", JSON.stringify(after.days) === JSON.stringify(before.days) && Object.keys(after.dex).length === Object.keys(before.dex).length + 5);
  await p.click("#go-dex");
  const nGot = await p.locator(".book button").count();
  check("パーツ帳：出会ったパーツが載り、まだのものは「？」", nGot >= 8 && await p.locator(".book .no").count() === Object.keys(PARTS).length - nGot);
  const pid = await p.getAttribute(".book button", "data-p");
  await p.click(".book button");
  check("パーツ帳のパーツを押すと、そのパーツを使う単語で練習", (await p.evaluate(() => __gg.load().runs.p.list)).every((t) => G.idsOf(WORDS[+t.split("|")[1]]).includes(pid)));
  // とことん：まちがえても終わらない・降りるまで
  await p.click("#back"); await p.click("#go-e");
  const e0 = await p.evaluate(() => __gg.load().runs.e);
  check("とことんは意味あて5 → 組み立て10 から始まり、ライフ・チケットが無い", e0.list.slice(0, 5).every((t) => t.startsWith("g0|")) && e0.list.slice(5, 15).every((t) => t.startsWith("b1|")) && !("life" in e0) && await p.locator("#quit").count() === 1);
  await solve(p); await p.click("#next");
  await solve(p, { wrong: 3 }); await p.click("#next");
  await p.click("#hint"); await p.click("#hint"); await solve(p); await p.click("#next");
  check("とことん：まちがい・ヒントがいくつあっても続く", await p.evaluate(() => __gg.load().runs.e.res.length) === 3 && await p.locator(".ch, .card").count() > 0);
  await p.reload(); await p.waitForTimeout(150);
  check("とことん：閉じても続きから", (await p.textContent("#go-e")).includes("続きから"));
  await p.click("#go-e"); await solve(p); await p.click("#next");
  await p.click("#quit"); await p.waitForTimeout(100);
  check("とことん：「ここで降りる」で終わり、一度で解いた数を自己ベストに（4問中2問）", (await mem(p)).ebest === 2 && (await p.textContent("#eres")).includes("4問") && (await p.textContent("#ebest")).includes("2問"));
  await p.click("#back");
  check("とことんの回を降りたら、ホームは新しく始めるボタン", !(await p.textContent("#go-e")).includes("続きから"));
  // 実績・このゲームについて
  await p.click("#go-ach");
  check("実績は14個で、腕前・集める・続けるの3つの組", await p.locator(".ach").count() === 14 && await p.locator(".agrp").count() === 3 && await p.locator(".ach.got").count() >= 2);
  check("達成した実績は ✓ の文字も付く（色だけで分けない）", (await p.textContent(".ach.got b")).startsWith("✓"));
  await p.click("#back"); await p.click("#f-about");
  check("このゲームについて：語源の出典と研究の出典", (await p.textContent("#about")).includes("Online Etymology Dictionary") && await p.locator("#about a").count() >= 4);
  await p.context().close();

  // とことんの並びを何百回：1つの並びの中で同じ組が出ない・続けて同じ単語が出ない・全部の組が入る
  {
    const q = await newPage(); await closeHow(q);
    const r = await q.evaluate(() => { const bad = []; let len = 0; for (let n = 0; n < 300; n++) { const l = __gg.endlessList(n % 7); len = l.length; const ks = l.map((t) => t.split("|").slice(0, 2).join("|")); if (new Set(ks).size !== ks.length) bad.push("dup" + n); const w = l.map((t) => t.split("|")[1]); for (let i = 1; i < w.length; i++) if (w[i] === w[i - 1]) { bad.push("adj" + n); break; } if (w[0] === String(n % 7)) bad.push("join" + n); } return { bad, len }; });
    const total = G.KINDS.reduce((a, k) => a + G.combos(k.id).length, 0);
    check("とことんの並び（300回）：同じ組を出さない・同じ単語を続けない・前の並びの最後の単語から始めない・全部の組が入る", r.bad.length === 0 && r.len === total, `${r.bad.slice(0, 5).join(",")} 長さ${r.len}/${total}`);
    // 記録の形を直す：細工した値を画面に HTML として出さない
    await q.evaluate(() => { const s = JSON.parse(localStorage.getItem("gogen-v1")) || { v: 1 }; s.ebest = '<img id="xss" src=x>'; s.dex = { 3: '"><b id="xss2">', constructor: 1, 99999: 1 }; s.runs = { h: { list: "bad", res: [] }, p: { mode: "p", id: "y", date: "2026-11-07", list: ["constructor|1|x"], res: [] }, d: { mode: "d", id: "z", date: "x", list: ["g0|1|x"], res: [] }, "a:2026-11-07": { mode: "a", id: "a1", date: "2026-11-07", list: ["g0|1|x", "g0|2|x"], res: [{ m: 0 }], cur: { i: 1, tag: "g0|2|x", wrong: "x", hints: 0 } }, e: { mode: "e", id: "e", date: "2026-11-07", list: ["b1|2|x", "g0|99999|x"], res: [] }, x: { id: "x", date: "2026-11-07", list: ["g0|1|x"], res: [{ m: 0 }] }, "a:2026-11-01": { mode: "d", id: "w", date: "2026-11-07", list: ["g0|1|x"], res: [] } }; s.days = { "2026-11-07": { m: "x" }, bad: { m: [0] }, "2026-02-30": { m: [0] } }; localStorage.setItem("gogen-v1", JSON.stringify(s)); });
    await q.reload(); await q.waitForTimeout(250);
    const st = await q.evaluate(() => __gg.load());
    check("記録の形を直す：数の所の文字は0に・知らない単語・形のちがう途中経過（モードの無いもの・置き場所とモードが合わないものも）と日ごとの記録は捨てる", st.ebest === 0 && st.dex[3] === 0 && !Object.hasOwn(st.dex, "constructor") && !Object.hasOwn(st.dex, "99999") && !("h" in st.runs) && !("p" in st.runs) && !("d" in st.runs) && !("e" in st.runs) && !("x" in st.runs) && !("a:2026-11-01" in st.runs) && st.runs["a:2026-11-07"] && st.runs["a:2026-11-07"].cur === null && Object.keys(st.days).length === 0, JSON.stringify(st).slice(0, 380));
    await q.click("#go-dex").catch(() => {}); await q.waitForTimeout(150);
    check("記録の文字を HTML として出さない", await q.locator("#xss, #xss2").count() === 0);
    await q.context().close();
  }

  // まちがいなしの日は Ko-fi を1回だけ
  {
    const q = await newPage(); await closeHow(q); await q.click("#go-d");
    for (let i = 0; i < 5; i++) { await solve(q); await q.click("#next"); }
    await q.waitForTimeout(150);
    check("全部まちがいなしで初めて終えたときだけ Ko-fi の一言", await q.locator(".kofi").count() === 1 && (await q.textContent(".big")).includes("まちがいなし"));
    await q.click("#back"); await q.click("#go-d");
    check("結果をもう一度見ても Ko-fi は出さない", await q.locator(".kofi").count() === 0);
    await q.context().close();
  }

  // カレンダー・あとから：過去の日の記録を置いて見る
  {
    const q = await newPage();
    await q.evaluate(([d2, d3]) => { localStorage.setItem("gogen-v1", JSON.stringify({ v: 1, tut: true, days: { [d2]: { m: [0, 0, 0, 0, 0], k: [] }, [d3]: { m: [1, 0, 0, 2, 0], k: [] } }, hdays: {}, adays: {}, dex: {}, runs: {}, kofi: {}, ach: {}, ebest: 0 })); }, [dayBefore(2), dayBefore(3)]);
    await q.reload(); await q.waitForTimeout(150);
    check("ホームの「続けて」は、きのうを休んだら — （休んだ日を責めない）", (await q.textContent(".stats")).includes("—"));
    await q.click("#go-cal");
    const lateList = await q.evaluate(() => __gg.lateDays(__gg.load()));
    const exp = [1, 4, 5, 6, 7].map(dayBefore).filter((d) => d >= G.EPOCH);
    check("カレンダー：取りこぼした過去7日（第1回より後）を押せる", JSON.stringify(lateList) === JSON.stringify(exp), lateList.join(","));
    if (lateList.length) {
      const d = lateList[0];
      if (d.slice(0, 7) !== TODAY.slice(0, 7)) await q.click("#prev");
      await q.click(`.cal .miss[data-k="${d}"]`);
      check("あとから：その日の今日の5問と同じ問題", JSON.stringify(await q.evaluate((d) => __gg.load().runs["a:" + d].list, d)) === JSON.stringify(G.dailyTags(d)));
      for (let i = 0; i < 5; i++) { await solve(q); await q.click("#next"); }
      await q.waitForTimeout(150);
      const s = await mem(q);
      check("あとからは adays に入り、今日の記録・続けた日・シェア・Ko-fi には数えない", s.adays[d] && !s.days[d] && (await q.locator(".share").count()) === 0 && (await q.locator(".kofi").count()) === 0);
    } else check("カレンダー：第1回の日はあとから遊べる日が無い", lateList.length === 0);
    await q.context().close();
  }

  // 別のタブでヒントを使ったあと、この画面で正解しても、そのヒントを★に入れる
  {
    const q = await newPage(); await closeHow(q); await q.click("#go-h");
    await q.evaluate(() => { const s = JSON.parse(localStorage.getItem("gogen-v1")); const r = s.runs.h; r.cur = { i: 0, tag: r.list[0], wrong: [], got: [], hints: 2 }; localStorage.setItem("gogen-v1", JSON.stringify(s)); });
    await solve(q);
    check("別のタブで使ったヒントも、正解したときの★に入れる（★3にしない）", (await q.evaluate(() => __gg.load().runs.h.res[0].m)) >= 2 && !(await q.textContent(".verdict .hd")).includes("★★★"));
    await q.context().close();
  }
  // あとから：開いたまま期限（過去7日）を過ぎたら、答えを受け付けずホームへ
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 800 } });
    const later = START + 3 * 864e5; await ctx.clock.setFixedTime(later);
    const q = await newPage(390, ctx); await closeHow(q);
    const d = await q.evaluate(() => __gg.lateDays(__gg.load())[0]);
    if (d) {
      await q.click("#go-cal"); await q.click(`.cal .miss[data-k="${d}"]`);
      await ctx.clock.setFixedTime(later + 9 * 864e5);
      const c = await curOf(q);
      if (c.kind === "b1") await q.click(`.card[data-j="${c.cards.indexOf(c.ans[0])}"]`); else await q.click(`.ch[data-j="${c.opts.indexOf(c.ans)}"]`);
      await q.waitForTimeout(150);
      check("あとから：開いたまま期限を過ぎたら答えを受け付けない（記録に入れず、途中経過も消す）", !(await q.evaluate((d) => __gg.load().adays[d], d)) && !(await q.evaluate((d) => __gg.load().runs["a:" + d], d)) && await q.locator("#go-d").count() === 1);
    } else check("あとから：期限の検査に使う日がある", false);
    await ctx.close();
  }

  // 古いタブ：同じ問題を2つのタブで開き、片方で答えたら、もう片方は二重に入れない
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 800 } });
    await ctx.clock.setFixedTime(START);
    const a = await newPage(390, ctx); await closeHow(a); await a.click("#go-d");
    const b = await ctx.newPage(); b.on("pageerror", (e) => errors.push(e.message)); await b.goto(url); await b.waitForTimeout(150); await b.click("#go-d");
    await solve(a);
    { const c = await curOf(b); await b.click(`.ch[data-j="${c.opts.indexOf(c.ans)}"]`); }
    await b.waitForTimeout(200);
    const s = await mem(a);
    check("古いタブで同じ問題に答えても二重に数えない", s.runs.d.res.length === 1 && Object.values(s.dex).reduce((x, y) => x + y) === 1);
    await a.click("#next"); await b.goto(url); await b.waitForTimeout(150); await b.click("#go-d");
    await a.click("#hint"); await a.click("#hint");
    await b.click("#hint");
    check("別のタブで使ったヒントの数を減らさない", (await mem(a)).runs.d.cur.hints === 2);
    await ctx.close();
  }

  // スマホ幅・大きい文字でもはみ出さない・押す所は44px以上
  {
    const bad = [], small = [];
    for (const [w, fs] of [[320, 3], [390, 2], [320, 1]]) {
      const q = await newPage(w); await closeHow(q);
      await q.evaluate((fs) => localStorage.setItem("gogen-fs", String(fs)), fs); await q.reload(); await q.waitForTimeout(150);
      for (const go of [null, "#go-d", "solve", "solve2", "solve3", "#go-cal", "#go-dex", "#go-ach", "#go-e"]) {
        if (go && go.startsWith("solve")) { if (go !== "solve") await q.click("#next"); await solve(q); }
        else if (go) { await q.goto(url); await q.waitForTimeout(100); await q.click(go); }
        await q.waitForTimeout(100);
        const ov = await q.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        if (ov > 0) bad.push(`${w}px 文字${fs} ${go || "ホーム"} ${ov}px`);
        small.push(...(await q.$$eval("button:not([disabled]), a[href]", (bs) => bs.filter((b) => b.checkVisibility() && !b.closest(".cal")).filter((b) => b.getBoundingClientRect().height < 44).map((b) => (b.id || b.className || b.textContent).slice(0, 20) + "=" + b.getBoundingClientRect().height.toFixed(1) + "px"))).map((x) => `${w}/${fs}/${go}:${x}`));
      }
      await q.context().close();
    }
    check("幅320px・とても大きい文字でも横にはみ出さない", bad.length === 0, bad.join(" / "));
    check("押せる所は高さ44px以上", small.length === 0, [...new Set(small)].slice(0, 8).join(","));
  }

  // 見やすさの設定を全部入れても、ページの一番下まで動ける
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 700 } });
    await ctx.clock.setFixedTime(START);
    await ctx.addInitScript(() => localStorage.setItem("a11y-v1", JSON.stringify({ read: true, cvd: true, calm: true, say: true, ruby: true })));
    const q = await newPage(390, ctx); await closeHow(q);
    const r = await q.evaluate(() => { window.scrollTo(0, 1e5); const f = document.querySelector("footer").getBoundingClientRect(); return [scrollY, Math.round(f.bottom), innerHeight, getComputedStyle(document.documentElement).position]; });
    check("見やすさの設定を全部入れても、いちばん下まで動ける（html が固定されない）", r[0] > 0 && r[1] <= r[2] && r[3] === "static", r.join(","));
    await ctx.close();
  }
  // キーボードだけで遊べる（Tab と Enter）
  {
    const q = await newPage(); await closeHow(q);
    await q.focus("#go-d"); await q.keyboard.press("Enter"); await q.waitForTimeout(100);
    const c = await curOf(q);
    await q.focus(`.ch[data-j="${c.opts.indexOf(c.ans)}"]`); await q.keyboard.press("Enter"); await q.waitForTimeout(100);
    check("キーボードだけで選んで答えられる", await q.locator(".verdict").count() === 1);
    await q.context().close();
  }
} catch (e) { check("ブラウザでの検査が最後まで動く", false, e.stack.split("\n").slice(0, 3).join(" ")); }

// 引き継ぎコード（shared-workflows template/qa/transfer-check.mjs）
try {
  const sample = { "gogen-v1": JSON.stringify({ v: 1, tut: true, days: { "2026-11-07": { m: [0, 1, 0, 0, 2], k: ["g0|1", "g0|2", "b1|3", "b1|4", "g2|5"] } }, hdays: {}, adays: {}, dex: { 1: 1, 2: 1, 3: 1, 4: 1, 5: 1 }, runs: {}, kofi: {}, ach: {}, ebest: 7, t: 1 }), "gogen-fs": "2" };
  await checkTransfer({ browser, url, game: "gogen-suiri", sample, check, open: async (pg) => { if (await pg.locator("#howto[open]").count()) await pg.click("#howto-ok"); } });
} catch (e) { check("引き継ぎの検査が最後まで動く", false, e.message.split("\n")[0]); }
  { const c = await browser.newContext(); const r = await c.newPage(); const big = []; // 題が h1{flex:1} で縦に伸び（伸びない形と比べて4pxより高ければ失敗）、iPad の縦で大きなすき間が出た（shared-workflows incidents/2026-11-07-title-stretched.md）
    for (const [w, h] of [[820, 1180], [390, 844], [1280, 800]]) { await r.setViewportSize({ width: w, height: h }); await r.goto(url); await r.waitForTimeout(200); await r.keyboard.press("Escape"); await r.waitForTimeout(100);
      const v = await r.evaluate(() => { const e = [...document.querySelectorAll(".title")].find((x) => x.offsetParent); if (!e) return null; const h = e.getBoundingClientRect().height; const f = e.style.flex; e.style.flex = "none"; const n = e.getBoundingClientRect().height; e.style.flex = f; return h - n; });
      if (v === null || v > 4) big.push(`${w}x${h}:${v === null ? "題なし" : "+" + Math.round(v) + "px"}`); }
    check("ホームの題は縦長の画面でも縦に伸びない（820×1180・390×844・1280×800）", big.length === 0, big.join(" ")); await c.close(); }
await browser.close();
server.close();
check("画面のエラーが無い", errors.length === 0, errors.slice(0, 3).join(" | "));

{ // 見やすさ・読みやすさ・偏り（shared-workflows template/qa/a11y.mjs の写し）
  const { spawnSync } = await import("node:child_process");
  const a = spawnSync(process.execPath, [path.join(root, "qa", "a11y.mjs")], { encoding: "utf8", env: process.env });
  check("見やすさ・読みやすさの検査（qa/a11y.mjs。中身は qa-report/a11y.md）", a.status === 0, (a.stdout.match(/^- ❌.*$/gm) || []).join(" / ") || (a.status ? a.stderr.slice(-300) : ""));
}

const ng = results.filter((r) => !r.ok);
const md = `# 語源すいり QA\n\n${results.map((r) => `- ${r.ok ? "✅" : "❌"} ${r.name}${r.detail ? `（${r.detail}）` : ""}`).join("\n")}\n\n${ng.length ? `❌ ${ng.length}件` : `✅ ${results.length}項目すべて通過`}\n`;
mkdirSync(path.join(root, "qa-report"), { recursive: true });
writeFileSync(path.join(root, "qa-report/report.md"), md);
console.log(md);
process.exit(ng.length ? 1 : 0);

// SNS で貼られたときの絵（og.png 1200×630）を作る。今日の問題（答え）は入れず、遊び方の例（tele＋scope＝？）だけ。
// 使い方: node tools/make-og.cjs（qa/ の playwright を使う）
const path = require("path");
const { chromium } = require(path.join(__dirname, "..", "qa", "node_modules", "playwright"));
(async () => {
  const b = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  const p = await b.newPage({ viewport: { width: 1200, height: 630 } });
  const seg = (en, ja, ask) => `<div style="min-width:230px;padding:18px 26px 14px;box-sizing:border-box;display:flex;flex-direction:column;align-items:center;border-radius:22px;background:${ask ? "#fff7f3" : "#e8f0fb"};border:${ask ? "6px dashed #b23c26" : "6px solid #1d4f91"}"><div style="font-family:Georgia,'DejaVu Serif',serif;font-size:84px;font-weight:700;color:${ask ? "#b23c26" : "#1f2a44"};line-height:1">${en}</div><div style="font-size:36px;font-weight:900;margin-top:10px;color:#1f2a44">${ja}</div></div>`;
  const plus = (t) => `<div style="font-size:70px;font-weight:900;color:#4f566a">${t}</div>`;
  await p.setContent(`<body style="margin:0;font-family:'Noto Sans CJK JP','IPAPGothic',sans-serif">
  <div style="width:1200px;height:630px;box-sizing:border-box;padding:56px 80px;background:#f3ecdc;background-image:repeating-linear-gradient(transparent 0 46px,#e2d7bd 46px 48px);border-left:28px solid #b23c26;color:#1f2a44">
    <div style="font-size:34px;color:#86291a;letter-spacing:.08em">英語を知らなくても遊べる・1日5問</div>
    <div style="font-size:112px;font-weight:900;margin-top:4px;letter-spacing:.1em;color:#142a52">語源<span style="color:#b23c26">すいり</span></div>
    <div style="font-size:38px;margin-top:2px">英単語をパーツに分けて、意味を推理する</div>
    <div style="display:flex;gap:22px;align-items:center;margin-top:36px">${seg("tele", "遠く")}${plus("+")}${seg("scope", "見る")}${plus("=")}${seg("?", "なに？", 1)}</div>
  </div></body>`);
  await p.screenshot({ path: path.join(__dirname, "..", "og.png") });
  await b.close();
})();

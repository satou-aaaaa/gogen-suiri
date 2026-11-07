// アプリのアイコン（icon-192.png・icon-512.png）を作る。生成りの辞書の頁に、朱の帯と「語」の札。
// 使い方: node tools/make-icons.cjs（qa/ の playwright を使う）
const path = require("path");
const { chromium } = require(path.join(__dirname, "..", "qa", "node_modules", "playwright"));
(async () => {
  const b = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  for (const s of [192, 512]) {
    const p = await b.newPage({ viewport: { width: s, height: s } });
    await p.setContent(`<body style="margin:0"><svg width="${s}" height="${s}" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
      <rect width="100" height="100" fill="#f3ecdc"/>
      <rect x="0" y="0" width="12" height="100" fill="#b23c26"/>
      <rect x="20" y="20" width="32" height="34" rx="6" fill="#e8f0fb" stroke="#1d4f91" stroke-width="3"/>
      <text x="36" y="44" font-size="17" text-anchor="middle" fill="#1f2a44" font-family="Georgia,'DejaVu Serif',serif" font-weight="700">Aa</text>
      <text x="58" y="44" font-size="14" text-anchor="middle" fill="#4f566a" font-family="sans-serif" font-weight="900">+</text>
      <rect x="64" y="20" width="28" height="34" rx="6" fill="#fff7f3" stroke="#b23c26" stroke-width="3" stroke-dasharray="5 3"/>
      <text x="78" y="44" font-size="18" text-anchor="middle" fill="#b23c26" font-family="sans-serif" font-weight="900">?</text>
      <text x="56" y="84" font-size="21" text-anchor="middle" fill="#142a52" font-family="'Noto Sans CJK JP',sans-serif" font-weight="900">語源</text></svg></body>`);
    await p.screenshot({ path: path.join(__dirname, "..", `icon-${s}.png`), clip: { x: 0, y: 0, width: s, height: s } });
  }
  await b.close();
})();

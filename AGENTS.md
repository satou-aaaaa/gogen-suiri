# AGENTS.md

語源すいり：英単語をパーツ（接頭辞・語根・接尾辞）に分け、パーツの意味から単語の意味を推理する1日5問のゲーム。英語の知識がなくても遊べるように作る。`index.html` と `data.js`（パーツと単語）・`gen.js`（問題の作り方）を GitHub Pages で公開する。

## 準備（最初に一度）

```bash
bash scripts/setup.sh   # Node.js（版は .nvmrc）を確かめ、検査の依存とブラウザを入れる。何度実行してもよい
```

## push する前の確認

```bash
node qa/run.mjs   # データの形・全部の単語×3種類の問題・色で答えが分からないか・今日の5問と上級（3年分）・過去の日の問題が変わらないか・通しで遊ぶ・とことん・練習・続きから・古いタブ・あとから・スマホ幅・PWA・引き継ぎ・見やすさ（CI の QA と同じ）
```

## このリポジトリの決まり

- 語源は Online Etymology Dictionary（https://www.etymonline.com/）で確かめてから足す。パーツの意味（`PARTS` の1つ目）は子どもにも分かる短い日本語にし、単語の言いかえ `d` はパーツの意味をつないだ言葉にする。語源の説が分かれる単語・パーツに分けると意味が遠くなる単語は入れない（2026-11-07 video・revise を外した）。
- `PARTS` は `[意味, 生まれた言葉（G ギリシャ・L ラテン・E 英語・F フランス・I イタリア）, 綴りの形]`。単語 `WORDS` は `[単語, "パーツ|パーツ"（綴りがパーツの形と合わないときは "綴り:id"）, 日本語, 言いかえ, なかま, ひとこと]`。単語の綴りはパーツをつなげたものと同じにする（QA が見る）。
- 単語は最後に足すだけにし、並べ替え・途中の削除をしない（番号で今日の5問を作る。記録の図鑑も番号）。今日の5問・上級に使うのは前から `DAILY_N`（158）語だけ。単語を足しても `DAILY_N` を変えなければ過去の日の問題は変わらない（QA が `qa/daily-snapshot.json` と比べる）。`DAILY_N`・`EPOCH`・`gen.js` の作り方を変えると過去の日も変わるので、変えた PR に一言書く。
- 問題は3種類：意味あて（`g0`、パーツの意味が見える）・組み立て（`b1`、意味からパーツの札を選ぶ。まぎらわしい札は意味が重ならず、色＝生まれた言葉が答えと同じものを先に置く。色だけで答えが分かる問題を作らない。QA が見る）・見やぶり（`g2`、パーツの意味をかくす。どのパーツもほかの単語で出会えるもの `canHide` だけ）。
- 今日の5問（意味あて2・組み立て2・見やぶり1）・上級（見やぶり3、今日の5語と重ねない）は日本時間の日付の種で決まり、だれでも同じ。`Math.random()` は練習・とことんの並びだけ（QA が数を見る）。乱数は `sort` の比較の中で引かない。少し遅れて動く処理（setTimeout）は、画面が替わっていたら何もしない。
- ★はまちがい＋ヒントの数（0で★3・1で★2・2以上で★1）。ヒントは1回目が「見るところ」、2回目がまちがいを消して2つにしぼる。正解したら必ず「パーツ（意味）＋…＝言いかえ」の答え合わせを出す。上級はヒントなし。時間制限は付けない。まちがえても選び直せる。
- 好きなだけ遊べる：チケット・回数制限・🔒で開くモードを入れない（2026-11-06 satou さん。寄付で成り立たせるため）。上級・練習・とことんははじめての日から遊べる（今日の5問・上級は1日1回）。
- とことん（`runs.e`）：意味あて5→組み立て10→残りの全部の組を毎回ちがう並びで出す（同じ単語を続けない）。まちがえても終わらず、「ここで降りる」まで続く。一度で解いた数の自己ベスト `ebest`。今日の記録・連続・Ko-fi・シェアには数えない（単語帳には載る）。他の人との順位は出さない。
- 記録 `gogen-v1`（文字の大きさは別の `gogen-fs`）。`load` は合わせる前に両側を `fresh()` で補い、知らない入れ物を消さない。保存の前に読み直す。途中経過はモードごと（`runs.d`・`runs.h`・`runs.p`・`runs.e`・`runs["a:日付"]`）で、書き込む前に保存した回がこの画面と同じか確かめる（shared-workflows `incidents/2026-11-04-daily-game-save-gaps.md`）。
- 実績（`ACH`、14個）は記録から毎回数え、新しく残すのは知らせ終えた印 `ach` だけ。続けるは合計の日数。連続の日は1以上のときだけ出す（休んだ日を責めない）。取りこぼした日（きのう〜7日前、`EPOCH` から）はカレンダーから「あとから」遊べる（記録は `adays`。連続・今日の記録・Ko-fi・シェアには数えない）。
- 毎日「語源のコツ」（`TIPS` 7つ）を1つ出す。研究の出典（語の形を学ぶ指導：Bowers 2010・Goodwin & Ahn 2013）は「このゲームについて」に置く。効果を言い切らない。
- 英語の読み上げ（🔊）は端末の声だけを使う（外へ通信しない）。英語の声が無い端末ではボタンを出さない。
- 文字は少なめ・一画面一問。お笑いの言葉は入れない（QA が見る）。ほかの作品の名前・キャラ・見た目は使わない。
- 共有は遊ぶ人が押したときに開くリンク（X・LINE・Web Share・コピー）だけ。シェアの文に単語・答えを出さない。
- 感想は「感想を送る」から GitHub の Issue フォーム（`.github/ISSUE_TEMPLATE/feedback.yml`、name は「感想フォーム」）を開くだけ。名前・メールは聞かない。週1で shared-workflows `routines/game-feedback.md` が読んで直す。
- 応援は Ko-fi（https://ko-fi.com/satouaaaaa）へのただのリンクだけ。今日の5問・上級を初めて終えて全部まちがいなしのときだけ、結果の画面の下に1行。遊ぶのは無料のまま、有料版は置かない。
- 外へ通信しない。外から読むのは Google Fonts の文字だけ（CSP の `connect-src 'self'` を広げない）。記録は遊ぶ人のブラウザ（localStorage）だけ。
- 見やすさ：`</head>` の前の見やすさの設定（`<!-- a11y:begin -->`〜`end`）は shared-workflows `template/a11y/a11y.html` の写し、`qa/a11y.mjs` は `template/qa/a11y.mjs` の写しで、ここでは直さない。色だけで分けない（パーツの札は色に加えて「ギ」「ラ」などの字、正解は ✓、まちがいは ✕ と破線）・コントラスト 4.5:1・知らせは aria-live・決めつけの言葉を使わない（shared-workflows `routines/game-dev.md`「だれでも遊べるように」）。押せる所は高さ44px以上。
- 引き継ぎ：`transfer.js` と `qa/transfer-check.mjs` は shared-workflows `template/` の写しで、ここでは直さない。`data-keys` は `gogen-v1,gogen-fs`（a11y-v1 は入れない）。記録の形を変えたら QA の `sample` も合わせる。
- 機能を足す・直すたびに `qa/run.mjs` に検査を足す。乱数で組む部分は何年分も作って確かめる（shared-workflows `incidents/2026-10-31-roppo-empty-village.md`）。
- PWA（`manifest.webmanifest`・`sw.js`・`icon-*.png`）：画面のファイルを足したら `sw.js` の `SHELL` にも足し、中身を大きく変えたら `CACHE` の版を上げる。アイコンは `node tools/make-icons.cjs`、SNS 用の絵 `og.png` は `node tools/make-og.cjs`（今日の問題を入れない）。
- 公開リポジトリなので、個人情報・鍵を入れない。

## 公開

- GitHub Pages は `main` のルート（`/`）を公開する。PR の QA と Secret scan が ✅ になると `automerge.yml` が自動でマージする。止めたいときは下書きにするか、ラベル「自動マージしない」を付ける。
- `sw.js`・`manifest.webmanifest`・`data.js`（語源）を変える PR は自動ではマージされない（`hold_paths`）。CodeRabbit のレビューを待ち、手でマージする直前に今の head へのレビューを読み直す（shared-workflows `incidents/2026-11-01-roppo-merged-before-review.md`）。CodeRabbit は PR に `@coderabbitai review` とコメントして頼む。

## 共通のきまり

- PR の作り方・マージの仕方は satou-aaaaa/shared-workflows の `routines/pr.md`、全体のきまりは `routines/common.md` に従う。
- CI の部品は shared-workflows の共通部品を呼ぶ。リポジトリ側の .github/workflows には呼び出しと設定値だけを書く。
- Claude 以外の AI・人が作業するときは、shared-workflows の `routines/tool-map.md` と `routines/without-claude.md` を読む。

# おきなわ修学旅行ナビ ページ一覧（スクリーンショット版）

[おきなわ修学旅行ナビ](https://education.okinawastory.jp/) の全ページ（日本語470・外国語版277）を、スクリーンショットの一覧で見られるようにしたものです。

## しくみ

- `public/pages.json` … ページの一覧（ページ名・URL・セクションなど）
- `scripts/shoot.mjs` … 全ページを開いて画面を撮影し、`public/shots/` に保存するプログラム
- `.github/workflows/screenshots.yml` … GitHub上で撮影プログラムを動かす設定
- `public/index.html` … サムネイルを並べて見る一覧ページ（Vercelで公開）

## 撮り直したいとき

1. GitHubのこのリポジトリで「Actions」タブを開く
2. 左の「ページを撮影」を選ぶ
3. 右の「Run workflow」→ 緑の「Run workflow」を押す

20〜30分ほどで撮影が終わり、自動でVercelのページに反映されます。
「まだ撮っていないページだけ撮る」にチェックを入れると、撮影に失敗したページだけを撮り直せます。

# lp-user-template

ユーザーのリポジトリ（`user/note-lp`）に配布されるテンプレート一式。

```
index.html        テンプレート本体（滅多に変わらない）
data/
  config.json     ブロック構成・テーマ・プロフィール設定
  articles.json   note記事一覧
  products.json   商品一覧
images/           アップロード画像
scripts/
  fetch-ogp.mjs   note記事URLからOGP・ハッシュタグ・投稿日を取得しarticles.jsonへ反映するスクリプト
.github/workflows/
  fetch-ogp.yml   ↑を実行するGitHub Actionsワークフロー（workflow_dispatch、入力: url）
```

## note記事の追加（fetch-ogp）

アプリ側は GitHub API 経由で以下のように起動する（仕様書6章参照）。

```
POST /repos/{owner}/{repo}/actions/workflows/fetch-ogp.yml/dispatches
body: { "ref": "main", "inputs": { "url": "https://note.com/..." } }
```

`scripts/fetch-ogp.mjs` はNode.js組み込みの`fetch`のみで動作し、追加の依存パッケージは不要。
同じURL（同じ記事ID）を再実行した場合は新規追加ではなく既存エントリを更新する。ただし `category` は既存の値を優先して保持する（ユーザーが編集済みの分類を上書きしないため）。

`index.html` は `../lp-template/main.js`（開発用の相対パス）を読み込んでいる。
実際に `user/note-lp` テンプレートとして配布する際は、CDN の絶対URLに差し替えること。

```html
<script src="https://heron-note.github.io/lp-template/main.js" defer></script>
```

## ローカル確認

`fetch()` で JSON を読むため `file://` では CORS エラーになる。
簡易 HTTP サーバー経由で確認する。

```bash
npx --yes serve . -l 4300
```

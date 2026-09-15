# lp-template

`heron-note.github.io/lp-template/` として公開する、LPの共通描画エンジン。

- `main.js` — `./data/config.json` / `articles.json` / `products.json` を読み込み、
  `config.json` の `blocks` 設定に従ってブロックを描画する。
- 開発者がこのファイルを更新すると、読み込んでいる全ユーザーの LP に即時反映される。
- ユーザーの `index.html` はほぼ変更せず、`<script src=".../lp-template/main.js">` を読むだけ。

## 対応ブロック（Phase 1）

`profile` / `featured` / `collection` / `portfolio` / `articles` / `categories` /
`search` / `products` / `image` / `links`

- `categories` と `search` は `articles` ブロックの表示をフィルタする（記事一覧と連動）。
- `portfolio` の項目は `config.json` の `portfolio` 配列（`{ image, title, url }`）から読む。
  データ構造は仕様書 13章の未確定事項のため、実装は暫定。
- `profile.icon` はプリセット3種（絵文字ベースのプレースホルダー）。実画像プリセットは未実装。

## 未実装（Phase 2 / 3 で対応）

- note記事URLからのOGP自動取得（GitHub Actions）
- 画像アップロード
- アプリ側の管理UI

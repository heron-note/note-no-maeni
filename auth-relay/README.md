# auth-relay

GitHub OAuth Device Flow の CORS 回避用の薄い中継サーバー（Cloudflare Workers）。
秘密情報は一切持たない。詳細は [docs/LP作成機能_仕様書.md](../docs/LP作成機能_仕様書.md) 3章参照。

## 事前準備: GitHub OAuth App の作成

1. GitHub → 右上のアイコン → **Settings** → 左メニュー最下部 **Developer settings**
2. **OAuth Apps** → **New OAuth App**
3. 入力項目:
   - **Application name**: 例）`noteのまえに LP連携`
   - **Homepage URL**: `https://heron-note.github.io/note-no-maeni/`
   - **Authorization callback URL**: Device Flow では実際には使わないが必須項目なので、Homepage URL と同じ値を入れておけばOK
4. **Register application** をクリック
5. 作成後の画面に表示される **Client ID** をコピーしておく（これは秘密情報ではない）
6. **重要**: 同じ画面に **Enable Device Flow** というチェックボックスがあるので、必ずONにして保存する（これを忘れると Device Flow が動かない）
7. Client Secret は生成不要（Device Flow では使わない）

## デプロイ方法（どちらか）

### 方法A: Cloudflareダッシュボードから（CLI不要・おすすめ）

1. Cloudflareダッシュボード → **Workers & Pages** → **Create** → **Create Worker**
2. 名前を `note-no-maeni-auth-relay` などにして作成
3. エディタ画面で [src/index.js](src/index.js) の中身を丸ごと貼り付けて **Deploy**
4. Worker の **Settings** → **Variables** → `GITHUB_CLIENT_ID` という名前で、上で取得した Client ID を値として追加（Secretではなく通常のVariableでよい）
5. 発行されたURL（例: `https://note-no-maeni-auth-relay.<自分のsubdomain>.workers.dev`）を控えておく → アプリ側の実装(Phase 3)で使用する

### 方法B: Wrangler CLI から

```bash
npm install -g wrangler
wrangler login
```

[wrangler.toml](wrangler.toml) の `GITHUB_CLIENT_ID` を実際の値に書き換えてから:

```bash
wrangler deploy
```

## 動作確認

デプロイ後、以下のように叩いて `device_code` 等が返ってくれば成功。

```bash
curl -X POST https://<your-worker-url>/device/code \
  -H "Content-Type: application/json" \
  -d '{"scope":"repo workflow"}'
```
